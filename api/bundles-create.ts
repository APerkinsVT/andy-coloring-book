// api/bundles-create.ts
// POST /api/bundles-create
// Body: { sourceUrl: string, lineArtUrl: string, palette?: any, tips?: any, copyAssets?: boolean }
// Returns: { id, portalUrl, manifestUrl, qrPngUrl }

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
  sourceUrl?: string;
  lineArtUrl?: string;
  palette?: any;
  tips?: any;
  copyAssets?: boolean;
};

// ---------- helpers ---------------------------------------------------------

function tryParseJson(raw: string | undefined | null): Record<string, any> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function readJsonBody(req: any): Promise<Record<string, any>> {
  // 1) Web Request-style (Edge / some dev proxies)
  try {
    if (typeof req.json === "function") {
      const j = await req.json();
      if (j && typeof j === "object") return j;
    }
  } catch {}

  // 2) Frameworks often attach parsed/ raw data at req.body
  try {
    if (req.body !== undefined && req.body !== null) {
      // Buffer body?
      if (typeof Buffer !== "undefined" && Buffer.isBuffer(req.body)) {
        return tryParseJson(req.body.toString("utf8"));
      }
      // Uint8Array body?
      if (req.body instanceof Uint8Array) {
        return tryParseJson(Buffer.from(req.body).toString("utf8"));
      }
      // String body?
      if (typeof req.body === "string") {
        return tryParseJson(req.body);
      }
      // Already-object
      if (typeof req.body === "object") {
        return req.body as Record<string, any>;
      }
    }
  } catch {}

  // 3) Node IncomingMessage stream (typical Vercel Node runtime)
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw) return tryParseJson(raw);
  } catch {}

  // 4) Last-resort: allow URL query (?sourceUrl=...&lineArtUrl=...) for debugging
  try {
    const u = new URL(req.url || "", "http://localhost");
    const sourceUrl = u.searchParams.get("sourceUrl") || u.searchParams.get("sourceurl");
    const lineArtUrl = u.searchParams.get("lineArtUrl") || u.searchParams.get("linearturl");
    if (sourceUrl || lineArtUrl) return { sourceUrl, lineArtUrl };
  } catch {}

  return {};
}

async function fetchAsBuffer(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  const ab = await r.arrayBuffer();
  const buf = Buffer.from(ab);
  const contentType = r.headers.get("content-type") || "application/octet-stream";
  return { buf, contentType };
}

// ---------- route -----------------------------------------------------------

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!BASE) {
      return res.status(500).json({ error: "Missing PUBLIC_BASE_URL" });
    }

    const body = (await readJsonBody(req)) as BundleBody;
    console.log("[bundles-create] received body:", body);

    const { sourceUrl, lineArtUrl } = body;

    if (!sourceUrl || !lineArtUrl) {
      return res.status(400).json({
        error: "Provide sourceUrl and lineArtUrl",
        received: body,
      });
    }

    const palette = body.palette ?? null;
    const tips = body.tips ?? null;
    const copyAssets = body.copyAssets !== false; // default true

    const id = `pla-${nano()}`;
    const baseKey = `bundles/${id}`;

    // Optionally copy images into Blob for durability
    let storedSourceUrl = sourceUrl;
    let storedLineArtUrl = lineArtUrl;

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
    return res.status(500).json({
      error: "bundles-create crashed",
      detail: err?.message || String(err),
    });
  }
}
