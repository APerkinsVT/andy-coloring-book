// api/ai-lineart.ts
// Use Replicate SDK to send a Blob directly to the model (no separate Files API call)

export const config = { runtime: "nodejs" };

import Replicate from "replicate";

type Incoming = { imageDataUrl: string; prompt?: string };

function parseBody(req: any): Promise<Incoming | null> {
  return new Promise(async (resolve) => {
    try {
      if (typeof req.body === "string") {
        try { return resolve(JSON.parse(req.body)); } catch {}
      } else if (req.body && typeof req.body === "object") {
        return resolve(req.body);
      }
      const chunks: Uint8Array[] = [];
      for await (const c of req) chunks.push(c as Uint8Array);
      try { return resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); } catch {}
    } catch {}
    resolve(null);
  });
}

function dataUrlToBlob(dataUrl: string): { mime: string; blob: Blob } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || "");
  if (!m) throw new Error("Invalid or missing data URL");
  const mime = m[1];
  const buf = Buffer.from(m[2], "base64");
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); // ArrayBuffer, not SharedArrayBuffer
  const blob = new Blob([ab], { type: mime });
  return { mime, blob };
}

function extractUrl(output: any): string | null {
  // Replicate SDK often returns a "file" object with .url() OR a URL string/array
  if (!output) return null;
  if (typeof output === "string") return output;

  // Sometimes it's an array (e.g., multiple images)
  if (Array.isArray(output) && output.length) {
    const first = output[0];
    if (typeof first === "string") return first;
    if (first && typeof first.url === "function") return first.url();
    if (first && typeof first.url === "string") return first.url;
  }

  // Single file-like object
  if (typeof output.url === "function") return output.url();
  if (typeof output.url === "string") return output.url;

  return null;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: "Missing REPLICATE_API_TOKEN" });

    const body = await parseBody(req);
    if (!body?.imageDataUrl) return res.status(400).json({ error: "Missing imageDataUrl" });

    const { blob } = dataUrlToBlob(body.imageDataUrl);

    const replicate = new Replicate({ auth: token });

    const prompt =
      body.prompt ??
      "Generate a clean black-and-white line drawing of the subject for a printable coloring book page. Clear edges, minimal artifacts.";

    // Run the model with Blob directly — SDK uploads under the hood.
    const output: any = await replicate.run("google/nano-banana", {
      input: {
        prompt,
        image_input: [blob],
        output_format: "png",
      },
    });

    const imageUrl = extractUrl(output);
    if (!imageUrl) {
      return res.status(500).json({
        error: "Model returned no URL",
        debug: typeof output === "object" ? output : String(output),
      });
    }

    res.status(200).json({ imageUrl });
  } catch (e: any) {
    console.error("ai-lineart error:", e);
    res.status(500).json({ error: e?.message ?? String(e) });
  }
}
