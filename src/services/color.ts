// src/services/color.ts
// Robust wrapper that tolerates different export styles from ../utils/colorMatch

// 1) Import the whole module (not a named/default import) so we can probe it.
import * as fcModule from "../utils/colorMatch";

export type FCPencil = {
  id: number;                 // FC catalog number (e.g., 199)
  name: string;               // "Black"
  hex: string;                // "#000000"
  rgb?: [number, number, number];
  sets?: Record<string, boolean> | string[];
};

type AnyRec = Record<string, any>;

// 2) Try common patterns: default, named, or "module is already an array"
const fcRawMaybe: any =
  (fcModule as any).default ??
  (fcModule as any).FC_COLORS ??
  (fcModule as any).colors ??
  (Array.isArray(fcModule) ? fcModule : undefined);

// 3) Normalizers
function normalizeHex(h: string) {
  const t = h.startsWith("#") ? h : `#${h}`;
  return t.length === 4
    ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`
    : t.toUpperCase();
}

function normalizeItem(x: AnyRec): FCPencil | null {
  if (!x || typeof x !== "object") return null;

  const id = Number(x.FC_Number ?? x.number ?? x.id ?? x.FC ?? x.code ?? NaN);
  const name = String(x.FC_Color ?? x.name ?? x.Color ?? x.label ?? "");
  const hex = String(x.Hex ?? x.hex ?? x.HEX ?? "").trim();
  if (!id || !name || !hex) return null;

  const sets: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(x)) {
    const key = k.toLowerCase();
    const val = typeof v === "string" ? v.trim() : v;
    if (
      /(^|\D)(12|24|36|48|60|72|96|120)(\D|$)/.test(key) &&
      (val === true || val === 1 || val === "1" || val === "yes" || val === "true" || val === "Y")
    ) {
      const m = key.match(/(12|24|36|48|60|72|96|120)/);
      if (m) sets[m[1]] = true;
    }
  }

  const rgb =
    Array.isArray((x as any).RGB) && (x as any).RGB.length === 3
      ? [
          Number((x as any).RGB[0]),
          Number((x as any).RGB[1]),
          Number((x as any).RGB[2]),
        ] as [number, number, number]
      : undefined;

  return { id, name, hex: normalizeHex(hex), rgb, sets: Object.keys(sets).length ? sets : undefined };
}

const FC_ALL: FCPencil[] = Array.isArray(fcRawMaybe)
  ? (fcRawMaybe.map(normalizeItem).filter(Boolean) as FCPencil[])
  : [];

// 4) Public API
export function getFCPalette(
  setSize?: "12" | "24" | "36" | "48" | "60" | "72" | "96" | "120"
): FCPencil[] {
  if (!setSize) return FC_ALL;
  return FC_ALL.filter((p) =>
    p.sets && typeof p.sets === "object" ? (p.sets as Record<string, boolean>)[setSize] === true : false
  );
}

export function matchToFaberCastell(
  sourceHexes: string[],
  opts: { setSize?: "12" | "24" | "36" | "48" | "60" | "72" | "96" | "120"; topK?: number } = {}
) {
  const palette = getFCPalette(opts.setSize);
  const topK = Math.max(1, Math.min(5, opts.topK ?? 1));

  const palLab = palette.map((p) => ({
    p,
    lab: p.rgb ? rgbToLab(p.rgb) : hexToLab(p.hex),
  }));

  return sourceHexes.map((hex) => {
    const srcLab = hexToLab(hex);
    const scored = palLab
      .map(({ p, lab }) => ({ pencil: p, dE: deltaE76(srcLab, lab) }))
      .sort((a, b) => a.dE - b.dE)
      .slice(0, topK);
    return { sourceHex: normalizeHex(hex), matches: scored };
  });
}

// 5) Tiny debug helper so we can confirm wiring from the browser console
export function debugDumpFC(limit = 5) {
  console.log("[FC] total entries:", FC_ALL.length);
  console.table(FC_ALL.slice(0, limit));
  return FC_ALL.length;
}

/* ---- Color math (sRGB→Lab, ΔE76) ---- */
function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
function rgbToXyz([r, g, b]: [number, number, number]): [number, number, number] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  return [
    R * 0.4124564 + G * 0.3575761 + B * 0.1804375,
    R * 0.2126729 + G * 0.7151522 + B * 0.072175,
    R * 0.0193339 + G * 0.119192 + B * 0.9503041,
  ];
}
function xyzToLab([x, y, z]: [number, number, number]): [number, number, number] {
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const fx = f(x / Xn), fy = f(y / Yn), fz = f(z / Zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  function f(t: number) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
}
function rgbToLab(rgb: [number, number, number]): [number, number, number] {
  return xyzToLab(rgbToXyz(rgb));
}
function hexToLab(hex: string): [number, number, number] {
  return rgbToLab(hexToRgb(hex));
}
function deltaE76([L1, a1, b1]: [number, number, number], [L2, a2, b2]: [number, number, number]) {
  const dL = L1 - L2, da = a1 - a2, db = b1 - b2;
  return Math.sqrt(dL * dL + da * da + db * db);
}
