// src/components/TipsPanel.tsx
import React from "react";

type PencilMeta = { brand?: string; name?: string; number?: string };
type TipObj = { text: string; pencil?: PencilMeta };
type TipLike = string | TipObj;
type Props = { tips?: TipLike[] | null; title?: string };

function norm(t: TipLike): TipObj {
  return typeof t === "string" ? { text: t } : { text: t?.text ?? "", pencil: t?.pencil };
}

export default function TipsPanel({ tips, title = "Tips & Suggestions" }: Props) {
  const items = Array.isArray(tips) ? tips.map(norm).filter(x => x.text.trim()) : [];
  if (!items.length)
    return <div className="rounded-xl bg-white shadow-sm p-3 text-xs text-slate-500 border">No tips yet.</div>;

  const general = items.filter(t => !t.pencil);
  const specific = items.filter(t => !!t.pencil);

  return (
    <div className="rounded-xl bg-white shadow-sm p-3 border">
      <h2 className="text-sm font-semibold mb-2">{title}</h2>

      {general.length > 0 && (
        <>
          <div className="text-[11px] font-semibold text-slate-500 mb-1">General tips</div>
          <ol className="list-decimal pl-5 space-y-1 mb-3 text-[13px] text-slate-800">
            {general.map((t, i) => <li key={`g-${i}`}>{t.text}</li>)}
          </ol>
        </>
      )}

      {specific.length > 0 && (
        <>
          <div className="text-[11px] font-semibold text-slate-500 mb-1">Image-specific</div>
          <ul className="space-y-2">
            {specific.map((t, i) => (
              <li key={`s-${i}`} className="text-[13px] text-slate-800 border rounded-md p-2 flex items-start gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border bg-slate-50 text-slate-700 whitespace-nowrap">
                  <span className="inline-block w-[14px] h-[14px] border rounded-sm bg-white" />
                  <span className="font-medium">Pencil</span>
                  {renderPencil(t.pencil)}
                </span>
                <span className="leading-snug">{t.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function renderPencil(p?: PencilMeta) {
  if (!p || (!p.name && !p.number && !p.brand)) return null;
  const parts = [
    p.name ? String(p.name) : null,
    p.number ? `(${String(p.number)})` : null,
    p.brand ? <span className="text-slate-400">· {p.brand}</span> : null,
  ].filter(Boolean);
  return <span className="inline-flex gap-1">{parts}</span>;
}
