// src/utils/palette.ts
// Extract N dominant HEX colors from an image dataURL (client-side).
// Approach: downscale -> sample -> k-means++ (sRGB) -> return distinct hexes by cluster weight.

type RGB = { r: number; g: number; b: number };

const clamp = (n: number, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, n));
const rgbToHex = ({ r, g, b }: RGB) =>
  "#" + [r, g, b].map(v => clamp(Math.round(v)).toString(16).padStart(2, "0")).join("").toUpperCase();

export async function getDominantHexes(dataUrl: string, k = 10): Promise<string[]> {
  const { pixels, w, h } = await readImagePixels(dataUrl, 480); // small but faithful
  const samples = samplePixels(pixels, w, h, 1 /* step */);

  // Remove near-white and near-black noise (backgrounds/borders)
  const filtered = samples.filter(({ r, g, b }) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max - min;
    // keep colors that aren't almost white/black and have some saturation or mid-tone value
    return !(max > 245 && min > 245) && !(max < 10 && min < 10) && (sat > 8 || (max > 30 && max < 230));
  });

  const centers = kmeansPP(filtered, Math.min(k, Math.max(3, Math.floor(filtered.length / 200))));
  const result = centers
    .sort((a, b) => b.weight - a.weight)
    .map(c => rgbToHex(c))
    // de-duplicate near-equals (within small Δ on sRGB)
    .filter((hex, idx, arr) => idx === arr.findIndex(h => similarHex(hex, h, 8)));

  // Ensure we always return at least a couple of colors
  return result.slice(0, Math.max(3, k));
}

async function readImagePixels(src: string, maxWidth = 480) {
  const img = await loadImage(src);
  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const cvs = document.createElement("canvas");
  cvs.width = w; cvs.height = h;
  const ctx = cvs.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return { pixels: data, w, h };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to read image"));
    img.src = src;
  });
}

function samplePixels(raw: Uint8ClampedArray, w: number, h: number, step = 1): RGB[] {
  const out: RGB[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const a = raw[i + 3];
      if (a < 8) continue; // skip fully transparent
      out.push({ r: raw[i], g: raw[i + 1], b: raw[i + 2] });
    }
  }
  return out;
}

// --- k-means++ clustering on sRGB (fast, good-enough) ---

type Center = RGB & { weight: number };

function kmeansPP(points: RGB[], k: number): Center[] {
  if (points.length === 0) return [];
  // init with kmeans++ seeding
  const centers: Center[] = [];
  centers.push({ ...points[(Math.random() * points.length) | 0], weight: 1 });

  const dist2 = (p: RGB, c: RGB) => {
    const dr = p.r - c.r, dg = p.g - c.g, db = p.b - c.b;
    return dr * dr + dg * dg + db * db;
  };

  while (centers.length < k) {
    const dists = points.map(p => Math.min(...centers.map(c => dist2(p, c))));
    const sum = dists.reduce((a, b) => a + b, 0) || 1;
    let r = Math.random() * sum;
    for (let i = 0; i < points.length; i++) {
      r -= dists[i];
      if (r <= 0) {
        centers.push({ ...points[i], weight: 1 });
        break;
      }
    }
  }

  // iterate a few times
  for (let iter = 0; iter < 8; iter++) {
    const sums: { r: number; g: number; b: number; w: number }[] = centers.map(() => ({ r: 0, g: 0, b: 0, w: 0 }));
    for (const p of points) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const d = dist2(p, centers[i]);
        if (d < bd) { bd = d; bi = i; }
      }
      const s = sums[bi];
      s.r += p.r; s.g += p.g; s.b += p.b; s.w += 1;
    }
    for (let i = 0; i < centers.length; i++) {
      const s = sums[i];
      if (s.w > 0) {
        centers[i].r = s.r / s.w;
        centers[i].g = s.g / s.w;
        centers[i].b = s.b / s.w;
        centers[i].weight = s.w;
      }
    }
  }
  return centers;
}

function similarHex(a: string, b: string, tol = 8) {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const dr = pa.r - pb.r, dg = pa.g - pb.g, db = pa.b - pb.b;
  return dr * dr + dg * dg + db * db > tol * tol ? true : false;
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const s = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}
