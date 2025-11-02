/* src/services/color.ts
   Color analysis pipeline for AKP-coloring-book.

   Policy (unchanged):
   - Cluster pixels in OKLab (initial K ~ 24)
   - Merge near-duplicates by ΔE00 <= 3
   - Rank clusters by a salience score (coverage, coherence, contrast, chroma)
   - Enforce diversity across final picks (ΔE00 >= 8)
   - Optionally add up to 2 accent colors (low coverage but high contrast)
   - Match centroids to Faber-Castell via ΔE00

   NEW in this version:
   - Read kit membership flags from the existing palette JSON.
   - Precompute per-kit matches (12/24/36/72) and attach them to each cluster:
       (cluster as any).matchesByKit = { 12: FCPencilMatch, 24: ..., 36: ..., 72: ... }
   - priorityOrder remains the full post-folding salience ranking.
   - Adds clear mile-markers for future section-level swaps.

   No external dependencies. Runs in the browser under Vite/Vercel dev.
*/

import type {
  ColorPlan,
  ColorCluster,
  FCPencil,
  FCPencilMatch,
  Lab,
  OKLab,
  RGB,
} from "@/types/color-plan";
import {
  rgb8ToLabD65,
  rgb8ToOKLab,
  deltaE00,
  distanceLabDE00,
  hexToRgb,
  rgbToHex,
  normalizeRgb,
} from "@/utils/color-metrics";
import { KIT_SIZES, KitSize } from "@/types/color-plan";

/* ======================================================
   Start Section 1 — Config & Options
   ====================================================== */

export interface ColorPlanOptions {
  initialK?: number;           // default 24
  mergeDeltaE00?: number;      // default 3
  diversityDeltaE00?: number;  // default 8
  minAccentCoverage?: number;  // default 0.008 (0.8%)
  maxAccents?: number;         // default 2
  sampleMaxEdge?: number;      // default 512
}

const DEFAULTS: Required<ColorPlanOptions> = {
  initialK: 24,
  mergeDeltaE00: 3,
  diversityDeltaE00: 8,
  minAccentCoverage: 0.008,
  maxAccents: 2,
  sampleMaxEdge: 512,
};

/* ======================================================
   End Section 1
   ====================================================== */


/* ======================================================
   Start Section 2 — Public API (generateColorPlan)
   ====================================================== */

/**
 * Generate a ColorPlan from an HTML element or ImageData.
 * Accepts <img>, <canvas>, or ImageData. File name is optional metadata.
 */
export async function generateColorPlan(
  source: HTMLImageElement | HTMLCanvasElement | ImageData,
  fileName?: string,
  opts?: ColorPlanOptions
): Promise<ColorPlan> {
  const cfg = { ...DEFAULTS, ...(opts || {}) };

  // 1) Get ImageData at analysis resolution
  const { data, width, height } = toSampleImageData(source, cfg.sampleMaxEdge);

  // 2) Convert pixels to OKLab + Lab, and keep RGB for convenience
  const pixels = extractPixels(data);
  const pxOK: OKLab[] = new Array(pixels.length);
  const pxLab: Lab[] = new Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    const rgb = pixels[i];
    pxOK[i] = rgb8ToOKLab(rgb);
    pxLab[i] = rgb8ToLabD65(rgb);
  }

  // 3) K-means in OKLab
  const { labels, centersOK } = kmeansOKLab(pxOK, cfg.initialK);

  // 4) Aggregate stats per cluster
  let clusters = buildClustersFromLabels(
    labels, centersOK, pxOK, pxLab, pixels, width, height
  );

  // 5) Merge near-duplicates
  clusters = mergeNearDuplicates(clusters, cfg.mergeDeltaE00);

  // 6) Salience
  computeSalience(clusters, labels, width, height);

  // 7) (Optional internal) Build diverse core + accents (kept for future use)
  const _diverseOrder = buildPriorityOrder(clusters, cfg);

  // 8) Load Faber-Castell palette (with kit membership parsed)
  const palette = await loadFCPalette();

  // 9) Match to full palette (baseline)
  matchClustersToPalette(clusters, palette);

  // 10) Precompute per-kit matches (12/24/36/72)
  precomputeMatchesByKit(clusters, palette);

  // 11) Fold duplicates that map to the same pencil (using baseline match)
  foldDuplicateMatches(clusters);

  // 12) After folding, sort again and produce full ranking for kit expansion
  clusters.sort((a, b) => (b.salience?.score ?? 0) - (a.salience?.score ?? 0));
  const fullRanking = clusters.map((c) => c.id);

  // 13) Build the final plan
  const plan: ColorPlan = {
    source: {
      width, height, fileName,
      orientation: width >= height ? "landscape" : "portrait",
    },
    clusters,
    paletteMeta: {
      set: "Faber-Castell Polychromos",
      version: new Date().toISOString().slice(0, 10),
      count: palette.length,
    },
    priorityOrder: fullRanking,
    thresholds: {
      mergeDeltaE00: cfg.mergeDeltaE00,
      diversityDeltaE00: cfg.diversityDeltaE00,
      minAccentCoverage: cfg.minAccentCoverage,
    },
  };

  // Attach a friendly timestamp (optional, used by UI footer)
  // @ts-expect-error UI convenience field
  plan.analyzedAt = new Date().toLocaleTimeString();

  return plan;
}

/* Compatibility helpers for any existing callers. */
export async function matchToFaberCastell(rgb: RGB): Promise<FCPencilMatch> {
  const palette = await loadFCPalette();
  const lab = rgb8ToLabD65(rgb);
  let best: FCPencil | null = null;
  let bestDE = Number.POSITIVE_INFINITY;
  for (const sw of palette) {
    const d = distanceLabDE00(sw.lab!, lab);
    if (d < bestDE) { bestDE = d; best = sw; }
  }
  if (!best) {
    return { fcId: 199, name: "Black", hex: "#000000", rgb: [0,0,0], lab, deltaE00: 0 };
  }
  return { fcId: best.fcId, name: best.name, hex: best.hex, rgb: best.rgb, lab, deltaE00: bestDE };
}

export async function debugDumpFC(): Promise<FCPencil[]> {
  return await loadFCPalette();
}

/* ======================================================
   End Section 2
   ====================================================== */


/* ======================================================
   Start Section 3 — Image Sampling Helpers
   ====================================================== */

function extractPixels(data: Uint8ClampedArray): RGB[] {
  const n = data.length / 4;
  const out: RGB[] = new Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[i] = [data[j], data[j + 1], data[j + 2]];
  }
  return out;
}

function toSampleImageData(
  source: HTMLImageElement | HTMLCanvasElement | ImageData,
  maxEdge: number
): ImageData {
  if (source instanceof ImageData) {
    return downscaleImageData(source, maxEdge);
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  let sw = 0, sh = 0;

  if (source instanceof HTMLImageElement) {
    sw = source.naturalWidth || source.width;
    sh = source.naturalHeight || source.height;
    const { w, h } = fitWithin(sw, sh, maxEdge);
    canvas.width = w; canvas.height = h;
    ctx.drawImage(source, 0, 0, w, h);
  } else {
    sw = source.width; sh = source.height;
    const { w, h } = fitWithin(sw, sh, maxEdge);
    canvas.width = w; canvas.height = h;
    ctx.drawImage(source, 0, 0, w, h);
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function fitWithin(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function downscaleImageData(img: ImageData, maxEdge: number): ImageData {
  const { w, h } = fitWithin(img.width, img.height, maxEdge);
  if (w === img.width && h === img.height) return img;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  canvas.width = w; canvas.height = h;

  const tmp = document.createElement("canvas");
  tmp.width = img.width; tmp.height = img.height;
  const tctx = tmp.getContext("2d", { willReadFrequently: true })!;
  tctx.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0, w, h);

  return ctx.getImageData(0, 0, w, h);
}

/* ======================================================
   End Section 3
   ====================================================== */


/* ======================================================
   Start Section 4 — K-means (OKLab)
   ====================================================== */

interface KMeansResult {
  labels: Uint16Array; // cluster index for each pixel (0..k-1)
  centersOK: OKLab[];  // center in OKLab
}

function kmeansOKLab(pxOK: OKLab[], k: number, maxIter = 20): KMeansResult {
  const n = pxOK.length;
  k = Math.max(1, Math.min(k, n));

  const centers: OKLab[] = [];
  const step = n / k;
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(i * step);
    centers.push([...pxOK[idx]] as OKLab);
  }

  const labels = new Uint16Array(n);
  const counts = new Array(k).fill(0);

  const distOK = (a: OKLab, b: OKLab) => {
    const dL = a[0] - b[0];
    const da = a[1] - b[1];
    const db = a[2] - b[2];
    return dL * dL + da * da + db * db; // squared distance for speed
  };

  for (let iter = 0; iter < maxIter; iter++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const p = pxOK[i];
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = distOK(p, centers[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (labels[i] !== best) { moved++; labels[i] = best; }
    }
    if (moved === 0 && iter > 0) break;

    centers.forEach((_c, i) => (counts[i] = 0));
    const sums = new Array(k).fill(0).map(() => [0, 0, 0] as OKLab);

    for (let i = 0; i < n; i++) {
      const c = labels[i];
      const p = pxOK[i];
      sums[c][0] += p[0]; sums[c][1] += p[1]; sums[c][2] += p[2];
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centers[c][0] = sums[c][0] / counts[c];
        centers[c][1] = sums[c][1] / counts[c];
        centers[c][2] = sums[c][2] / counts[c];
      }
    }
  }

  return { labels, centersOK: centers };
}

/* ======================================================
   End Section 4
   ====================================================== */


/* ======================================================
   Start Section 5 — Build Clusters & Proxies
   ====================================================== */

function buildClustersFromLabels(
  labels: Uint16Array,
  centersOK: OKLab[],
  pxOK: OKLab[],
  pxLab: Lab[],
  pxRGB: RGB[],
  width: number,
  height: number
): ColorCluster[] {
  const k = centersOK.length;
  const n = pxOK.length;

  // Accumulators for means (still used for rgb + salience proxies)
  const sumsLab: Lab[] = new Array(k).fill(0).map(() => [0, 0, 0]);
  const sumsRGB: [number, number, number][] = new Array(k).fill(0).map(() => [0, 0, 0]);
  const counts = new Array(k).fill(0);

  // Reservoir samples for robust (geometric median) centroids in Lab
  const MAX_MEDIAN_SAMPLES = 1200;
  const medSamples: Lab[][] = new Array(k).fill(0).map(() => []);
  const medSeen: number[] = new Array(k).fill(0);

  // Boundary stats for coherence/contrast proxies
  const boundaryCounts = new Array(k).fill(0);
  const contrastSum = new Array(k).fill(0);

  // Pass 1: tally coverage, rgb sums, and collect median samples
  for (let i = 0; i < n; i++) {
    const c = labels[i];
    counts[c]++;
    const lab = pxLab[i];
    sumsLab[c][0] += lab[0];
    sumsLab[c][1] += lab[1];
    sumsLab[c][2] += lab[2];

    const rgb = pxRGB[i];
    sumsRGB[c][0] += rgb[0];
    sumsRGB[c][1] += rgb[1];
    sumsRGB[c][2] += rgb[2];

    // Reservoir sampling for robust centroid
    medSeen[c]++;
    const arr = medSamples[c];
    if (arr.length < MAX_MEDIAN_SAMPLES) {
      arr.push(lab);
    } else {
      const j = Math.floor(Math.random() * medSeen[c]);
      if (j < MAX_MEDIAN_SAMPLES) arr[j] = lab;
    }
  }

  // Pass 2: boundary-based proxies (coherence/contrast)
  const idx = (x: number, y: number) => y * width + x;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i0 = idx(x, y);
      const c0 = labels[i0];
      const L0 = pxLab[i0][0];

      if (x + 1 < width) {
        const i1 = idx(x + 1, y);
        const c1 = labels[i1];
        if (c0 !== c1) {
          boundaryCounts[c0]++; boundaryCounts[c1]++;
          contrastSum[c0] += Math.abs(L0 - pxLab[i1][0]);
          contrastSum[c1] += Math.abs(pxLab[i1][0] - L0);
        }
      }
      if (y + 1 < height) {
        const i2 = idx(x, y + 1);
        const c2 = labels[i2];
        if (c0 !== c2) {
          boundaryCounts[c0]++; boundaryCounts[c2]++;
          contrastSum[c0] += Math.abs(L0 - pxLab[i2][0]);
          contrastSum[c2] += Math.abs(pxLab[i2][0] - L0);
        }
      }
    }
  }

  // Build cluster objects with robust Lab centroid (geometric median)
  const clusters: ColorCluster[] = [];
  const total = n;

  for (let c = 0; c < k; c++) {
    if (counts[c] === 0) continue;

    // Mean RGB stays as before (good for swatch rendering)
    const meanRGB: RGB = normalizeRgb([
      Math.round(sumsRGB[c][0] / counts[c]),
      Math.round(sumsRGB[c][1] / counts[c]),
      Math.round(sumsRGB[c][2] / counts[c]),
    ]);

    // Robust Lab centroid using Weiszfeld’s geometric median on a reservoir sample
    const sample = medSamples[c];
    const robustLab = sample.length ? geometricMedianLab(sample) : ([
      sumsLab[c][0] / counts[c],
      sumsLab[c][1] / counts[c],
      sumsLab[c][2] / counts[c],
    ] as Lab);

    clusters.push({
      id: clusters.length + 1,
      oklab: centersOK[c],
      lab: robustLab,
      rgb: meanRGB,
      sampleHex: rgbToHex(meanRGB),
      coverage: counts[c] / total,
      matched: {
        fcId: -1,
        name: "",
        hex: "#000000",
        rgb: [0, 0, 0],
        lab: robustLab,
        deltaE00: Number.POSITIVE_INFINITY,
      },
    });
  }

  // Consecutive IDs
  for (let i = 0; i < clusters.length; i++) clusters[i].id = i + 1;

  // Salience proxies
  for (let i = 0; i < clusters.length; i++) {
    const originalIndex = i;
    const count = counts[originalIndex] || 0;
    const boundary = boundaryCounts[originalIndex] || 0;
    const csum = contrastSum[originalIndex] || 0;

    const coherenceProxy = count > 0 ? 1 - Math.min(1, boundary / (count * 2)) : 0;
    const contrastProxy = count > 0 ? Math.min(1, csum / (count * 50)) : 0;

    clusters[i].salience = {
      coverage: clusters[i].coverage,
      coherence: coherenceProxy,
      contrast: contrastProxy,
      chroma: chromaFromLab(clusters[i].lab),
      subjectBoost: 0,
      score: 0,
    };
  }

  return clusters;
}

// Geometric median in Lab via Weiszfeld iteration (robust to outliers)
function geometricMedianLab(points: Lab[], maxIter = 30, eps = 1e-5): Lab {
  // Start at component-wise mean
  let L = 0, a = 0, b = 0;
  const n = points.length;
  for (const p of points) { L += p[0]; a += p[1]; b += p[2]; }
  L /= n; a /= n; b /= n;

  for (let iter = 0; iter < maxIter; iter++) {
    let wSum = 0, nL = 0, na = 0, nb = 0;
    let moved = 0;

    for (const p of points) {
      const d = Math.hypot(L - p[0], a - p[1], b - p[2]);
      const w = 1 / Math.max(d, 1e-9);
      wSum += w;
      nL += w * p[0];
      na += w * p[1];
      nb += w * p[2];
      moved += d;
    }
    const L2 = nL / wSum, a2 = na / wSum, b2 = nb / wSum;
    if (Math.hypot(L2 - L, a2 - a, b2 - b) < eps) {
      return [L2, a2, b2];
    }
    L = L2; a = a2; b = b2;
  }
  return [L, a, b];
}

function chromaFromLab(lab: Lab): number {
  const C = Math.hypot(lab[1], lab[2]);
  return Math.min(1, C / 100);
}

/* ======================================================
   End Section 5
   ====================================================== */



/* ======================================================
   Start Section 6 — Merge Near-Duplicates
   ====================================================== */

function mergeNearDuplicates(clusters: ColorCluster[], mergeDE00: number): ColorCluster[] {
  if (clusters.length <= 1) return clusters.slice();

  const NEUTRAL_CHROMA = 10;          // C*ab below this is “near-neutral”
  const NEUTRAL_REDUCE = 1.0;         // tighten threshold by this many ΔE00 for neutrals

  const work = clusters.slice();
  let merged = true;

  while (merged) {
    merged = false;
    outer: for (let i = 0; i < work.length; i++) {
      for (let j = i + 1; j < work.length; j++) {
        const li = work[i].lab, lj = work[j].lab;
        const d = deltaE00(li, lj);

        // Neutral-aware threshold (avoid blending warm & cool greys)
        const Ci = Math.hypot(li[1], li[2]);
        const Cj = Math.hypot(lj[1], lj[2]);
        const thr = (Ci < NEUTRAL_CHROMA && Cj < NEUTRAL_CHROMA)
          ? Math.max(0.5, mergeDE00 - NEUTRAL_REDUCE)
          : mergeDE00;

        if (d <= thr) {
          // Weighted merge (by coverage)
          const cov = work[i].coverage + work[j].coverage;
          const w1 = work[i].coverage / cov, w2 = work[j].coverage / cov;

          work[i].lab = [
            work[i].lab[0] * w1 + work[j].lab[0] * w2,
            work[i].lab[1] * w1 + work[j].lab[1] * w2,
            work[i].lab[2] * w1 + work[j].lab[2] * w2,
          ];
          work[i].oklab = [
            work[i].oklab[0] * w1 + work[j].oklab[0] * w2,
            work[i].oklab[1] * w1 + work[j].oklab[1] * w2,
            work[i].oklab[2] * w1 + work[j].oklab[2] * w2,
          ];
          work[i].rgb = [
            Math.round(work[i].rgb[0] * w1 + work[j].rgb[0] * w2),
            Math.round(work[i].rgb[1] * w1 + work[j].rgb[1] * w2),
            Math.round(work[i].rgb[2] * w1 + work[j].rgb[2] * w2),
          ];
          work[i].sampleHex = rgbToHex(work[i].rgb);
          work[i].coverage = cov;

          if (work[i].salience && work[j].salience) {
            // Non-null locals so TS is happy under strict checks
            const si = work[i].salience!;
            const sj = work[j].salience!;

            si.coverage = cov;
            si.coherence = si.coherence * w1 + sj.coherence * w2;
            si.contrast  = si.contrast  * w1 + sj.contrast  * w2;
            si.chroma    = si.chroma    * w1 + sj.chroma    * w2;
            si.subjectBoost = si.subjectBoost * w1 + sj.subjectBoost * w2;
          }

          work.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  // Re-id and return
  for (let i = 0; i < work.length; i++) work[i].id = i + 1;
  return work;
}

/* ======================================================
   End Section 6
   ====================================================== */



/* ======================================================
   Start Section 7 — Salience Scoring
   ====================================================== */

function computeSalience(
  clusters: ColorCluster[],
  _labels: Uint16Array,
  _width: number,
  _height: number
) {
  let maxCoverage = 0, maxCoherence = 0, maxContrast = 0, maxChroma = 0;

  for (const c of clusters) {
    if (!c.salience) continue;
    maxCoverage = Math.max(maxCoverage, c.salience.coverage);
    maxCoherence = Math.max(maxCoherence, c.salience.coherence);
    maxContrast  = Math.max(maxContrast,  c.salience.contrast);
    maxChroma    = Math.max(maxChroma,    c.salience.chroma);
  }
  const w = { cov: 0.45, coh: 0.2, con: 0.2, chr: 0.1, sub: 0.05 };

  for (const c of clusters) {
    if (!c.salience) continue;
    const cov = safeDiv(c.salience.coverage,  maxCoverage);
    const coh = safeDiv(c.salience.coherence, maxCoherence);
    const con = safeDiv(c.salience.contrast,  maxContrast);
    const chr = safeDiv(c.salience.chroma,    maxChroma);
    const sub = c.salience.subjectBoost;

    c.salience.score = w.cov * cov + w.coh * coh + w.con * con + w.chr * chr + w.sub * sub;
  }
}

function safeDiv(a: number, b: number): number { return b <= 1e-9 ? 0 : a / b; }

/* ======================================================
   End Section 7
   ====================================================== */


/* ======================================================
   Start Section 8 — Diversity & Accents (internal)
   ====================================================== */

function buildPriorityOrder(clusters: ColorCluster[], cfg: Required<ColorPlanOptions>): number[] {
  const ordered = clusters.slice().sort((a, b) => (b.salience?.score ?? 0) - (a.salience?.score ?? 0));
  const picked: ColorCluster[] = [];

  for (const c of ordered) {
    if (picked.length === 0) { picked.push(c); continue; }
    let farEnough = true;
    for (const p of picked) {
      if (deltaE00(c.lab, p.lab) < cfg.diversityDeltaE00) { farEnough = false; break; }
    }
    if (farEnough) picked.push(c);
  }

  const accents: ColorCluster[] = [];
  for (const c of ordered) {
    if (picked.find((p) => p.id === c.id)) continue;
    const cov = c.coverage, contrast = c.salience?.contrast ?? 0;
    if (cov >= cfg.minAccentCoverage && contrast >= 0.4) accents.push(c);
    if (accents.length >= cfg.maxAccents) break;
  }

  const final = [...picked, ...accents].map((c) => c.id);
  if (final.length === 0 && ordered.length > 0) return ordered.map((c) => c.id);
  return final;
}

/* ======================================================
   End Section 8
   ====================================================== */


/* ======================================================
   Start Section 9 — Palette Loading & Matching (kit-aware)
   ====================================================== */

let _cachedPalette: FCPencil[] | null = null;

type AnyPaletteRow = {
  id?: number;
  fcId?: number;
  name?: string;
  hex?: string;
  rgb?: RGB;
  sets?: number[];          // preferred: e.g., [12,24,36,72,120]
  // also tolerate boolean/0-1 flags like set12, in24, kit36, etc.
  [key: string]: any;
};

async function loadFCPalette(): Promise<FCPencil[]> {
  if (_cachedPalette) return _cachedPalette;

  const res = await fetch("/palettes/faber-castell-polychromos.json");
  const raw: AnyPaletteRow[] = await res.json();

  const palette: FCPencil[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const fcId = typeof item.fcId === "number" ? item.fcId : item.id;
      const name = String(item.name || "");
      const hex  = String(item.hex  || "").toUpperCase();
      const rgb: RGB = item.rgb && item.rgb.length === 3 ? (item.rgb as RGB) : hexToRgb(hex);

      // Build a normalized pencil object and (optionally) stash kit membership.
      const p: any = {
        fcId, name, hex, rgb,
        lab: rgb8ToLabD65(rgb),
        oklab: rgb8ToOKLab(rgb),
      };

      const kits = parseKitMembership(item);
      if (kits.length) p.kits = kits; // optional

      palette.push(p as FCPencil);
    }
  }

  _cachedPalette = palette.filter((p) => Number.isFinite((p as any).fcId) && (p as any).name && (p as any).hex);
  return _cachedPalette;
}

/** Extract kit sizes (12/24/36/72/60/120…) from flexible palette JSON. */
function parseKitMembership(item: AnyPaletteRow): number[] {
  const sizes = [12, 24, 36, 60, 72, 120];
  const found = new Set<number>();

  // Preferred: explicit array field
  if (Array.isArray(item.sets)) {
    for (const s of item.sets) if (sizes.includes(s)) found.add(s);
  }

  // Also allow boolean or 0/1 flags under various key styles
  for (const s of sizes) {
    const candidates = [
      `set${s}`, `in${s}`, `kit${s}`, `k${s}`, `${s}`, `S${s}`, `s${s}`,
    ];
    for (const key of candidates) {
      const v = (item as any)[key];
      if (v === true || v === 1 || v === "1") found.add(s);
    }
  }

  return Array.from(found).sort((a, b) => a - b);
}

function matchClustersToPalette(clusters: ColorCluster[], palette: FCPencil[]) {
  for (const c of clusters) {
    let best: FCPencil | null = null;
    let bestDE = Number.POSITIVE_INFINITY;
    for (const sw of palette) {
      const d = distanceLabDE00(c.lab, (sw as any).lab!);
      if (d < bestDE) { bestDE = d; best = sw; }
    }
    if (best) {
      c.matched = {
        fcId: (best as any).fcId,
        name: (best as any).name,
        hex:  (best as any).hex,
        rgb:  (best as any).rgb,
        lab:  c.lab,
        deltaE00: bestDE,
      };
    }
  }
}

/** Precompute best match per kit size (12/24/36/72) and attach to clusters. */
function precomputeMatchesByKit(clusters: ColorCluster[], palette: FCPencil[]) {
  // Build subsets for each kit size from palette.kits membership.
  const subsets = new Map<KitSize, FCPencil[]>();
  for (const size of KIT_SIZES) {
    const subset = palette.filter((p: any) => {
      const kits: number[] | undefined = p.kits;
      return Array.isArray(kits) ? kits.includes(size) : false;
    });
    // Safety: if some kit isn't represented in the JSON, fall back to full palette
    subsets.set(size, subset.length ? subset : palette);
  }

  for (const c of clusters) {
    const perKit: Record<number, FCPencilMatch> = {};
    for (const size of KIT_SIZES) {
      const pool = subsets.get(size)!;
      let best: FCPencil | null = null;
      let bestDE = Number.POSITIVE_INFINITY;
      for (const sw of pool) {
        const d = distanceLabDE00(c.lab, (sw as any).lab!);
        if (d < bestDE) { bestDE = d; best = sw; }
      }
      if (best) {
        perKit[size] = {
          fcId: (best as any).fcId,
          name: (best as any).name,
          hex:  (best as any).hex,
          rgb:  (best as any).rgb,
          lab:  c.lab,
          deltaE00: bestDE,
        };
      }
    }
    (c as any).matchesByKit = perKit;
  }
}

/* ======================================================
   End Section 9
   ====================================================== */


/* ======================================================
   Start Section 10 — Post-processing (fold duplicates, ranking utils)
   ====================================================== */

function foldDuplicateMatches(clusters: ColorCluster[]) {
  const byFc = new Map<number, ColorCluster[]>();
  for (const c of clusters) {
    const list = byFc.get(c.matched.fcId) || [];
    list.push(c); byFc.set(c.matched.fcId, list);
  }

  for (const [_fcId, list] of byFc.entries()) {
    if (list.length <= 1) continue;
    const keeper = list.slice().sort((a, b) => (b.salience?.score ?? 0) - (a.salience?.score ?? 0))[0];
    const others = list.filter((c) => c !== keeper);
    for (const c of others) {
      keeper.coverage += c.coverage;
      keeper.lab   = weightedLab(keeper.lab,   c.lab,   0.9);
      keeper.oklab = weightedOKLab(keeper.oklab, c.oklab, 0.9);
      const idx = clusters.findIndex((x) => x.id === c.id);
      if (idx >= 0) clusters.splice(idx, 1);
    }
  }

  clusters.sort((a, b) => (b.salience?.score ?? 0) - (a.salience?.score ?? 0));
  for (let i = 0; i < clusters.length; i++) clusters[i].id = i + 1;
}

function weightedLab(a: Lab, b: Lab, wA = 0.5): Lab {
  const wB = 1 - wA;
  return [a[0] * wA + b[0] * wB, a[1] * wA + b[1] * wB, a[2] * wA + b[2] * wB];
}
function weightedOKLab(a: OKLab, b: OKLab, wA = 0.5): OKLab {
  const wB = 1 - wA;
  return [a[0] * wA + b[0] * wB, a[1] * wA + b[1] * wB, a[2] * wA + b[2] * wB];
}

/* ======================================================
   End Section 10
   ====================================================== */
