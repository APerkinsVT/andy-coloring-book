import React from "react";
import type { PaletteEntry } from "../types/manifest";

type Props = {
  palette?: PaletteEntry[];
};

function readableTextColor(hex: string): string {
  // Simple contrast heuristic so text stays readable on the swatch
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#000";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
  return luminance > 186 ? "#000" : "#fff";
}

export default function PaletteGrid({ palette }: Props) {
  if (!palette || palette.length === 0) {
    return (
      <div aria-live="polite">
        <div style={{ fontStyle: "italic", opacity: 0.7 }}>
          No palette found in this bundle (yet).
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 8px 0" }}>Color Palette</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {palette.map((p, idx) => {
          const textColor = readableTextColor(p.hex || "#ffffff");
          return (
            <div
              key={`${p.hex}-${idx}`}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
                display: "flex",
                gap: 12,
                alignItems: "stretch",
                background: "#fff",
              }}
            >
              <div
                aria-label={`Swatch ${p.hex}`}
                title={p.hex}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 6,
                  background: p.hex,
                  color: textColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontFamily: "monospace",
                }}
              >
                {p.hex?.toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: 600 }}>{p.name || "Unnamed swatch"}</div>
                {(p.brand || p.number) && (
                  <div style={{ opacity: 0.8, fontSize: 13 }}>
                    {p.brand ? `${p.brand}` : ""}{p.brand && p.number ? " · " : ""}{p.number ?? ""}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
