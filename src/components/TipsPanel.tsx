import React from "react";

type Props = { tips?: string[] };

export default function TipsPanel({ tips }: Props) {
  if (!tips || tips.length === 0) {
    return (
      <div aria-live="polite">
        <div style={{ fontStyle: "italic", opacity: 0.7 }}>
          No tips added yet.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 8px 0" }}>Coloring Tips</h3>
      <ol style={{ paddingLeft: 18, margin: 0 }}>
        {tips.map((t, i) => (
          <li key={i} style={{ margin: "8px 0" }}>
            {t}
          </li>
        ))}
      </ol>
    </div>
  );
}
