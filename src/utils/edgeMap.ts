// src/utils/edgeMap.ts
// Bilateral -> Sobel -> NMS -> Hysteresis -> Median -> 2x supersample & downscale.
// Produces smooth, printable black-on-white line art.

type RGBA = Uint8ClampedArray;

function toGrayscale(img: RGBA) {
  const g = new Uint8ClampedArray(img.length / 4);
  for (let i = 0, j = 0; i < img.length; i += 4, j++) {
    const r = img[i], gg = img[i + 1], b = img[i + 2];
    g[j] = (0.2126 * r + 0.7152 * gg + 0.0722 * b) | 0;
  }
  return g;
}

/** Fast bilateral-ish: 3x3 spatial with simple range weighting in luminance space */
function bilateral3(gray: Uint8ClampedArray, w: number, h: number, sigmaR = 20) {
  const out = new Uint8ClampedArray(gray.length);
  const range = (d: number) => Math.exp(-(d * d) / (2 * sigmaR * sigmaR));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let ws = 0, acc = 0;
      const c = gray[i];
      for (let yy = -1; yy <= 1; yy++) {
        for (let xx = -1; xx <= 1; xx++) {
          const xn = Math.min(w - 1, Math.max(0, x + xx));
          const yn = Math.min(h - 1, Math.max(0, y + yy));
          const j = yn * w + xn;
          const wr = range(gray[j] - c);
          const wspt = wr; // spatial kernel ~flat for 3x3
          ws += wspt;
          acc += wspt * gray[j];
        }
      }
      out[i] = (acc / (ws || 1)) | 0;
    }
  }
  return out;
}

function sobel(src: Uint8ClampedArray | Float32Array, w: number, h: number) {
  const gxK = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyK = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const mag = new Float32Array(w * h);
  const ang = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0, k = 0;
      for (let yy = -1; yy <= 1; yy++) {
        for (let xx = -1; xx <= 1; xx++, k++) {
          const v = src[(y + yy) * w + (x + xx)];
          gx += gxK[k] * (v as number);
          gy += gyK[k] * (v as number);
        }
      }
      const i = y * w + x;
      mag[i] = Math.hypot(gx, gy);
      ang[i] = Math.atan2(gy, gx);
    }
  }
  return { mag, ang };
}

function nonMaxSuppression(mag: Float32Array, ang: Float32Array, w: number, h: number) {
  const out = new Float32Array(mag.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const theta = Math.abs((ang[i] * 180) / Math.PI);
      let q = 0, r = 0;
      if (theta <= 22.5 || theta > 157.5) { q = mag[i + 1]; r = mag[i - 1]; }
      else if (theta <= 67.5)          { q = mag[i + w + 1]; r = mag[i - w - 1]; }
      else if (theta <= 112.5)         { q = mag[i + w];     r = mag[i - w]; }
      else                             { q = mag[i - w + 1]; r = mag[i + w - 1]; }
      out[i] = (mag[i] >= q && mag[i] >= r) ? mag[i] : 0;
    }
  }
  return out;
}

function percentileThresholds(nms: Float32Array, hiPct: number, loPct: number) {
  const vals = Array.from(nms).filter(v => v > 0).sort((a, b) => a - b);
  if (!vals.length) return { high: 0, low: 0 };
  const high = vals[Math.floor(vals.length * hiPct)];
  const low = vals[Math.floor(vals.length * loPct)];
  return { high, low };
}

function hysteresis(nms: Float32Array, w: number, h: number, high: number, low: number) {
  const out = new Uint8Array(nms.length); // 0=bg, 1=weak, 2=strong
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= high) out[i] = 2;
    else if (nms[i] >= low) out[i] = 1;
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (out[i] !== 1) continue;
        for (let yy = -1; yy <= 1; yy++) {
          for (let xx = -1; xx <= 1; xx++) {
            if (!xx && !yy) continue;
            if (out[(y + yy) * w + (x + xx)] === 2) { out[i] = 2; changed = true; yy = 2; break; }
          }
        }
      }
    }
  }
  return out;
}

/** 3x3 median filter over strong edges to close tiny gaps */
function medianSeal(strong: Uint8Array, w: number, h: number) {
  const out = strong.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      let cnt = 0;
      for (let yy = -1; yy <= 1; yy++)
        for (let xx = -1; xx <= 1; xx++)
          if (strong[(y + yy) * w + (x + xx)] === 2) cnt++;
      out[i] = (cnt >= 5 ? 2 : strong[i]); // majority
    }
  }
  return out;
}

export async function toEdgePng(
  dataUrl: string,
  ui = 34,           // try 30–38
  maxOutWidth = 900  // processing & output width keeps things smooth
): Promise<string> {
  // 2x supersample canvas for anti-aliased downscale
  const img = await loadImage(dataUrl);
  const targetW = Math.min(maxOutWidth, img.width);
  const scale = targetW / img.width;
  const targetH = Math.round(img.height * scale);
  const workW = targetW * 2, workH = targetH * 2;

  const work = document.createElement('canvas');
  work.width = workW; work.height = workH;
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  wctx.imageSmoothingEnabled = true;
  wctx.imageSmoothingQuality = 'high';
  wctx.drawImage(img, 0, 0, workW, workH);

  const id = wctx.getImageData(0, 0, workW, workH);
  const gray = toGrayscale(id.data);
  const den = bilateral3(gray, workW, workH, 18);
  const { mag, ang } = sobel(den, workW, workH);
  const nms = nonMaxSuppression(mag, ang, workW, workH);

  // thresholds from UI → hi ∈ [0.82..0.92], lo = hi*0.55
  const hiPct = Math.max(0.82, Math.min(0.92, 0.82 + (ui - 30) * 0.005));
  const loPct = hiPct * 0.55;
  const { high, low } = percentileThresholds(nms, hiPct, loPct);
  let edges = hysteresis(nms, workW, workH, high, low);
  edges = medianSeal(edges, workW, workH);

  // paint & downscale to target canvas (anti-aliased)
  for (let i = 0, j = 0; j < edges.length; i += 4, j++) {
    const v = edges[j] === 2 ? 0 : 255;
    id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 255;
  }
  wctx.putImageData(id, 0, 0);

  const out = document.createElement('canvas');
  out.width = targetW; out.height = targetH;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(work, 0, 0, targetW, targetH);

  return out.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}
