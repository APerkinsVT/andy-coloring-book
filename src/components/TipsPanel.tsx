import React, { useMemo } from "react";

type PencilMeta = { brand?: string; name?: string; number?: string; hex?: string };
type TipObj = { text: string; pencil?: PencilMeta };
type TipLike = string | TipObj;

type PaletteEntry = { hex: string; name: string; brand?: string; number?: string };
type Props = {
  tips?: TipLike[] | null;
  palette?: PaletteEntry[] | null; // <-- to fetch the hex for each tip
  title?: string;
};

function norm(t: TipLike): TipObj {
  return typeof t === "string" ? { text: t } : { text: t?.text ?? "", pencil: t?.pencil };
}

export default function TipsPanel({ tips, palette, title = "Tips & Suggestions" }: Props) {
  const items = Array.isArray(tips) ? tips.map(norm).filter(x => x.text.trim()) : [];

  // Build a quick lookup so we can attach hex to specific tips
  const byKey = useMemo(() => {
    const map = new Map<string, string>(); // key -> hex
    (palette || []).forEach(p => {
      const hex = (p.hex || "").toUpperCase();
      if (!hex) return;
      const name = (p.name || "").trim().toLowerCase();
      const num  = (p.number || "").toString().trim().toLowerCase();
      if (name) map.set(`n:${name}`, hex);
      if (num)  map.set(`#:${num}`,  hex);
      // name+num for extra safety
      if (name && num) map.set(`n#:${name}__${num}`, hex);
    });
    return map;
  }, [palette]);

  // Enrich specific tips with hex if we can match on number or name
  const enriched = items.map(t => {
    if (!t.pencil) return t;
    const name = (t.pencil.name || "").trim().toLowerCase();
    const num  = (t.pencil.number || "").toString().trim().toLowerCase();
    const hex =
      byKey.get(`n#:${name}__${num}`) ||
      byKey.get(`#:${num}`) ||
      byKey.get(`n:${name}`) ||
      t.pencil.hex;
    return hex ? { ...t, pencil: { ...t.pencil, hex } } : t;
  });

  const general  = enriched.filter(t => !t.pencil);
  const specific = enriched.filter(t => !!t.pencil);

  const brandOnce =
    specific.find(t => t.pencil?.brand)?.pencil?.brand || "Faber-Castell Polychromos";

  if (!general.length && !specific.length) {
    return (
      <div className="rounded-xl bg-white shadow-sm p-3 text-xs text-slate-500 border">
        No tips yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white shadow-sm p-3 border">
      <h2 className="text-sm font-semibold mb-2">{title}</h2>

      {/* General tips */}
      {general.length > 0 && (
        <>
          <div className="text-[11px] font-semibold text-slate-500 mb-1">General tips</div>
          <ol className="list-decimal pl-5 space-y-1 mb-3 text-[13px] text-slate-800">
            {general.map((t, i) => (
              <li key={`g-${i}`}>{t.text}</li>
            ))}
          </ol>
        </>
      )}

      {/* Image-specific tips */}
      {specific.length > 0 && (
        <>
          <div className="text-[11px] font-semibold text-slate-500 mb-2">
            Image-specific — <span className="text-slate-700">{brandOnce} pencils</span>
          </div>
          <ul className="space-y-2">
            {specific.map((t, i) => (
              <li
                key={`s-${i}`}
                className="text-[13px] text-slate-800 border rounded-md p-2 flex items-start gap-2"
              >
                <SwatchBadge pencil={t.pencil} />
                <span className="leading-snug">{t.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function SwatchBadge({ pencil }: { pencil?: PencilMeta }) {
  const hex = (pencil?.hex || "").toUpperCase();
  const name = pencil?.name ? String(pencil.name) : "";
  const num  = pencil?.number ? String(pencil.number) : "";

  // Visual swatch + concise label
  return (
    <span className="inline-flex items-center gap-2 text-[11px] px-2 py-1 rounded border bg-slate-50 text-slate-700 whitespace-nowrap">
      <span
        className="inline-block w-[14px] h-[14px] border rounded-sm"
        style={hex ? { backgroundColor: hex } : undefined}
        title={hex || undefined}
      />
      <span className="font-medium">{name || "Pencil"}</span>
      {num && <span>({num})</span>}
    </span>
  );
}
