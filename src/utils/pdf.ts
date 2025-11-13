// src/utils/pdf.ts
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** ---------- Types ---------- */
export type Suggestion = {
  area: string;                 // e.g., "Sky", "Jacket"
  fcNo?: string;                // e.g., "151"
  fcName?: string;              // e.g., "Helioblue-Reddish"
  tip?: string;                 // short guidance for that area
  hex?: string;                 // optional swatch color hex (e.g., "#4A90E2")
};

export type BuildPdfOptions = {
  // Required
  lineArtUrl: string;           // PNG recommended for crisp lines
  originalUrl: string;          // source photo (jpg/png)
  filename?: string;            // e.g., "dory.png" (used for Title Case)
  // Optional
  generalTips?: string[];       // 0–3 short bullets
  suggestions?: Suggestion[];   // table rows
  portalUrl?: string;           // printed above QR
  qrPngUrl?: string;            // displayed bottom-right
};

/** ---------- Public API ---------- */
export async function buildTwoPagePdf(opts: BuildPdfOptions): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const M = 36; // 0.5" margins
  const PAGE = { W: 612, H: 792 };
  const PRINT = { W: PAGE.W - 2 * M, H: PAGE.H - 2 * M };

  // -------- Page 1: Title + Line Art --------
  const title = toTitleCase(stripExt(opts.filename || "Your Image"));
  if (title) {
    doc.setFontSize(18);
    doc.setTextColor(20);
    doc.text(title, M, M + 18);
  }

  const lineArt = await loadImage(opts.lineArtUrl);
  // leave ~36pt under title if present
  const topGap = title ? 28 : 0;
  const boxH = PRINT.H - topGap;
  const s1 = fit(lineArt.width, lineArt.height, PRINT.W, boxH);
  const x1 = M + (PRINT.W - s1.w) / 2;
  const y1 = M + topGap + (boxH - s1.h) / 2;

  doc.addImage(lineArt, imgType(lineArt), x1, y1, s1.w, s1.h, undefined, "FAST");

  // -------- Page 2: Photo + Tips + Table + QR --------
  doc.addPage();
  const photo = await loadImage(opts.originalUrl);
  const photoMax = ptFromIn(3); // 3" on long side
  const sPhoto = fit(photo.width, photo.height, photoMax, photoMax);
  const photoX = M;
  const photoY = M;

  doc.addImage(photo, imgType(photo), photoX, photoY, sPhoto.w, sPhoto.h, undefined, "FAST");
  doc.setFontSize(10);
  doc.setTextColor(80);
  const caption = title || stripExt(opts.filename || "");
  if (caption) doc.text(caption, photoX, photoY + sPhoto.h + 12);

  // Right column start for tips/table
  const colX = M + photoMax + 18;
  const colW = PAGE.W - M - colX;

  // General Tips (up to ~3 bullets)
  if (opts.generalTips && opts.generalTips.length) {
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text("General Tips", colX, M + 14);

    doc.setFontSize(10);
    doc.setTextColor(40);
    let y = M + 30;
    for (const tip of opts.generalTips.slice(0, 5)) {
      const wrapped = doc.splitTextToSize(`• ${tip}`, colW);
      doc.text(wrapped, colX, y);
      y += 14 + (wrapped.length - 1) * 12;
      if (y > PAGE.H - 140) break; // avoid colliding with QR/footer
    }
  }

  // Suggestions table
  const rows = (opts.suggestions || []).map((s) => {
    const fc = s.fcNo ? `${s.fcNo} ${s.fcName || ""}`.trim() : (s.fcName || "");
    return [s.area || "", fc, s.tip || ""];
  });

  autoTable(doc, {
    head: [["Area", "FC Pencil", "Suggestion"]],
    body: rows,
    startY: // below tips block
      Math.max(doc.lastAutoTable?.finalY || (M + 32), M + 110),
    startX: colX,
    tableWidth: colW,
    styles: { fontSize: 10, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [245, 245, 245], textColor: 0, lineWidth: 0.25 },
    columnStyles: {
      0: { cellWidth: colW * 0.33 },
      1: { cellWidth: colW * 0.25 },
      2: { cellWidth: colW * 0.42 },
    },
    margin: { top: M, left: colX, right: M, bottom: 120 }, // space for QR/URL
    pageBreak: "auto",
  });

  // Optional swatch band (if suggestions include hex)
  // Draw a compact swatch strip just under the table if space allows
  const swatches = (opts.suggestions || []).filter((s) => !!s.hex);
  if (swatches.length) {
    const yStart = Math.min(
      PAGE.H - 140,
      Math.max((doc as any).lastAutoTable?.finalY || (M + 200), M + 230)
    );
    let x = colX, y = yStart + 10;
    for (const s of swatches) {
      const rgb = hexToRgb(s.hex!);
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.rect(x, y, 18, 10, "F");
      x += 22;
      if (x + 18 > PAGE.W - M) { x = colX; y += 14; }
    }
  }

  // QR bottom-right + portal URL
  const qrSize = 90, qrX = PAGE.W - M - qrSize, qrY = PAGE.H - M - qrSize;
  if (opts.qrPngUrl) {
    const qr = await loadImage(opts.qrPngUrl);
    doc.addImage(qr, "PNG", qrX, qrY, qrSize, qrSize, undefined, "FAST");
  }
  doc.setFontSize(9);
  doc.setTextColor(60);
  if (opts.portalUrl) {
    const pretty = tidyUrl(opts.portalUrl);
    doc.text(pretty, qrX, qrY - 6, { maxWidth: qrSize });
  }

  // Output
  return doc.output("blob");
}

/** Convenience: build then open in a new tab */
export async function openTwoPagePdf(opts: BuildPdfOptions) {
  const blob = await buildTwoPagePdf(opts);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  return url;
}

/** ---------- Helpers ---------- */
function fit(w: number, h: number, maxW: number, maxH: number) {
  const r = Math.min(maxW / w, maxH / h);
  return { w: Math.round(w * r), h: Math.round(h * r) };
}
function ptFromIn(inches: number) { return Math.round(inches * 72); }
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function stripExt(name: string) {
  return name.replace(/\.[^.]+$/, "");
}
function toTitleCase(s: string) {
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}
function tidyUrl(u: string) {
  try { const x = new URL(u); return x.host + x.pathname; } catch { return u; }
}
function imgType(img: HTMLImageElement) {
  const src = (img as any).src || "";
  if (src.includes(".png") || src.startsWith("data:image/png")) return "PNG";
  return "JPEG";
}
async function loadImage(url: string) {
  const img = new Image();
  img.crossOrigin = "anonymous"; // Vercel Blob is public; prevents taint
  img.decoding = "async";
  img.src = url;
  await img.decode().catch(() => {});
  return img;
}
