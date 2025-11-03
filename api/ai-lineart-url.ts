// api/ai-lineart-url.ts
// Node runtime wrapper:
// Accepts { imageUrl, prompt }, downloads the image server-side,
// converts it to a data URL (Buffer → base64), then calls your existing /api/ai-lineart.

import type { VercelRequest, VercelResponse } from "@vercel/node";

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

    // Fetch the original image from Blob (or any public URL)
    const imgRes = await fetch(imageUrl, { cache: "no-store" });
    if (!imgRes.ok) {
      return res
        .status(400)
        .json({ error: `Failed to fetch image (${imgRes.status})` });
    }

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const ab = await imgRes.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");
    const dataUrl = `data:${contentType};base64,${b64}`;

    // Compute origin for internal call to your existing /api/ai-lineart
    const xfProto = (req.headers["x-forwarded-proto"] as string) || "https";
    const xfHost = (req.headers["x-forwarded-host"] as string) || req.headers.host;
    const origin =
      xfHost && xfProto ? `${xfProto}://${xfHost}` : `https://${req.headers.host}`;

    // Call your existing endpoint with a small JSON body (no 413 now)
    const r = await fetch(`${origin}/api/ai-lineart`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageDataUrl: dataUrl, prompt }),
    });

    const ct2 = r.headers.get("content-type") || "";
    if (!ct2.includes("application/json")) {
      const txt = await r.text();
      return res
        .status(502)
        .json({
          error: "ai-lineart returned non-JSON",
          status: r.status,
          preview: txt.slice(0, 200),
        });
    }

    const jsonOut = await r.json();
    return res.status(r.status).json(jsonOut);
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err?.message || "Unexpected error in ai-lineart-url" });
  }
}
