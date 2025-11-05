// api/ai-lineart-simple.ts
// GET /api/ai-lineart-simple?imageUrl=https://...&prompt=...
// Nano Banana expects `image_input` (array) per schema.

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN!;
const REPLICATE_VERSION =
  process.env.REPLICATE_VERSION ||
  "f0a9d34b12ad1c1cd76269a844b218ff4e64e128ddaba93e15891f47368958a0";

// Crisp “trace don’t invent” default; you can override via ?prompt=...
const DEFAULT_PROMPT =
  "Convert this exact photo into clean black line art for a coloring book. " +
  "Preserve composition and subjects; outlines only; minimal interior shading; white background.";

function q(req: any, key: string): string | undefined {
  return (req.query?.[key] ?? req.query?.[key.toLowerCase()]) as string | undefined;
}

function headers() {
  return {
    Authorization: `Token ${REPLICATE_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch image (${r.status}) from ${url}`);
  const ab = await r.arrayBuffer();
  const buf = Buffer.from(ab);
  const type = r.headers.get("content-type") || "image/jpeg";
  return `data:${type};base64,${buf.toString("base64")}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const imageUrl = q(req, "imageUrl");
    const userPrompt = (q(req, "prompt") || "").trim();
    const prompt = userPrompt.length ? userPrompt : DEFAULT_PROMPT;

    if (!imageUrl) return res.status(400).json({ error: "Provide imageUrl" });
    if (!REPLICATE_API_TOKEN) return res.status(500).json({ error: "Missing REPLICATE_API_TOKEN" });

    const dataUrl = await fetchImageAsDataUrl(imageUrl);

    // NOTE: Nano Banana schema -> input.image_input (array), not image/image_url.
    const createBody = {
      version: REPLICATE_VERSION,
      input: {
        prompt,
        image_input: [dataUrl],
        output_format: "jpg",
      },
    };

    const create = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(createBody),
    });

    if (!create.ok) {
      const txt = await create.text().catch(() => "");
      return res.status(422).json({ error: "Replicate create failed", detail: txt.slice(0, 1000) });
    }

    const { id } = await create.json();
    if (!id) return res.status(502).json({ error: "Replicate response missing prediction id" });

    for (;;) {
      const pr = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` },
      });
      const pj = await pr.json();
      const st = String(pj.status || "");

      if (st === "succeeded") {
        let out: string | undefined;
        if (Array.isArray(pj.output) && pj.output.length) out = String(pj.output[0]);
        else if (typeof pj.output === "string") out = pj.output;
        if (!out) return res.status(502).json({ error: "No output from model" });
        return res.status(200).json({ imageUrl: out });
      }

      if (st === "failed" || st === "canceled") {
        const detail = (pj.error && String(pj.error)) || "Replicate job failed";
        return res.status(502).json({ error: "Replicate failed", detail });
      }

      await new Promise(r => setTimeout(r, 1200));
    }
  } catch (err: any) {
    return res.status(500).json({ error: "ai-lineart-simple crashed", detail: err?.message || String(err) });
  }
}
