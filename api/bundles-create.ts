// api/bundles-create.ts
// POST /api/bundles-create
// Body: { sourceUrl, lineArtUrl, palette?, tips?, copyAssets? }

import { put } from "@vercel/blob";
import QRCode from "qrcode";
import { customAlphabet } from "nanoid";

const BASE =
  process.env.PUBLIC_BASE_URL ||
  (typeof process !== "undefined" && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

const nano = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 10);

type BundleBody = {
  sourceUrl: string;
  lineArtUrl: string;
  palette?: any;
  tips?: any;
  copyAssets?: boolean;
};

async function readJsonBody(req: any): Promise<any> {
  try {
    if (typeof req.json === "function") return await req.json();
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8") || "{}";
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
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
    const { sourceUrl, lineArtUrl } = body;
    const palette = body.palette ?? null;
    const tips = body.tips ?? null;
    const copyAssets = body.copyAssets !== false;

    if (!sourceUrl || !lineArtUrl) {
      return res.status(400).json({ error: "Provide sourceUrl and lineArtUrl" });
    }

    const id = `pla-${nano()}`;
    const baseKey = `bundles/${id}`;

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
    return res
      .status(500)
      .json({ error: "bundles-create crashed", detail: err?.message || String(err) });
  }
}
