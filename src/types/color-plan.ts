/* src/types/color-plan.ts
   Shared types + small helpers for the color plan pipeline and UI.
*/

export type RGB = [number, number, number];
export type Lab = [number, number, number];
export type OKLab = [number, number, number];

export type Orientation = "landscape" | "portrait";

/* ---------- Kit sizes ---------- */
export enum KitSize {
  K12 = 12,
  K24 = 24,
  K36 = 36,
  K72 = 72,
  K120 = 120, // NEW
}

export const KIT_SIZES: KitSize[] = [
  KitSize.K12,
  KitSize.K24,
  KitSize.K36,
  KitSize.K72,
  KitSize.K120, // NEW
];

/* ---------- Palette + matching ---------- */
export interface FCPencil {
  fcId: number;
  name: string;
  hex: string;
  rgb: RGB;
  lab?: Lab;
  oklab?: OKLab;
  // optional: kits: number[] // present at runtime after palette load
}

export interface FCPencilMatch {
  fcId: number;
  name: string;
  hex: string;
  rgb: RGB;
  lab: Lab;        // centroid we matched from (Lab)
  deltaE00: number;
}

/* ---------- Clusters & plan ---------- */
export interface Salience {
  coverage: number;     // 0..1 fraction of pixels
  coherence: number;    // 0..1 (fewer boundaries => higher)
  contrast: number;     // 0..1 (boundary luminance contrast)
  chroma: number;       // 0..1 (C*ab normalized)
  subjectBoost: number; // 0..1 (reserved for future subject-aware boosts)
  score: number;        // aggregate ranking score
}

export interface ColorCluster {
  id: number;          // stable 1-based id
  oklab: OKLab;        // centroid in OKLab (for k-means bookkeeping)
  lab: Lab;            // robust centroid in Lab (used for matching)
  rgb: RGB;            // mean rgb (for swatch rendering)
  sampleHex: string;   // swatch hex string for UI
  coverage: number;    // 0..1
  salience?: Salience;
  matched: FCPencilMatch; // baseline full-palette match
  // Precomputed per-kit matches attached at runtime:
  // matchesByKit?: Record<number, FCPencilMatch>;
}

export interface ColorPlan {
  source: {
    width: number;
    height: number;
    fileName?: string;
    orientation: Orientation;
  };
  clusters: ColorCluster[];
  paletteMeta: {
    set: string;
    version: string;
    count: number;
  };
  /** Ranked cluster ids after folding/merging. */
  priorityOrder: number[];
  thresholds: {
    mergeDeltaE00: number;
    diversityDeltaE00: number;
    minAccentCoverage: number;
  };
  // analyzedAt?: string // UI convenience, attached at runtime
}

/* ---------- Tiny UI helper for the ΔE “confidence” pill ---------- */
export function confidenceFromDeltaE00(d: number): {
  kind: "good" | "ok" | "stretch";
  score: number; // 0..1 (1 best)
} {
  if (!Number.isFinite(d)) return { kind: "stretch", score: 0 };
  if (d <= 4) return { kind: "good", score: 1 };
  if (d <= 8) return { kind: "ok", score: 0.6 };
  return { kind: "stretch", score: Math.max(0, 1 - (d - 8) / 14) };
}
