/* src/utils/color-metrics.ts
   Core color math for AKP-coloring-book:
   - sRGB <-> linear sRGB
   - sRGB <-> XYZ (D65)
   - XYZ (D65) <-> CIE Lab (D65-referenced)
   - sRGB -> OKLab (Björn Ottosson)
   - ΔE76 and CIEDE2000 (ΔE00)
   - Hex/RGB helpers
   - Lightweight distance helpers

   No external deps. Tree-shakeable. Safe for browser use.
*/

import type { RGB, Lab, OKLab } from "@/types/color-plan";

/* ---------- basic helpers ---------- */

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const clamp255 = (x: number) => Math.min(255, Math.max(0, Math.round(x)));

export const nearlyEqual = (a: number, b: number, eps = 1e-9) =>
  Math.abs(a - b) <= eps;

/* ---------- sRGB <-> linear sRGB ---------- */

export const srgbToLinear = (c: number): number => {
  // c in [0,1]
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

export const linearToSrgb = (c: number): number => {
  // c in [0,1]
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};

export const rgb8ToLinear = (rgb: RGB): [number, number, number] => {
  const r = srgbToLinear(rgb[0] / 255);
  const g = srgbToLinear(rgb[1] / 255);
  const b = srgbToLinear(rgb[2] / 255);
  return [r, g, b];
};

export const linearToRgb8 = (lin: [number, number, number]): RGB => {
  const r = clamp255(linearToSrgb(lin[0]) * 255);
  const g = clamp255(linearToSrgb(lin[1]) * 255);
  const b = clamp255(linearToSrgb(lin[2]) * 255);
  return [r, g, b];
};

/* ---------- sRGB (linear) <-> XYZ (D65) ---------- */

export const WHITE_D65 = { X: 0.95047, Y: 1.0, Z: 1.08883 };

export const linearRgbToXyzD65 = (
  lin: [number, number, number]
): [number, number, number] => {
  const [r, g, b] = lin;
  // sRGB -> XYZ (D65) matrix
  const X = 0.4123907992659593 * r + 0.3575843393838780 * g + 0.1804807884018343 * b;
  const Y = 0.2126390058715104 * r + 0.7151686787677560 * g + 0.0721923153607337 * b;
  const Z = 0.0193308187155918 * r + 0.1191947797946260 * g + 0.9505321522496607 * b;
  return [X, Y, Z];
};

export const xyzD65ToLinearRgb = (
  xyz: [number, number, number]
): [number, number, number] => {
  const [X, Y, Z] = xyz;
  // XYZ (D65) -> sRGB matrix (inverse)
  let r =
    3.240969941904521 * X +
    -1.537383177570093 * Y +
    -0.498610760293    * Z;
  let g =
    -0.96924363628087 * X +
    1.87596750150772 * Y +
    0.041555057407175 * Z;
  let b =
    0.055630079697    * X +
    -0.20397695888897 * Y +
    1.056971514242878 * Z;

  // Clamp tiny negatives from numerical noise
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);
  return [r, g, b];
};

/* ---------- XYZ (D65) <-> Lab (D65-referenced) ---------- */

const EPS = 216 / 24389; // ~0.008856
const KAPPA = 24389 / 27; // ~903.3

const fLab = (t: number): number => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const finvLab = (t: number): number => {
  const t3 = t * t * t;
  return t3 > EPS ? t3 : (116 * t - 16) / KAPPA;
};

export const xyzD65ToLab = (xyz: [number, number, number]): Lab => {
  const xr = xyz[0] / WHITE_D65.X;
  const yr = xyz[1] / WHITE_D65.Y;
  const zr = xyz[2] / WHITE_D65.Z;

  const fx = fLab(xr);
  const fy = fLab(yr);
  const fz = fLab(zr);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  return [L, a, b];
};

export const labToXyzD65 = (lab: Lab): [number, number, number] => {
  const [L, a, b] = lab;
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const xr = finvLab(fx);
  const yr = finvLab(fy);
  const zr = finvLab(fz);

  return [xr * WHITE_D65.X, yr * WHITE_D65.Y, zr * WHITE_D65.Z];
};

/* ---------- sRGB (8-bit) <-> Lab (D65) convenience ---------- */

export const rgbToLabD65 = (rgb: RGB): Lab => {
  const lin = rgb8ToLinear(rgb);
  const xyz = linearRgbToXyzD65(lin);
  return xyzD65ToLab(xyz);
};

export const labToRgbApprox = (lab: Lab): RGB => {
  const xyz = labToXyzD65(lab);
  const lin = xyzD65ToLinearRgb(xyz);
  return linearToRgb8(lin);
};

/* ---------- sRGB (8-bit) -> OKLab ---------- */
/* Formulas from Björn Ottosson (https://bottosson.github.io/posts/oklab/) */

export const rgbToOKLab = (rgb: RGB): OKLab => {
  const [r, g, b] = rgb8ToLinear(rgb);

  // Linear sRGB -> LMS
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  // Nonlinearity
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  return [L, A, B];
};

/* Optional: OKLab -> sRGB approx (not required for Task 1, but handy) */
export const oklabToRgbApprox = (ok: OKLab): RGB => {
  const [L, a, b] = ok;

  // OKLab -> LMS'
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS -> linear sRGB
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = +0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return linearToRgb8([clamp01(r), clamp01(g), clamp01(bl)]);
};

/* ---------- Distances ---------- */

export const deltaE76 = (L1: Lab, L2: Lab): number => {
  const dL = L1[0] - L2[0];
  const da = L1[1] - L2[1];
  const db = L1[2] - L2[2];
  return Math.hypot(dL, da, db);
};

// CIEDE2000 implementation based on Sharma et al. 2005
export const deltaE00 = (lab1: Lab, lab2: Lab): number => {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const avgLp = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;

  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) / 2;

  const h1p = Math.atan2(b1, a1p);
  const h2p = Math.atan2(b2, a2p);

  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const H1p = (toDeg(h1p) + 360) % 360;
  const H2p = (toDeg(h2p) + 360) % 360;

  let dHp = 0;
  const Hdiff = H2p - H1p;
  if (C1p * C2p === 0) {
    dHp = 0;
  } else if (Math.abs(Hdiff) <= 180) {
    dHp = Hdiff;
  } else if (Hdiff > 180) {
    dHp = Hdiff - 360;
  } else {
    dHp = Hdiff + 360;
  }

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHpTerm = 2 * Math.sqrt(C1p * C2p) * Math.sin(toRad(dHp) / 2);

  const avgHp =
    C1p * C2p === 0
      ? H1p + H2p
      : (H1p + H2p + (Math.abs(Hdiff) > 180 ? (H1p + H2p < 360 ? 360 : -360) : 0)) / 2;

  const T =
    1 -
    0.17 * Math.cos(toRad(avgHp - 30)) +
    0.24 * Math.cos(toRad(2 * avgHp)) +
    0.32 * Math.cos(toRad(3 * avgHp + 6)) -
    0.20 * Math.cos(toRad(4 * avgHp - 63));

  const Sl = 1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2));
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;

  const Rt =
    -2 *
    Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7))) *
    Math.sin(
      toRad(
        60 *
          Math.exp(
            -Math.pow((avgHp - 275) / 25, 2)
          )
      )
    );

  const dE = Math.sqrt(
    Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHpTerm / Sh, 2) + Rt * (dCp / Sc) * (dHpTerm / Sh)
  );

  return dE;
};

export const okDistance = (o1: OKLab, o2: OKLab): number => {
  // Simple Euclidean distance in OKLab (useful for diversity checks)
  const dL = o1[0] - o2[0];
  const da = o1[1] - o2[1];
  const db = o1[2] - o2[2];
  return Math.hypot(dL, da, db);
};

/* ---------- Hex / RGB helpers ---------- */

export const rgbToHex = (rgb: RGB): string => {
  const [r, g, b] = rgb;
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(clamp255(r))}${to2(clamp255(g))}${to2(clamp255(b))}`.toUpperCase();
};

export const hexToRgb = (hex: string): RGB => {
  const h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return [r, g, b];
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return [r, g, b];
  }
  // Fallback: try to parse 8-digit hex (ignore alpha)
  if (h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return [r, g, b];
  }
  // Invalid -> default to black
  return [0, 0, 0];
};

export const safeParseHex = (hex: string, fallback: RGB = [0, 0, 0]): RGB => {
  try {
    return hexToRgb(hex);
  } catch {
    return fallback;
  }
};

/* ---------- Convenience conversions ---------- */

export const rgb8ToLabD65 = (rgb: RGB): Lab => rgbToLabD65(rgb);
export const rgb8ToOKLab = (rgb: RGB): OKLab => rgbToOKLab(rgb);

/* ---------- Public distance helpers (app-level) ---------- */

export const distanceLabDE00 = (a: Lab, b: Lab) => deltaE00(a, b);
export const distanceLabDE76 = (a: Lab, b: Lab) => deltaE76(a, b);
export const distanceOKLab = (a: OKLab, b: OKLab) => okDistance(a, b);

/* ---------- Small utility to normalize RGB inputs ---------- */

export const normalizeRgb = (rgb: RGB): RGB => [
  clamp255(rgb[0]),
  clamp255(rgb[1]),
  clamp255(rgb[2]),
];

/* ---------- End of module ---------- */
