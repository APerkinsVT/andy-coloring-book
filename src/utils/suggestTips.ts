// src/utils/suggestTips.ts
import type { Tip } from "@/types/tips";

export type TipRow = {
  idx: number;
  hex?: string;
  fcNo?: string;
  name?: string;
  coveragePct?: number;
  deltaE?: number;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function suggestTips(rows: TipRow[], limit = 6): Tip[] {
  if (!rows?.length) return [];
  const sorted = [...rows].sort((a, b) => (b.coveragePct ?? 0) - (a.coveragePct ?? 0));

  const isWhite   = (n = "") => /\bwhite\b/i.test(n);
  const isGrey    = (n = "") => /\bgrey|gray\b/i.test(n);
  const isGreen   = (n = "") => /\bgreen|olive\b/i.test(n);
  const isBlue    = (n = "") => /\bblue|ultramarine|indanthrene|cobalt\b/i.test(n);
  const isBrown   = (n = "") => /\bbrown|umber|sienna|sepia|ochre\b/i.test(n);
  const isRed     = (n = "") => /\bred|magenta|carmine|scarlet\b/i.test(n);
  const isYellow  = (n = "") => /\byellow|gold|naples|cadmium\b/i.test(n);

  const out: Tip[] = [];
  const push = (r: TipRow, text: string) =>
    out.push({ id: uid(), rowIdx: r.idx, fcNo: r.fcNo, name: r.name, hex: r.hex, text });

  // 2–3 largest areas
  for (const r of sorted.slice(0, Math.min(3, sorted.length))) {
    push(
      r,
      `Large area (~${(r.coveragePct ?? 0).toFixed(1)}%). Lay a light base with ${r.name ?? "this pencil"}${r.fcNo ? ` (${r.fcNo})` : ""}, then deepen shadows with gentle layers. Keep small highlights paper-white.`
    );
  }

  const pick = (pred: (n: string) => boolean) => sorted.find((r) => pred(r.name ?? ""));
  const rGrey = pick(isGrey), rWhite = pick(isWhite), rGreen = pick(isGreen),
        rBlue = pick(isBlue), rBrown = pick(isBrown), rRed = pick(isRed) || pick(isYellow);

  if (rGrey)  push(rGrey,  "Shading & form. Short strokes along contours; build mid-tones lightly; keep edges crisp with a sharp tip.");
  if (rWhite) push(rWhite, "Highlights. Burnish tiny bright spots to keep them luminous. Feather edges into nearby color.");
  if (rGreen) push(rGreen, "Foliage. Block shapes with soft circular strokes; glaze a darker green on the shadow side.");
  if (rBlue)  push(rBlue,  "Sky/Water. Make a gentle gradient; for water add faint horizontal strokes.");
  if (rBrown) push(rBrown, "Wood/Earth. Suggest texture with directional strokes, then burnish select areas for varied sheen.");
  if (rRed)   push(rRed,   "Accents. Use minimal pressure and leave highlights open—don’t fill them fully.");

  return out.slice(0, limit);
}

export const GENERIC_TIPS: string[] = [
  "Start with light pressure. Build color slowly so you can adjust.",
  "Block in large shapes first, then add smaller details.",
  "For shading, layer the local color first, then add a darker pencil lightly.",
  "Keep pencils sharp for edges; slightly rounded tips fill larger areas smoothly.",
  "Blend by layering: two or three light passes beat one heavy pass.",
  "Leave tiny paper-white gaps for bright highlights.",
];
