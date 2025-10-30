// src/utils/colorMatch.ts
// Map input HEX colors to nearest Faber-Castell pencils using ΔE2000 in CIE Lab.

export type Lab = { L: number; a: number; b: number }
export type FCLike = { id: number; name: string; hex: string }

const hexToRgb01 = (hex: string) => {
  const h = hex.replace('#', '')
  const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return { r: parseInt(s.slice(0, 2), 16) / 255, g: parseInt(s.slice(2, 4), 16) / 255, b: parseInt(s.slice(4, 6), 16) / 255 }
}
const srgbToLin = (u: number) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4))
const rgbToXyz = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b)
  return {
    x: R * 0.4124564 + G * 0.3575761 + B * 0.1804375,
    y: R * 0.2126729 + G * 0.7151522 + B * 0.072175,
    z: R * 0.0193339 + G * 0.1191920 + B * 0.9503041,
  }
}
export const hexToLab = (hex: string): Lab => {
  const { x, y, z } = rgbToXyz(hexToRgb01(hex))
  const Xn = 0.95047, Yn = 1, Zn = 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x / Xn), fy = f(y / Yn), fz = f(z / Zn)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

// ΔE2000 (compact)
export const deltaE = (l1: Lab, l2: Lab) => {
  const { L: L1, a: a1, b: b1 } = l1, { L: L2, a: a2, b: b2 } = l2
  const avgLp = (L1 + L2) / 2
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), avgC = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))))
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2), avgCp = (C1p + C2p) / 2
  const h1p = Math.atan2(b1, a1p), h2p = Math.atan2(b2, a2p)
  const H1p = h1p >= 0 ? h1p : h1p + 2 * Math.PI, H2p = h2p >= 0 ? h2p : h2p + 2 * Math.PI
  const dLp = L2 - L1, dCp = C2p - C1p
  let dhp = H2p - H1p; if (dhp > Math.PI) dhp -= 2 * Math.PI; if (dhp < -Math.PI) dhp += 2 * Math.PI
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2)
  const avgHp = Math.abs(H1p - H2p) > Math.PI ? (H1p + H2p + 2 * Math.PI) / 2 : (H1p + H2p) / 2
  const T = 1 - 0.17 * Math.cos(avgHp - Math.PI / 6) + 0.24 * Math.cos(2 * avgHp) +
            0.32 * Math.cos(3 * avgHp + Math.PI / 30) - 0.20 * Math.cos(4 * avgHp - (63 * Math.PI) / 180)
  const Sl = 1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2))
  const Sc = 1 + 0.045 * avgCp
  const Sh = 1 + 0.015 * avgCp * T
  const dt = (30 * Math.PI) / 180 * Math.exp(-Math.pow((avgHp * 180 / Math.PI - 275) / 25, 2))
  const Rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)))
  const Rt = -Rc * Math.sin(2 * dt)
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh))
}

// Returns best k matches per input hex
export function nearestFC(
  inputHexes: string[],
  lib: FCLike[],
  k = 1
): { inputHex: string; matches: { id: number; name: string; hex: string; deltaE: number }[] }[] {
  const libLab = lib.map(p => ({ ...p, lab: hexToLab(p.hex) }))
  return inputHexes.map(h => {
    const lab = hexToLab(h)
    const ranked = libLab
      .map(p => ({ id: p.id, name: p.name, hex: p.hex, deltaE: deltaE(lab, p.lab) }))
      .sort((a, b) => a.deltaE - b.deltaE)
      .slice(0, k)
    return { inputHex: h, matches: ranked }
  })
}
