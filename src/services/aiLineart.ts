// src/services/aiLineart.ts
// Robust client: accepts imageSrc (data: or https), or file/blob/canvas.
// Flow:
//   - If data URL: POST -> /api/upload-data-url -> https URL
//   - If https URL: use directly
//   - If File/Blob/Canvas: convert to data URL, then upload -> https URL
//   - GET /api/ai-lineart-simple?imageUrl=...&prompt=... -> line-art URL

export type LineArtResult = { imageUrl: string };

function isDataUrl(s: string) {
  return typeof s === "string" && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(s);
}

function isHttpUrl(s: string) {
  try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; }
  catch { return false; }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Failed to read blob"));
    fr.onload = () => resolve(String(fr.result || ""));
    fr.readAsDataURL(blob);
  });
}

async function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return canvas.toDataURL("image/png");
}

async function uploadDataUrl(imageDataUrl: string): Promise<string> {
  const r = await fetch("/api/upload-data-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.imageUrl) {
    const msg = (j && (j.error || j.detail)) || r.statusText || "Upload failed";
    throw new Error(`Upload failed: ${msg}`);
  }
  return j.imageUrl as string;
}

async function callAiLineartSimple(imageUrl: string, prompt = ""): Promise<LineArtResult> {
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const url = new URL("/api/ai-lineart-simple", base);
  url.searchParams.set("imageUrl", imageUrl);
  if (prompt) url.searchParams.set("prompt", prompt);

  const r = await fetch(url.toString(), { method: "GET" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.imageUrl) {
    const msg = (j && (j.error || j.detail)) || r.statusText || "AI line art failed";
    throw new Error(`AI line art failed: ${msg}`);
  }
  return { imageUrl: j.imageUrl as string };
}

/** Main entry – tolerant of several input shapes. */
export async function generateAiLineArt(input: {
  imageSrc?: string;       // data: URL or https URL
  file?: File;             // optional
  blob?: Blob;             // optional
  canvas?: HTMLCanvasElement; // optional
  prompt?: string;
}): Promise<LineArtResult> {
  const { imageSrc, file, blob, canvas, prompt = "" } = input || ({} as any);

  let src = imageSrc || "";
  if (!src) {
    if (file) src = await blobToDataUrl(file);
    else if (blob) src = await blobToDataUrl(blob);
    else if (canvas) src = await canvasToDataUrl(canvas);
  }

  if (!src) throw new Error("Missing imageSrc"); // keeps your existing error boundary behavior

  let httpsUrl = src;
  if (isDataUrl(src)) {
    httpsUrl = await uploadDataUrl(src);
  } else if (!isHttpUrl(src)) {
    // If someone passed a bare filename or something odd, treat as error
    throw new Error("imageSrc must be a data URL or http(s) URL");
  }

  return callAiLineartSimple(httpsUrl, prompt);
}

// Back-compat alias used elsewhere
export const generateLineArt = generateAiLineArt;

// Convenience helpers
export async function lineartFromDataUrl(dataUrl: string, prompt = "") {
  const httpsUrl = await uploadDataUrl(dataUrl);
  return callAiLineartSimple(httpsUrl, prompt);
}
export async function lineartFromUrl(imageUrl: string, prompt = "") {
  return callAiLineartSimple(imageUrl, prompt);
}

const api = { generateAiLineArt, generateLineArt, lineartFromDataUrl, lineartFromUrl };
export default api;
