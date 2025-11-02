// src/components/TipsPanel.tsx
import React from "react";
import type { Tip } from "@/types/tips";
import { GENERIC_TIPS } from "@/utils/suggestTips";

type Props = {
  tips: Tip[];                // auto-suggested, already synced to kit
  showGeneric?: boolean;      // default true
};

export default function TipsPanel({ tips, showGeneric = true }: Props) {
  return (
    <div className="rounded-xl bg-white border shadow-sm p-3">
      <h3 className="text-base font-semibold mb-2">Tips & Suggestions</h3>

      {showGeneric && (
        <>
          <div className="text-xs font-semibold text-slate-600 mb-1">General tips</div>
          <ol className="list-decimal pl-5 text-sm space-y-1 mb-3">
            {GENERIC_TIPS.map((t, i) => <li key={i}>{t}</li>)}
          </ol>
          <div className="h-px bg-slate-200 mb-3" />
        </>
      )}

      <div className="text-xs font-semibold text-slate-600 mb-1">Image-specific</div>
      <div className="space-y-3">
        {tips.length === 0 ? (
          <div className="text-sm text-slate-500">No tips yet.</div>
        ) : tips.map((t) => (
          <div key={t.id} className="border rounded-md p-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 border">#{t.rowIdx}</span>
              {t.hex && <span className="inline-block w-4 h-4 rounded border" style={{background:t.hex}} />}
              <span className="text-sm">{t.name ?? "Pencil"} {t.fcNo ? <span className="text-slate-500">({t.fcNo})</span> : null}</span>
            </div>
            <div className="text-sm">{t.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
