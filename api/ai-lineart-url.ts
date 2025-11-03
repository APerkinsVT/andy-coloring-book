// api/ai-lineart-url.ts
// Node runtime wrapper: fetches image by URL, converts to data URL,
// then calls your existing /api/ai-lineart with a small JSON body.

// api/ai-lineart-url.ts
export const config = { runtime: 'nodejs18.x' }; // or 'nodejs20.x' if your project uses 20
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageUrl, prompt } = (req.body || {}) as {
      imageUrl?: string;
      prompt?: string;
    };

    if (!imageUrl) {
      return res.status(400).json({ error: "Missing imageUrl" });
    }

    // Download the image (from Vercel Blob or any public URL)
    const imgRes = await fetch(imageUrl, { cache: "no-store" });
    if (!imgRes.ok) {
      return res.status(400).json({ error: `Failed to fetch image (${imgRes.status})` });
    }

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const ab = await imgRes.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");
    const dataUrl = `data:${contentType};base64,${b64}`;

    // Compute origin for internal call to /api/ai-lineart (works behind Vercel proxy)
    const xfProto = (req.headers["x-forwarded-proto"] as string) || "https";
    const xfHost  = (req.headers["x-forwarded-host"]  as string) || req.headers.host;
    const origin  = xfHost && xfProto ? `${xfProto}://${xfHost}` : `https://${req.headers.host}`;

    const r = await fetch(`${origin}/api/ai-lineart`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageDataUrl: dataUrl, prompt }),
    });

    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const txt = await r.text();
      return res.status(502).json({
        error: "ai-lineart returned non-JSON",
        status: r.status,
        preview: txt.slice(0, 200),
      });
    }

    const out = await r.json();
    return res.status(r.status).json(out);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Unexpected error in ai-lineart-url" });
  }
}
