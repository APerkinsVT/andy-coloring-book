// api/vision-probe.ts
// GET /api/vision-probe?imageUrl=https://...
// Always returns meta proving we fetched bytes.
// Optionally captions the image via Replicate if env vars are set.
//
// ENV (set one of these two styles):
//   REPLICATE_API_TOKEN=...                (required if captioning is used)
//   REPLICATE_CAPTION_VERSION=<version>    (preferred; use /v1/predictions with {version})
//   -- or --
//   REPLICATE_CAPTION_MODEL=<owner/name>   (fallback; uses /v1/models/{model}/predictions)
//
// Notes:
// - We send the image inline as a data URL first (input.image). If the model
//   only accepts a URL, we fall back to input.image_url.

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || "";
const CAPTION_VERSION = process.env.REPLICATE_CAPTION_VERSION || "";
const CAPTION_MODEL = process.env.REPLICATE_CAPTION_MODEL || ""; // e.g. "salesforce/blip"

function q(req: any, key: string): string | undefined {
  return (req.query?.[key] ?? req.query?.[key.toLowerCase()]) as string | undefined;
}

async function fetchAsDataUrl(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  const ab = await r.arrayBuffer();
  const buf = Buffer.from(ab);
  const contentType = r.headers.get("content-type") || "image/jpeg";
  const dataUrl = `data:${contentType};base64,${buf.toString("base64")}`;
  return { dataUrl, bytes: buf.byteLength, contentType };
}

async function captionViaReplicate({ dataUrl, imageUrl }: { dataUrl: string; imageUrl: string }) {
  if (!REPLICATE_API_TOKEN) return { skipped: true, reason: "Missing REPLICATE_API_TOKEN" };

  const headers = {
    Authorization: `Token ${REPLICATE_API_TOKEN}`,
    "Content-Type": "application/json",
  };

  // Helper to POST a caption job and poll for output (string or first item).
  async function postAndPoll(createUrl: string, body: any) {
    const create = await fetch(createUrl, { method: "POST", headers, body: JSON.stringify(body) });
    if (!create.ok) {
      const txt = await create.text().catch(() => "");
      return { ok: false as const, detail: txt.slice(0, 1000) };
    }
    const { id } = await create.json();
    for (;;) {
      const pr = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` },
      });
      const pj = await pr.json();
      if (pj.status === "succeeded") {
        const out = Array.isArray(pj.output) ? pj.output[0] : pj.output;
        return { ok: true as const, output: out };
      }
      if (pj.status === "failed" || pj.status === "canceled") {
        return { ok: false as const, detail: String(pj.error || "caption job failed") };
      }
      await new Promise(r => setTimeout(r, 900));
    }
  }

  // Build create endpoint + body in two valid styles:
  // A) versioned predictions
  if (CAPTION_VERSION) {
    // Try inline data first
    let r = await postAndPoll("https://api.replicate.com/v1/predictions", {
      version: CAPTION_VERSION,
      input: { image: dataUrl, prompt: "Describe this image in one short sentence." },
    });
    if (r.ok) return { caption: r.output, path: "predictions(version) image(dataUrl)" };
    // Fallback to image_url
    r = await postAndPoll("https://api.replicate.com/v1/predictions", {
      version: CAPTION_VERSION,
      input: { image_url: imageUrl, prompt: "Describe this image in one short sentence." },
    });
    if (r.ok) return { caption: r.output, path: "predictions(version) image_url(https)" };
    return { error: r.detail || "caption failed (versioned)" };
  }

  // B) model path predictions
  if (CAPTION_MODEL) {
    const base = `https://api.replicate.com/v1/models/${CAPTION_MODEL}/predictions`;
    let r = await postAndPoll(base, {
      input: { image: dataUrl, prompt: "Describe this image in one short sentence." },
    });
    if (r.ok) return { caption: r.output, path: "models(model) image(dataUrl)" };
    r = await postAndPoll(base, {
      input: { image_url: imageUrl, prompt: "Describe this image in one short sentence." },
    });
    if (r.ok) return { caption: r.output, path: "models(model) image_url(https)" };
    return { error: r.detail || "caption failed (model path)" };
  }

  return { skipped: true, reason: "No caption model configured (set CAPTION_VERSION or CAPTION_MODEL)" };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const imageUrl = q(req, "imageUrl");
    if (!imageUrl) return res.status(400).json({ error: "Provide imageUrl" });

    const { dataUrl, bytes, contentType } = await fetchAsDataUrl(imageUrl);

    const cap = await captionViaReplicate({ dataUrl, imageUrl });

    return res.status(200).json({
      ok: true,
      meta: { contentType, bytes, dataUrlLength: dataUrl.length },
      caption: (cap as any).caption || null,
      captionPath: (cap as any).path || null,
      captionSkipped: !!(cap as any).skipped || false,
      captionReason: (cap as any).reason || null,
      captionError: (cap as any).error || null,
    });
  } catch (err: any) {
    console.error("[vision-probe] crash:", err);
    return res.status(500).json({ ok: false, error: "vision-probe crashed", detail: err?.message || String(err) });
  }
}
