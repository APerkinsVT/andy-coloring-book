import React from "react";

export type PaletteEntry = { hex: string; name: string; brand?: string; number?: string };

export default function PaletteGrid({ palette }: { palette?: PaletteEntry[] | null }) {
  const items = palette ?? [];
  if (!items.length) {
    return (
      <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Color Palette</div>
        <div style={{ opacity: 0.7, fontStyle: "italic" }}>No palette yet.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Color Palette</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
        {items.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #ddd", background: c.hex }} />
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 14 }}>{c.name || c.hex}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {c.brand ? `${c.brand}${c.number ? ` ${c.number}` : ""}` : c.hex}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
