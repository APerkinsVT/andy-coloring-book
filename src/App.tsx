/* src/App.tsx */

import React from "react";
import "@/index.css";

import ColorPlanPanel from "@/components/ColorPlanPanel";
import TipsPanel from "@/components/TipsPanel";

import type { ColorPlan, ColorCluster } from "@/types/color-plan";
import { KitSize } from "@/types/color-plan";
import type { Tip } from "@/types/tips";

import { generateColorPlan } from "@/services/color";
import { generateAiLineArt } from "@/services/aiLineart";
import { openPrintView } from "@/print";
import { suggestTips } from "@/utils/suggestTips";

/* ────────────────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────────────────── */
type GenStatus = "idle" | "generating" | "done" | "error";
type AnalyzeStatus = "idle" | "analyzing" | "done" | "error";

/* ────────────────────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────────────────────── */
export default function App() {
  /* ======================
     SECTION B: state
     ====================== */
  const [fileName, setFileName] = React.useState<string | undefined>(undefined);
  const [sourceUrl, setSourceUrl] = React.useState<string | undefined>(undefined);
  const [sourceDataUrl, setSourceDataUrl] = React.useState<string | undefined>(undefined);
  const [lineUrl, setLineUrl] = React.useState<string | undefined>(undefined);

  const [genStatus, setGenStatus] = React.useState<GenStatus>("idle");
  const [anStatus, setAnStatus] = React.useState<AnalyzeStatus>("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const [plan, setPlan] = React.useState<ColorPlan | null>(null);

  const imgRef = React.useRef<HTMLImageElement | null>(null);

  // current kit from the panel's <select id="kit">
  const kit: KitSize = (() => {
    const el = document.getElementById("kit") as HTMLSelectElement | null;
    return el ? (Number(el.value) as KitSize) : (KitSize.K72 as KitSize);
  })();

  // rows for tips & printing (deduped, same as Page 3)
  const rowsForTips = React.useMemo(() => {
    if (!plan) return [];
    return buildPrintableFromPlan(plan, kit).rows;
  }, [plan, kit]);

  // auto-suggested tips, always in sync with image + kit
  const tipsSuggested: Tip[] = React.useMemo(() => {
    return suggestTips(rowsForTips);
  }, [rowsForTips]);

  /* ======================
     SECTION C: handlers
     ====================== */

  function onChoosePhoto(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setFileName(f.name);
    setSourceUrl(url);
    setSourceDataUrl(undefined);
    setLineUrl(undefined);
    setPlan(null);
    setGenStatus("idle");
    setAnStatus("idle");
    setErrorMsg(null);
  }

  async function onGenerateLineArt() {
    if (!imgRef.current) return;
    setGenStatus("generating");
    setErrorMsg(null);

    try {
      const imageDataUrl = imageToDataUrl(imgRef.current, 1600);
      setSourceDataUrl(imageDataUrl);

      const { imageUrl } = await generateAiLineArt(imageDataUrl);
      if (!imageUrl) throw new Error("ai-lineart.ts returned no imageUrl");

      setLineUrl(imageUrl);
      setGenStatus("done");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Line art generation failed.");
      setGenStatus("error");
    }
  }

  async function onAnalyzeColors() {
    if (!imgRef.current) return;
    if (genStatus !== "done") return;

    setAnStatus("analyzing");
    setErrorMsg(null);

    try {
      const colorPlan = await generateColorPlan(imgRef.current, fileName);
      setPlan(colorPlan);
      setAnStatus("done");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Color analysis failed.");
      setAnStatus("error");
    }
  }

  function onPrintPdf() {
    if (!lineUrl) return;

    const printablePlan = plan ? buildPrintableFromPlan(plan, kit) : undefined;

    openPrintView({
      lineArtDataUrl: lineUrl,
      originalDataUrl: sourceDataUrl,
      fileName,
      orientation:
        ((plan as any)?.source?.orientation as "portrait" | "landscape") || "portrait",
      colorPlan: printablePlan,
      tips: tipsSuggested, // Page 2: read-only, auto-suggested tips
    });
  }

  function onDownloadPdf() {
    alert("Use “Print / Save as PDF” and choose Destination: Save as PDF.");
  }

  function onReset() {
    setFileName(undefined);
    setSourceUrl(undefined);
    setSourceDataUrl(undefined);
    setLineUrl(undefined);
    setPlan(null);
    setGenStatus("idle");
    setAnStatus("idle");
    setErrorMsg(null);
  }

  /* ======================
     SECTION D: render
     ====================== */

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto p-4">
        <header className="mb-3">
          <h1 className="text-xl font-bold">AKP Coloring Book</h1>
          <p className="text-xs text-slate-600">
            Upload a photo → generate clean line art → analyze colors → print.
          </p>
        </header>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md bg-white cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={onChoosePhoto} />
            <span>Choose Photo</span>
          </label>

          <button
            onClick={onGenerateLineArt}
            disabled={!sourceUrl || genStatus === "generating"}
            className="px-3 py-2 rounded-md bg-indigo-600 text-white disabled:opacity-50"
          >
            {genStatus === "generating" ? "Generating…" : "Generate Line Art"}
          </button>

          <button
            onClick={onAnalyzeColors}
            disabled={!sourceUrl || genStatus !== "done" || anStatus === "analyzing"}
            className="px-3 py-2 rounded-md bg-emerald-600 text-white disabled:opacity-50"
            title={genStatus !== "done" ? "Run line art first" : "Re-run color analysis"}
          >
            {anStatus === "analyzing" ? "Analyzing…" : "Analyze Colors"}
          </button>

          <button
            className="px-3 py-2 rounded-md bg-white border text-slate-900 disabled:opacity-50"
            onClick={onPrintPdf}
            disabled={!lineUrl}
            title="Opens the print dialog; choose 'Save as PDF' to save."
          >
            Print / Save as PDF
          </button>

          <button
            onClick={onDownloadPdf}
            className="px-3 py-2 rounded-md bg-slate-800 text-white disabled:opacity-50"
            disabled={!sourceUrl || !lineUrl}
          >
            Download PDF
          </button>

          <button onClick={onReset} className="px-3 py-2 rounded-md bg-white border">
            Reset
          </button>
        </div>

        {/* Error banner */}
        {errorMsg && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md p-2">
            {errorMsg}
          </div>
        )}

        {/* Layout */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Left: Original */}
          <div className="rounded-xl bg-white border shadow-sm p-3">
            <h2 className="text-sm font-semibold mb-2">Original</h2>
            {sourceUrl ? (
              <img
                ref={imgRef}
                src={sourceUrl}
                alt="Original"
                className="max-h-[70vh] w-full object-contain rounded-md border bg-white"
              />
            ) : (
              <Placeholder />
            )}
          </div>

          {/* Middle: Line Art */}
          <div className="rounded-xl bg-white border shadow-sm p-3">
            <h2 className="text-sm font-semibold mb-2">Line Art (AI)</h2>
            {lineUrl ? (
              <img
                src={lineUrl}
                alt="AI line art"
                className="max-h-[70vh] w-full object-contain rounded-md border bg-white"
              />
            ) : (
              <Placeholder />
            )}
          </div>

          {/* Right: Color Plan + Tips */}
          <div className="space-y-4">
            <div className="rounded-xl bg-white shadow-sm p-3">
              <h2 className="text-sm font-semibold mb-2">Color Plan</h2>
              {plan ? (
                <ColorPlanPanel
                  plan={plan}
                  defaultKitSize={KitSize.K12}
                  showConfidence={true}
                />
              ) : (
                <div className="text-xs text-slate-600">
                  Run “Analyze Colors” after generating line art.
                </div>
              )}
            </div>

            {plan ? <TipsPanel tips={tipsSuggested} /> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

/* ======================
   SECTION E: helpers
   ====================== */

function Placeholder() {
  return (
    <div className="h-[200px] grid place-items-center text-sm text-gray-500 border rounded-md bg-gray-50">
      Choose a photo to begin.
    </div>
  );
}

/** Downscale an IMG to a DataURL for API consumption. */
function imageToDataUrl(imgEl: HTMLImageElement, maxDim = 1600): string {
  const w = imgEl.naturalWidth || imgEl.width;
  const h = imgEl.naturalHeight || imgEl.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(imgEl, 0, 0, cw, ch);
  return canvas.toDataURL("image/png");
}

/** Build printable rows (same selection as panel) + de-dupe identical pencils. */
function buildPrintableFromPlan(
  plan: ColorPlan,
  kit: KitSize
): import("@/print").PrintableColorPlan {
  const clusterById = new Map<number, ColorCluster>();
  for (const c of plan.clusters) clusterById.set(c.id, c);

  const priorityIds = plan.priorityOrder?.length
    ? plan.priorityOrder
    : plan.clusters.map((c) => c.id);

  const visible: ColorCluster[] = [];
  for (const id of priorityIds) {
    const c = clusterById.get(id);
    if (!c) continue;
    visible.push(c);
    if (visible.length >= Number(kit)) break;
  }

  const rawRows = visible.map((c, i) => {
    const matchesByKit = (c as any).matchesByKit as
      | Record<
          string | number,
          { fcId?: number; fcNo?: number; name?: string; label?: string; pencilName?: string; hex?: string; deltaE00?: number }
        >
      | undefined;

    const m = (matchesByKit?.[kit] ?? matchesByKit?.[String(kit)] ?? c.matched) as any;

    const hex = m?.hex || (c as any).sampleHex || "#FFFFFF";
    const fcNo = m?.fcId != null ? String(m.fcId) : m?.fcNo != null ? String(m.fcNo) : "";
    const name =
      (typeof m?.name === "string" && m.name) ||
      (typeof m?.label === "string" && m.label) ||
      (typeof m?.pencilName === "string" && m.pencilName) ||
      (typeof (c as any)?.name === "string" && (c as any).name) ||
      "";
    const coveragePct = (c.coverage ?? 0) * 100;
    const deltaE = typeof m?.deltaE00 === "number" ? m.deltaE00 : undefined;

    return { idx: i + 1, hex, fcNo, name, coveragePct, deltaE };
  });

  const rows = dedupeRows(rawRows);

  // footer notes
  const paletteNote = `Palette: ${plan.paletteMeta.set} · ${plan.paletteMeta.count} swatches · v${plan.paletteMeta.version}`;
  let qaAvg = 0, qaWorst = 0, wsum = 0;
  for (const r of rows) {
    const w = (r.coveragePct ?? 0) / 100;
    const d = r.deltaE ?? 0;
    qaAvg += w * d;
    wsum += w;
    qaWorst = Math.max(qaWorst, d);
  }
  const avg = wsum > 0 ? qaAvg / wsum : 0;
  const metricsNote = `QA · Kit ${Number(kit)} — Avg ΔE (area-weighted): ${avg.toFixed(1)} · Worst: ${qaWorst.toFixed(1)}`;

  return { kitLabel: `${Number(kit)} pencils`, rows, paletteNote, metricsNote };
}

function dedupeRows(
  rows: Array<{
    idx: number;
    hex?: string;
    fcNo?: string;
    name?: string;
    coveragePct?: number;
    deltaE?: number;
  }>
) {
  const out: typeof rows = [];
  const where = new Map<string, number>();

  for (const r of rows) {
    const key =
      r.fcNo && r.fcNo.trim()
        ? `fc:${r.fcNo.trim()}`
        : `hex:${(r.hex || "").toLowerCase()}|name:${(r.name || "").toLowerCase()}`;

    const j = where.get(key);
    if (j == null) {
      where.set(key, out.length);
      out.push({ ...r });
    } else {
      const t = out[j];
      const cov1 = t.coveragePct ?? 0;
      const cov2 = r.coveragePct ?? 0;
      const w1 = cov1 / 100;
      const w2 = cov2 / 100;
      const d1 = t.deltaE ?? 0;
      const d2 = r.deltaE ?? 0;

      t.coveragePct = cov1 + cov2;
      const wSum = w1 + w2;
      t.deltaE = wSum > 0 ? (w1 * d1 + w2 * d2) / wSum : t.deltaE;
    }
  }
  out.forEach((r, i) => (r.idx = i + 1));
  return out;
}
