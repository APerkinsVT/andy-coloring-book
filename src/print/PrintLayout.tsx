import React from "react";
import "./print.css";

export type Orientation = "portrait" | "landscape";

type Props = {
  lineArtDataUrl: string;
  orientation: Orientation;
  title: string;
  onAfterPrint?: () => void;
};

export default function PrintLayout({
  lineArtDataUrl,
  orientation,
  title,
  onAfterPrint,
}: Props) {
  // Install body classes for orientation + print mode
  React.useEffect(() => {
    const cls = orientation === "landscape" ? "print-landscape" : "print-portrait";
    document.body.classList.add("print-view", cls);
    return () => document.body.classList.remove("print-view", "print-portrait", "print-landscape");
  }, [orientation]);

  // Trigger print after first paint; clean up after dialog closes
  React.useEffect(() => {
    const handler = () => onAfterPrint?.();
    window.addEventListener("afterprint", handler);
    const t = setTimeout(() => window.print(), 100); // give layout a moment
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", handler);
    };
  }, [onAfterPrint]);

  return (
    <div className="print-root">
      <div className="page page-one">
        <header className="print-title">{title}</header>
        <main className="lineart-frame">
          <img
            src={lineArtDataUrl}
            alt="Line art"
            className="lineart-img"
            onError={(e) => {
              // Tiny diagnostic to help if an exotic URL fails
              console.error("Print image failed to load", (e.target as HTMLImageElement).src);
            }}
          />
        </main>
      </div>
    </div>
  );
}

export function titleFromFilename(name?: string): string {
  if (!name) return "Untitled";
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  return base
    .replace(/[_\-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
