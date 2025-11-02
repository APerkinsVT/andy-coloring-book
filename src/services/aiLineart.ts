// src/services/aiLineart.ts
// Safely call /api/ai-lineart:
// - Downscale + recompress the image to stay under server body limits
// - Robust response parsing (JSON-first, but handles text/HTML error pages)

export async function generateAiLineArt(
  imageDataUrl: string,
  prompt?: string
): Promise<{ imageUrl: string; raw?: any }> {
  // 1) Downscale/compress before sending (long edge ≤ 1600px, JPEG q=0.85)
  const compactDataUrl = await downscaleDataUrl(imageDataUrl, {
    maxDim: 1600,
    mime: "image/jpeg",
    quality: 0.85,
  });

  // 2) POST
  const r = await fetch("/api/ai-lineart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl: compactDataUrl, prompt }),
  });

  // 3) Robust parse (prefer JSON, else fall back to text)
  const contentType = r.headers.get("content-type") || "";
  let payload: any = null;
  try {
    if (contentType.includes("application/json")) {
      payload = await r.json();
    } else {
      const txt = await r.text();
      // Try JSON parse anyway (some platforms return text/json)
      try {
        payload = JSON.parse(txt);
      } catch {
        // Surface a readable snippet for HTML/text error pages (e.g., 413)
        const snippet = txt.slice(0, 200).replace(/\s+/g, " ").trim();
        if (!r.ok) {
          throw new Error(`AI line art failed: ${r.status} ${r.statusText} – ${snippet}`);
        } else {
          throw new Error(`Unexpected non-JSON response: ${snippet}`);
        }
      }
    }
  } catch (e: any) {
    // If JSON parsing itself failed (e.g., “Unexpected token 'R', 'Request En'…”)
    if (!r.ok) {
      throw new Error(
        `AI line art failed: ${r.status} ${r.statusText}${
          e?.message ? ` – ${e.message}` : ""
        }`
      );
    }
    throw e;
  }

  if (!r.ok) {
    // Ensure server-side diagnostics are visible in the console
    console.error("AI line art server error:", payload);
    throw new Error(
      `AI line art failed: ${r.status} ${r.statusText}${
        payload?.error ? ` – ${payload.error}` : ""
      }`
    );
  }

  const url = payload?.imageUrl as string | undefined;
  if (!url) {
    console.warn("No parsed imageUrl from server. Raw payload:", payload);
    throw new Error("AI line art succeeded but no imageUrl parsed. See console for raw.");
  }
  return { imageUrl: url, raw: payload?.raw };
}

/* ──────────────────────────────────────────────────────────────
   Utilities
   ────────────────────────────────────────────────────────────── */

/**
 * Downscale a DataURL to a maximum dimension (width or height), convert to JPEG/WebP/PNG.
 * Strips EXIF metadata and reduces size dramatically for server POST limits.
 */
async function downscaleDataUrl(
  srcDataUrl: string,
  opts: { maxDim: number; mime?: "image/jpeg" | "image/png" | "image/webp"; quality?: number }
): Promise<string> {
  const { maxDim, mime = "image/jpeg", quality = 0.85 } = opts;

  // If already JPEG and reasonably small, skip work
  try {
    const approxBytes = estimateDataUrlBytes(srcDataUrl);
    if (approxBytes > 0 && approxBytes < 3_500_000) {
      // < ~3.5MB is typically safe on Vercel; adjust if needed
      return srcDataUrl;
    }
  } catch {
    // ignore estimation errors and continue
  }

  const img = await loadImage(srcDataUrl);
  const { width, height } = img;

  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  // Draw to canvas
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return srcDataUrl;

  // Fill white for JPEG (no alpha)
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const out = canvas.toDataURL(mime, clamp01(quality));
  return out || srcDataUrl;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function estimateDataUrlBytes(dataUrl: string): number {
  // Rough size = base64 length * 3/4 - padding
  const m = dataUrl.match(/^data:[^;]+;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return -1;
  const b64 = m[1];
  const len = b64.length;
  const padding = (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  return (len * 3) / 4 - padding;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img as HTMLImageElement);
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}
