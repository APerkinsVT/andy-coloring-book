// api/bundles-create.ts
// POST /api/bundles-create
// Body: { sourceUrl|originalUrl, lineArtUrl, palette?, tips?, copyAssets? }

import { put } from "@vercel/blob";
import * as QRCode from "qrcode";
import { customAlphabet } from "nanoid";

const BASE =
  process.env.PUBLIC_BASE_URL ||
  (typeof process !== "undefined" && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

const nano = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 10);

type BundleBody = {
  sourceUrl?: string;      // accept either key
  originalUrl?: string;    // ^
  lineArtUrl?: string;
  palette?: any;
  tips?: any;
  copyAssets?: boolean;    // default true
};

// Robust body reader: supports Edge/Web Request, Node req/res, and dev proxies
async function readJsonBody(req: any): Promise<any> {
  // 1) already-parsed body (some frameworks/middleware)
  if (req && typeof req.body === "object" && req.body !== null) return req.body;

  // 2) Web Fetch Request (Edge / some dev setups)
  if (req && typeof req.text === "function" && typeof req.headers === "object") {
    const txt = await req.text();
    return txt ? JSON.parse(txt) : {};
  }

  // 3) Native .json()
  if (typeof req?.json === "function") {
    try { return await req.json(); } catch { /* fall through */ }
  }

  // 4) Node IncomingMessage stream
  try {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
      req.on("end", () => resolve());
      req.on("error", reject);
    });
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function fetchAsBuffer(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  const ab = await r.arrayBuffer();
  const buf = Buffer.from(ab);
  const contentType = r.headers.get("content-type") || "application/octet-stream";
  return { buf, contentType };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!BASE) return res.status(500).json({ error: "Missing PUBLIC_BASE_URL" });

    const body = (await readJsonBody(req)) as BundleBody;

    // Normalize keys: allow originalUrl OR sourceUrl
    const sourceUrl = body.sourceUrl || body.originalUrl || "";
    const lineArtUrl = body.lineArtUrl || "";
    const palette = body.palette ?? null;
    const tips = body.tips ?? null;
    const copyAssets = body.copyAssets !== false; // default true

    console.log("[bundles-create] received (normalized)", {
      sourceUrl,
      lineArtUrl,
      _raw: {
        sourceUrl: body.sourceUrl,
        originalUrl: body.originalUrl,
        lineArtUrl: body.lineArtUrl,
      },
    });

    if (!sourceUrl || !lineArtUrl) {
      return res.status(400).json({
        error: "Provide sourceUrl and lineArtUrl",
        received: {
          sourceUrl: !!sourceUrl,
          lineArtUrl: !!lineArtUrl,
          _raw: body,
        },
      });
    }

    const id = `pla-${nano()}`;
    const baseKey = `bundles/${id}`;

    let storedSourceUrl = sourceUrl;
    let storedLineArtUrl = lineArtUrl;

    // Copy assets into Blob so links never expire
    if (copyAssets) {
      try {
        const src = await fetchAsBuffer(sourceUrl);
        const putSrc = await put(`${baseKey}/source.jpg`, src.buf, {
          access: "public",
          contentType: src.contentType || "image/jpeg",
        });
        storedSourceUrl = putSrc.url;
      } catch (e) {
        console.warn(`[bundles-create] copy source failed: ${e}`);
      }

      try {
        const out = await fetchAsBuffer(lineArtUrl);
        const putOut = await put(`${baseKey}/lineart.jpg`, out.buf, {
          access: "public",
          contentType: out.contentType || "image/jpeg",
        });
        storedLineArtUrl = putOut.url;
      } catch (e) {
        console.warn(`[bundles-create] copy lineart failed: ${e}`);
      }
    }

    const createdAt = new Date().toISOString();
    const portalUrl = `${BASE}/p/${id}`;
    const manifest = {
      id,
      createdAt,
      portalUrl,
      sourceUrl: storedSourceUrl,
      lineArtUrl: storedLineArtUrl,
      palette,
      tips,
      model: {
        name: "google/nano-banana",
        version: process.env.REPLICATE_VERSION || "unknown",
      },
    };

    // Generate QR for the portal
    const qrDataUrl = await QRCode.toDataURL(portalUrl, {
      errorCorrectionLevel: "M",
      width: 600,
      margin: 0,
    });
    const qrBuf = Buffer.from(qrDataUrl.split(",")[1], "base64");

    const [putManifest, putQr] = await Promise.all([
      put(`${baseKey}/manifest.json`, JSON.stringify(manifest, null, 2), {
        access: "public",
        contentType: "application/json",
      }),
      put(`${baseKey}/qr.png`, qrBuf, {
        access: "public",
        contentType: "image/png",
      }),
    ]);

    return res.status(200).json({
      id,
      portalUrl,
      manifestUrl: putManifest.url,
      qrPngUrl: putQr.url,
    });
  } catch (err: any) {
    console.error("[bundles-create] crash:", err);
    return res
      .status(500)
      .json({ error: "bundles-create crashed", detail: err?.message || String(err) });
  }
}
