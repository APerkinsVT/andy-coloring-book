// api/upload-data-url.ts
// Converts a data:image/...;base64,... to a public https URL on Vercel Blob.
// Accepts *any* request shape used by local dev servers (Express-like,
// Next.js API, Vite adapters, or Web Request in edge-style handlers).

import { put } from "@vercel/blob";

export const config = { api: { bodyParser: false } };

type Payload = { imageDataUrl?: string };

function parseDataUrl(dataUrl: string) {
  // data:image/png;base64,AAAA...
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return null;
  const mime = m[1];
  const base64 = m[2];
  return { mime, base64 };
}

async function readBodyAny(req: any): Promise<Payload> {
  // 1) Express/Next style: body already parsed
  if (req?.body && typeof req.body === "object") return req.body as Payload;

  // 2) Web Request (edge-style): use .json()
  if (typeof req?.json === "function") {
    try {
      const obj = await req.json();
      return (obj || {}) as Payload;
    } catch {
      // fall through
    }
  }

  // 3) Web Request ReadableStream
  const webStream = req?.body;
  if (webStream && typeof webStream.getReader === "function") {
    const reader = webStream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const raw = new TextDecoder().decode(
      chunks.length === 1 ? chunks[0] : Buffer.concat(chunks as any)
    );
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  }

  // 4) Node IncomingMessage stream
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    const raw = Buffer.concat(chunks).toString("utf-8");
    return (JSON.parse(raw || "{}") as Payload) || {};
  } catch {
    return {};
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = await readBodyAny(req);
    const { imageDataUrl } = body || {};

    if (!imageDataUrl) {
      return res.status(400).json({ error: "Missing imageDataUrl" });
    }

    const parsed = parseDataUrl(imageDataUrl);
    if (!parsed) return res.status(400).json({ error: "Invalid data URL" });

    const bin = Buffer.from(parsed.base64, "base64");
    const ext = parsed.mime.split("/")[1] || "png";
    const filename = `uploads/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

    const uploaded = await put(filename, bin, {
      access: "public",
      contentType: parsed.mime,
    });

    return res.status(200).json({ imageUrl: uploaded.url });
  } catch (err: any) {
    // Make debugging easy while we’re stabilizing
    console.error("[upload-data-url] crash:", err);
    return res
      .status(500)
      .json({ error: "upload-data-url crashed", detail: err?.message || String(err) });
  }
}
