// src/services/aiLineart.ts
// Aggressive downscale+compress with explicit size logs and a 1.2 MB final cap.

export async function generateAiLineArt(
  imageDataUrl: string,
  prompt?: string
): Promise<{ imageUrl: string; raw?: any }> {
  const orig = await decodeMeta(imageDataUrl);
  console.log(
    `[ai-lineart] original: ${orig.width}×${orig.height}, ~${prettyBytes(orig.bytes)}`
  );

  // Pass 1: 1200px @ 0.78
  let compact = await downscale(imageDataUrl, { maxDim: 1200, quality: 0.78 });
  let meta = await decodeMeta(compact);
  console.log(
    `[ai-lineart] pass1:    ${meta.width}×${meta.height}, ~${prettyBytes(meta.bytes)}`
  );

  // Pass 2 if needed: 1000px @ 0.72
  if (meta.bytes > 1_600_000) {
    compact = await downscale(compact, { maxDim: 1000, quality: 0.72 });
    meta = await decodeMeta(compact);
    console.log(
      `[ai-lineart] pass2:    ${meta.width}×${meta.height}, ~${prettyBytes(meta.bytes)}`
    );
  }

  // Pass 3 if still large: 800px @ 0.68
  if (meta.bytes > 1_350_000) {
    compact = await downscale(compact, { maxDim: 800, quality: 0.68 });
    meta = await decodeMeta(compact);
    console.log(
      `[ai-lineart] pass3:    ${meta.width}×${meta.height}, ~${prettyBytes(meta.bytes)}`
    );
  }

  // Final guard
  if (meta.bytes > 1_200_000) {
    throw new Error(
      `Photo too large after compression (${prettyBytes(
        meta.bytes
      )}). Try a smaller/cropped image.`
    );
  }

  const r = await fetch("/api/ai-lineart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl: compact, prompt }),
  });

  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const txt = await r.text();
    if (r.status === 413) {
      throw new Error(
        `Server said 413 (too large). Sent ~${prettyBytes(meta.bytes)}.`
      );
    }
    throw new Error(`AI line art failed: ${r.status} ${r.statusText} – ${txt.slice(0,200)}`);
  }

  const json = await r.json();
  if (!r.ok) {
    console.error("AI line art server error:", json);
    throw new Error(`AI line art failed: ${r.status} – ${json?.error ?? "Unknown error"}`);
  }
  if (!json?.imageUrl) {
    console.warn("No parsed imageUrl from server. Raw payload:", json);
    throw new Error("AI line art succeeded but no imageUrl parsed.");
  }
  return { imageUrl: json.imageUrl as string, raw: json.raw };
}

/* ── helpers ─────────────────────────────────────────── */

async function downscale(
  srcDataUrl: string,
  opts: { maxDim: number; quality: number; mime?: "image/jpeg" | "image/webp" }
): Promise<string> {
  const { maxDim, quality, mime = "image/jpeg" } = opts;
  const img = await loadImage(srcDataUrl);

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { alpha: false });
  if (!ctx) return srcDataUrl;

  if (mime === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h); // avoid black in JPEG
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  return c.toDataURL(mime, clamp01(quality)) || srcDataUrl;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img as HTMLImageElement);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function decodeMeta(dataUrl: string): Promise<{width:number;height:number;bytes:number;}> {
  const bytes = estimateDataUrlBytes(dataUrl);
  const img = await loadImage(dataUrl);
  return { width: img.width, height: img.height, bytes };
}

function estimateDataUrlBytes(dataUrl: string): number {
  const m = dataUrl.match(/^data:[^;]+;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return -1;
  const b64 = m[1];
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length * 3) / 4 - padding;
}

function prettyBytes(n: number) {
  if (n < 0) return "unknown";
  const u = ["B", "KB", "MB", "GB"];
  let v = n, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
