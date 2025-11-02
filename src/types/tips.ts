// src/types/tips.ts
export type Tip = {
  id: string;        // unique id
  rowIdx: number;    // 1-based index in the (deduped) table
  fcNo?: string;     // e.g., "101"
  name?: string;     // e.g., "Warm Grey V"
  hex?: string;      // swatch color
  text: string;      // tip body
};
