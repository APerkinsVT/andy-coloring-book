// src/utils/pdf.ts
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type PaletteRow = {
  number: string;           // e.g., "151"
  name: string;             // e.g., "Helio Turquoise"
  hex: string;              // "#RRGGBB"
};

export function buildPdf(opts: {
  title: string;
  originalDataUrl: string;
  lineArtUrl: string;
  palette?: PaletteRow[];
  guide?: string[];
}) {
  const { title, originalDataUrl, lineArtUrl, palette = [], guide = [] } = opts;
  const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792

  // Cover / Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(title, 48, 48);

  // Page 1: Line art large
  const margin = 48;
  const w = 612 - margin * 2;
  const h = 792 - margin * 2 - 24;
  doc.addImage(lineArtUrl, "PNG", margin, margin + 24, w, h, undefined, "FAST");

  // Page break
  doc.addPage();

  // Page 2: Original + Guide + Palette
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Original Photo", margin, margin);

  const photoW = w * 0.6;
  const photoH = (photoW * 9) / 16; // fallback aspect
  doc.addImage(originalDataUrl, "JPEG", margin, margin + 12, photoW, photoH, undefined, "FAST");

  // Guide (bullets)
  const guideX = margin;
  let guideY = margin + 12 + photoH + 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Coloring Guide", guideX, guideY);
  guideY += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const wrapWidth = 612 - margin * 2;
  guide.forEach((line) => {
    const lines = doc.splitTextToSize(`• ${line}`, wrapWidth);
    doc.text(lines as unknown as string[], guideX, (guideY += 14));
  });

  // Palette table
  if (palette.length) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Palette", margin, margin);

    // Build rows with a drawn swatch
    const rows = palette.map((p) => {
      return [
        p.number,
        p.name,
        p.hex.toUpperCase(),
        "" // swatch column placeholder
      ];
    });

    autoTable(doc, {
      startY: margin + 12,
      head: [["#", "Pencil", "HEX", "Swatch"]],
      body: rows,
      styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const row = palette[data.row.index];
          if (!row) return;
          const { cell } = data;
          const pad = 4;
          const x = cell.x + pad;
          const y = cell.y + pad;
          const width = cell.width - pad * 2;
          const height = cell.height - pad * 2;
          doc.setFillColor(row.hex);
          doc.setDrawColor(120);
          doc.rect(x, y, width, height, "FD");
        }
      },
      columnStyles: { 3: { cellWidth: 60 } }
    });
  }

  return doc;
}
