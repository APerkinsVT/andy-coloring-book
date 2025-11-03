// src/services/aiLineart.ts
// Uploads a compressed image to Vercel Blob, then calls /api/ai-lineart-from-url.
// Adds clear console logs so we can see exactly where anything fails.

import { upload } from '@vercel/blob/client';

export async function generateAiLineArt(
  imageDataUrl: string,
  prompt?: string
): Promise<{ imageUrl: string; raw?: any }> {
  try {
    // 1) Downscale/compress a bit for faster upload
    const { blob, width, height, bytes } = await downscaleToBlob(imageDataUrl, {
      maxDim: 1400,
      quality: 0.8,
      mime: 'image/jpeg',
    });
    console.log(`[ai-lineart] compressed: ${width}×${height}, ~${prettyBytes(bytes)}`);

    // 2) Upload directly to Vercel Blob (token issued by /api/blob-upload)
    const filename = `original-${Date.now()}.jpg`;
    console.log(`[ai-lineart] starting blob upload → ${filename}`);

    const put = await upload(filename, blob, {
      access: 'public',
      handleUploadUrl: '/api/blob-upload',
    });

    console.log('[ai-lineart] blob upload result:', put);

    if (!put || !put.url) {
      throw new Error('Upload returned no URL. Check /api/blob-upload and Vercel Blob setup.');
    }

    // 3) Call the Node wrapper with the Blob URL
    console.log('[ai-lineart] calling /api/ai-lineart-from-url with imageUrl:', put.url);

    const r = await fetch('/api/ai-lineart-from-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageUrl: put.url, prompt }),
    });

    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await r.text();
      throw new Error(`Wrapper failed: ${r.status} ${r.statusText} – ${txt.slice(0, 200)}`);
    }

    const json = await r.json();
    if (!r.ok) {
      console.error('Wrapper error payload:', json);
      throw new Error(`Wrapper failed: ${r.status} – ${json?.error ?? 'Unknown error'}`);
    }

    if (!json?.imageUrl) {
      console.warn('Wrapper succeeded but no imageUrl in payload. Raw:', json);
      throw new Error('Wrapper succeeded but no imageUrl parsed.');
    }

    console.log('[ai-lineart] SUCCESS. lineArt URL:', json.imageUrl);
    return { imageUrl: json.imageUrl as string, raw: json.raw };
  } catch (err) {
    console.error('[ai-lineart] generateAiLineArt error:', err);
    throw err;
  }
}

/* ── helpers ─────────────────────────────────────────── */

type DownscaleOpts = {
  maxDim: number;
  quality: number;
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
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await canvasToBlob(c, mime, clamp01(quality));
  return { blob, width: w, height: h, bytes: blob.size };
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

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

function prettyBytes(n: number) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let v = n, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}
