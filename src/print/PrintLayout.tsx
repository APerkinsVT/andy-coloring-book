// src/print/PrintLayout.tsx
import React from "react";
import jsPDF from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";

type SuggestionRow = {
  area?: string;
  fcNo?: string;
  fcName?: string;
  tip?: string;
  hex?: string; // swatch color, e.g. "#AABBCC"
};

type Props = {
  lineArtUrl: string;            // REQUIRED
  originalUrl?: string;
  filename?: string;
  generalTips?: string[];        // bullet list above table
  suggestions?: SuggestionRow[]; // rows for the table
  portalUrl?: string;            // (not rendered here yet)
  qrPngUrl?: string;             // (not rendered here yet)
};

const MARGIN = 36;      // 0.5"
const TITLE_SIZE = 16;
const BODY_SIZE = 10;

export default function PrintLayout({
  lineArtUrl,
  originalUrl,
  filename,
  generalTips = [],
  suggestions = [],
}: Props) {
  async function onPrint() {
    if (!lineArtUrl) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // -------- helpers --------
    const toTitleCase = (s: string) =>
      s
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());

    const loadImageAsDataUrl = async (url: string): Promise<string> => {
      if (url.startsWith("data:")) return url;
      const r = await fetch(url, { mode: "cors" });
      if (!r.ok) throw new Error(`Failed to fetch image: ${url}`);
      const blob = await r.blob();
      return await new Promise<string>((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.readAsDataURL(blob);
      });
    };

    const getImageSize = (dataUrl: string): Promise<{ w: number; h: number }> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = reject;
        img.src = dataUrl;
      });

    const fitImage = (imgW: number, imgH: number, boxW: number, boxH: number) => {
      const scale = Math.min(boxW / imgW, boxH / imgH);
      return { w: imgW * scale, h: imgH * scale };
    };

    const hexToRgb = (hex: string): [number, number, number] => {
      const h = hex.startsWith("#") ? hex.slice(1) : hex;
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };

    const baseTitle = toTitleCase((filename || "PhotoLineArt").replace(/\.[a-z0-9]+$/i, ""));

    // ─────────────────────────────────────────
    // PAGE 1 — title + line art (fills area)
    // ─────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(TITLE_SIZE);
    const titleY = MARGIN;
    doc.text(baseTitle, MARGIN, titleY);

    const lineDataUrl = await loadImageAsDataUrl(lineArtUrl);
    const lineImg = await getImageSize(lineDataUrl);

    const topY = titleY + 10 + MARGIN / 2;      // reserve space under title
    const boxW1 = pageW - 2 * MARGIN;
    const boxH1 = pageH - topY - MARGIN;
    const fitted1 = fitImage(lineImg.w, lineImg.h, boxW1, boxH1);
    const x1 = MARGIN + (boxW1 - fitted1.w) / 2;
    const y1 = topY + (boxH1 - fitted1.h) / 2;
    doc.addImage(lineDataUrl, "PNG", x1, y1, fitted1.w, fitted1.h, undefined, "FAST");

    // ─────────────────────────────────────────
    // PAGE 2 — centered original + wide table
    // ─────────────────────────────────────────
    doc.addPage("letter", "portrait");
    let cursorY = MARGIN;

    if (originalUrl) {
      const origDataUrl = await loadImageAsDataUrl(originalUrl);
      const orig = await getImageSize(origDataUrl);
      const maxSide = 180; // ~2.5"
      const fitted2 = fitImage(orig.w, orig.h, maxSide, maxSide);
      const x2 = (pageW - fitted2.w) / 2;
      doc.addImage(origDataUrl, "PNG", x2, cursorY, fitted2.w, fitted2.h, undefined, "FAST");

      // small caption under image
      doc.setFont("helvetica", "normal");
      doc.setFontSize(BODY_SIZE);
      const capW = doc.getTextWidth(baseTitle);
      doc.text(baseTitle, (pageW - capW) / 2, cursorY + fitted2.h + 14);

      cursorY += fitted2.h + 24;
    }

    // Optional short general tips
    if (generalTips.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(BODY_SIZE);
      doc.text("General Tips", MARGIN, cursorY);
      cursorY += 12;

      doc.setFont("helvetica", "normal");
      generalTips.slice(0, 6).forEach((t) => {
        const text = `• ${t}`;
        const wrapped = doc.splitTextToSize(text, pageW - 2 * MARGIN);
        doc.text(wrapped, MARGIN, cursorY);
        cursorY += wrapped.length * 12 + 4;
      });

      cursorY += 6;
    }

    // Table data (Swatch | Area | FC Pencil | Suggestion)
    const head = [["", "Area", "FC Pencil", "Suggestion"]];
    const rows: RowInput[] = (suggestions || []).map((r) => {
      const pencil = [r.fcNo, r.fcName].filter(Boolean).join(" — ");
      return [r.hex || "", r.area || "", pencil || "", r.tip || ""];
    });

    autoTable(doc, {
      head,
      body: rows,
      startY: cursorY,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: doc.internal.pageSize.getWidth() - 2 * MARGIN,
      styles: {
        font: "helvetica",
        fontSize: BODY_SIZE,
        overflow: "linebreak",
        // GLOBAL padding (tighter overall)
        cellPadding: { top: 4, right: 6, bottom: 4, left: 6 } as any,
        minCellWidth: 10,
      },
      headStyles: { fillColor: [230, 230, 230] },
      columnStyles: {
        0: { cellWidth: 22 },   // Swatch
        1: { cellWidth: 90 },   // Area
        2: { cellWidth: 90 },   // FC Pencil
        3: { cellWidth: "auto" } // Suggestion expands
      },
      didParseCell: (data) => {
        // Make FC Pencil a hair smaller to fit number + name
        if ((data.section === "body" || data.section === "head") && data.column.index === 2) {
          data.cell.styles.fontSize = 9;
        }
        // Reduce swatch cell min height & padding so it never forces tall rows
        if (data.section === "body" && data.column.index === 0) {
          data.cell.styles.minCellHeight = 10;
          data.cell.styles.cellPadding = { top: 2, right: 3, bottom: 2, left: 3 } as any;
        }
      },
      didDrawCell: (data) => {
        // Paint swatch
        if (data.section === "body" && data.column.index === 0) {
          const hex = String(data.cell.raw || "").trim();
          if (/^#?[0-9a-f]{6}$/i.test(hex)) {
            const [r, g, b] = hexToRgb(hex);
            const pad = 2; // keep in sync with swatch padding above
            const x = data.cell.x + pad;
            const y = data.cell.y + pad;
            const w = data.cell.width - 2 * pad;
            const h = data.cell.height - 2 * pad;
            doc.setFillColor(r, g, b);
            doc.setDrawColor(90, 90, 90);
            doc.roundedRect(x, y, w, h, 2, 2, "FD");
          }
        }
      },
    });

    // Open PDF in new tab
    const url = doc.output("bloburl");
    const win = window.open(url, "_blank");
    if (win && "name" in win) try { (win as any).document.title = `${baseTitle}.pdf`; } catch {}
  }

  return (
    <button
      onClick={onPrint}
      disabled={!lineArtUrl}
      className="px-3 py-2 rounded-md bg-white border text-slate-900 disabled:opacity-50"
      title="Opens a 2-page PDF; use your browser’s Save as PDF."
    >
      Print / Save as PDF
    </button>
  );
}
