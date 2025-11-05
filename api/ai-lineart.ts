// api/ai-lineart.ts
// Robust body reader + validation + Replicate call + (optional) Blob upload.
// This version focuses first on making sure we *see* imageDataUrl/imageUrl.

export const config = { api: { bodyParser: false } };

type LineArtRequest = {
  imageDataUrl?: string; // data:image/...;base64,...
  imageUrl?: string;     // https://...
  prompt?: string;
};

type LineArtResponse =
  | { imageUrl: string; model?: string; version?: string }
  | { error: string; detail?: string };

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN!;
const REPLICATE_MODEL = process.env.REPLICATE_MODEL || "";      // e.g. "owner/model-name"
const REPLICATE_VERSION = process.env.REPLICATE_VERSION || "";  // version hash if required

// ---------------------- body helpers ----------------------
async function readRawBody(req: any): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString("utf-8");
}

function tryParseJson<T = any>(raw: string): T | null {
  try { return JSON.parse(raw); } catch { return null; }
}

function isDataUrl(s?: string): boolean {
  return !!s && typeof s === "string" && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(s);
}

function isHttpUrl(s?: string): boolean {
  if (!s || typeof s !== "string") return false;
  try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; }
  catch { return false; }
}

// ---------------------- tiny blob uploader (optional) ----------------------
// If you need to persist outputs on Vercel Blob, wire your token/SDK here.
// For now we skip it and just return the Replicate output URL as-is.
async function persistOutput(url: string): Promise<string> {
  return url;
}

// ---------------------- Replicate polling ----------------------
async function startReplicateJob(inputUrl: string, prompt?: string): Promise<string> {
  // You may be using a model that accepts { image, prompt } or { input: { image, prompt } }.
  // Adjust the payload to your exact model’s schema if needed.
  const payload = {
    version: REPLICATE_VERSION || undefined,
    input: { image: inputUrl, prompt: prompt || "" },
    model: REPLICATE_MODEL || undefined,
  };

  const r = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Token ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Replicate create failed ${r.status}: ${txt.slice(0, 500)}`);
  }

  const j = await r.json();
  return j.id as string;
}

async function waitForReplicate(id: string): Promise<any> {
  for (;;) {
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { "Authorization": `Token ${REPLICATE_API_TOKEN}` },
    });
    const j = await r.json();
    const s = j.status as string;

    if (s === "succeeded") return j;
    if (s === "failed" || s === "canceled") {
      const errMsg = (j.error && String(j.error)) || "Replicate returned failed status";
      throw new Error(errMsg);
    }
    await new Promise(res => setTimeout(res, 1200));
  }
}

// ---------------------- imageDataUrl -> temp URL ----------------------
// If you need to transform a data URL to an HTTP URL that your model accepts,
// you can either upload to Blob here or let your existing code handle it.
// For now, we keep a simple inline encoder -> data URL is not directly fetchable,
// so most models require an http(s) URL. Replace this with your existing Blob uploader.
async function dataUrlToTempHttpUrl(_dataUrl: string): Promise<string> {
  // TODO: connect to your Vercel Blob uploader. For now we throw to avoid silent failures.
  throw new Error("imageDataUrl provided but no uploader configured in this drop-in");
}

// ---------------------- handler ----------------------
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" } as LineArtResponse);
  }

  try {
    const raw = await readRawBody(req);
    // short debug print so we *know* what's arriving
    console.log("[ai-lineart] raw body (first 120):", raw.slice(0, 120));

    // Be forgiving about content-type: parse JSON even if header is missing/wrong.
    const body = (tryParseJson<LineArtRequest>(raw) || {}) as LineArtRequest;

    const { imageDataUrl, imageUrl, prompt } = body;

    if (!imageDataUrl && !imageUrl) {
      return res.status(400).json({ error: "Provide imageDataUrl or imageUrl" } as LineArtResponse);
    }

    // Resolve to an HTTP URL for the model:
    let inputUrl: string;
    if (isHttpUrl(imageUrl)) {
      inputUrl = imageUrl!;
    } else if (isDataUrl(imageDataUrl)) {
      // If your existing project already uploads data URLs to Blob inside this route,
      // replace this call with that uploader. Leaving it explicit here so it’s obvious.
      inputUrl = await dataUrlToTempHttpUrl(imageDataUrl!);
    } else {
      return res.status(400).json({ error: "Invalid imageDataUrl/imageUrl format" });
    }

    // Ensure Replicate is configured:
    if (!REPLICATE_API_TOKEN) throw new Error("Missing REPLICATE_API_TOKEN");
    if (!REPLICATE_MODEL && !REPLICATE_VERSION) {
      throw new Error("Set REPLICATE_MODEL and/or REPLICATE_VERSION");
    }

    const id = await startReplicateJob(inputUrl, prompt);
    const result = await waitForReplicate(id);

    // Many models return an array of URLs in result.output. Adjust if yours differs.
    let outUrl: string | undefined;
    if (Array.isArray(result.output) && result.output.length) {
      outUrl = String(result.output[0]);
    } else if (typeof result.output === "string") {
      outUrl = result.output;
    }

    if (!outUrl) {
      throw new Error("Replicate result missing output URL");
    }

    const persisted = await persistOutput(outUrl);
    return res.status(200).json({ imageUrl: persisted, model: REPLICATE_MODEL || undefined, version: REPLICATE_VERSION || undefined } as LineArtResponse);
  } catch (err: any) {
    console.error("[ai-lineart] error:", err);
    return res.status(500).json({ error: "ai-lineart crashed", detail: err?.message || String(err) } as LineArtResponse);
  }
}
