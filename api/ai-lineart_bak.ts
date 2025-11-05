// src/services/aiLineart.ts
// Browser flow: upload original image to Vercel Blob → get URL → call /api/ai-lineart-via-url.

import { upload } from '@vercel/blob/client';

export async function generateAiLineArt(
  imageDataUrl: string,
  prompt?: string
): Promise<{ imageUrl: string; raw?: any }> {
  // Convert dataURL to Blob (no resizing needed—Blob handles size)
  const blob = await (await fetch(imageDataUrl)).blob();
  const mime = blob.type || 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const filename = `original-${Date.now()}.${ext}`;

  // 1) Direct browser → Blob upload
  const put = await upload(filename, blob, {
    access: 'public',
    handleUploadUrl: '/api/blob-upload',
  });
  if (!put?.url) {
    throw new Error('Upload failed: no URL returned from /api/blob-upload');
  }

  // 2) Tell server to use the URL and run your AI route
  const r = await fetch('/api/ai-lineart-via-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageUrl: put.url, prompt }),
  });

  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const txt = await r.text();
    throw new Error(`AI wrapper failed: ${r.status} ${r.statusText} – ${txt.slice(0, 200)}`);
  }

  const json = await r.json();
  if (!r.ok) throw new Error(json?.error || `AI wrapper ${r.status}`);
  if (!json?.imageUrl) throw new Error('AI wrapper succeeded but no imageUrl parsed');
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
