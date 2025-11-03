// src/services/aiLineart.ts
// Uploads a compressed image to Vercel Blob from the browser,
// then calls /api/ai-lineart-from-url with { imageUrl }.
// Keeps the same exported function signature used by App.tsx.
//
// Requires: npm i @vercel/blob
// Docs ref: "Client Uploads with Vercel Blob" (Other frameworks) — handleUpload + upload()
// https://vercel.com/docs/vercel-blob/client-upload

export const config = { runtime: 'nodejs.x' };

import { upload } from '@vercel/blob/client';

export async function generateAiLineArt(
  imageDataUrl: string,
  prompt?: string
): Promise<{ imageUrl: string; raw?: any }> {
  // 1) Downscale/compress aggressively (fast UX + lower storage)
  const { blob, width, height, bytes } = await downscaleToBlob(imageDataUrl, {
    maxDim: 1400, // plenty for lineart extraction
    quality: 0.8,
    mime: 'image/jpeg',
  });

  console.log(`[ai-lineart] client compressed: ${width}×${height}, ~${prettyBytes(bytes)}`);

  // 2) Upload directly from the browser to Vercel Blob (no server 413s)
  //    The /api/blob-upload route issues a token securely.
  const filename = `original-${Date.now()}.jpg`;
  const put = await upload(filename, blob, {
    access: 'public',
    handleUploadUrl: '/api/blob-upload',
  });

  // put.url is the public Blob URL we’ll process on the server.
  // 3) Call the small wrapper that converts URL -> dataURL -> your existing /api/ai-lineart
  const r = await fetch('/api/ai-lineart-from-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageUrl: put.url, prompt }),
  });


  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const txt = await r.text();
    throw new Error(`AI line art failed: ${r.status} ${r.statusText} – ${txt.slice(0, 200)}`);
  }
  const json = await r.json();
  if (!r.ok) {
    console.error('AI line art server error:', json);
    throw new Error(`AI line art failed: ${r.status} – ${json?.error ?? 'Unknown error'}`);
  }
  if (!json?.imageUrl) {
    console.warn('No parsed imageUrl from server. Raw payload:', json);
    throw new Error('AI line art succeeded but no imageUrl parsed.');
  }
  return { imageUrl: json.imageUrl as string, raw: json.raw };
}

/* ── helpers ─────────────────────────────────────────── */

type DownscaleOpts = {
  maxDim: number;
  quality: number; // 0..1
  mime?: 'image/jpeg' | 'image/webp' | 'image/png';
};

async function downscaleToBlob(
  dataUrl: string,
  { maxDim, quality, mime = 'image/jpeg' }: DownscaleOpts
): Promise<{ blob: Blob; width: number; height: number; bytes: number }> {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h); // avoid JPEG transparent-to-black
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await canvasToBlob(c, mime, clamp01(quality));
  const bytes = blob.size;
  return { blob, width: w, height: h, bytes };
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), mime, quality);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img as HTMLImageElement);
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function prettyBytes(n: number) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let v = n, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}
