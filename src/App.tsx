// src/App.tsx
import React, { useRef, useState, useEffect } from "react";
import { generateAiLineArt } from "./services/aiLineart";
import { debugDumpFC } from "./services/color";
import { buildPdf } from "./utils/pdf";

type AppState = {
  originalDataUrl?: string;
  lineArtUrl?: string;
  busy: boolean;
  error?: string;
};

export default function App() {
  const [state, setState] = useState<AppState>({ busy: false });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // sanity log for your FC palette util (safe to remove later)
    debugDumpFC(8);
  }, []);

  const onPick = () => fileInputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () =>
      setState((s) => ({
        ...s,
        originalDataUrl: reader.result as string,
        lineArtUrl: undefined,
        error: undefined,
      }));
    reader.onerror = () => setState((s) => ({ ...s, error: "Failed to read file" }));
    reader.readAsDataURL(f);
  };

  const onReset = () => {
    setState({ busy: false });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onGenerate = async () => {
    if (!state.originalDataUrl) {
      setState((s) => ({ ...s, error: "Choose a photo first." }));
      return;
    }
    setState((s) => ({ ...s, busy: true, error: undefined }));
    try {
      const { imageUrl /*, raw*/ } = await generateAiLineArt(state.originalDataUrl);
      setState((s) => ({ ...s, lineArtUrl: imageUrl, busy: false }));
    } catch (e: any) {
      setState((s) => ({ ...s, busy: false, error: String(e?.message ?? e) }));
    }
  };

  // NEW: PDF builder hook-up
  const onDownloadPdf = () => {
    if (!state.originalDataUrl || !state.lineArtUrl) return;
    const doc = buildPdf({
      title: "Coloring Page",
      originalDataUrl: state.originalDataUrl,
      lineArtUrl: state.lineArtUrl,
      guide: [
        "Lay down light layers first; build depth gradually.",
        "Leave highlights white for glossy surfaces.",
        "Use cool greys in shadows; avoid pure black until the end.",
      ],
      palette: [
        { number: "199", name: "Black", hex: "#000000" },
        { number: "132", name: "Light Flesh", hex: "#F4C9B1" },
        { number: "151", name: "Helio Turquoise", hex: "#5FB1C5" },
      ],
    });
    doc.save("coloring-page.pdf");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="px-6 py-5 border-b border-slate-800">
        <h1 className="text-3xl font-semibold">Andy’s Coloring Book Maker</h1>
        <p className="text-slate-400 mt-1">
          Upload a photo → generate clean line art for printable coloring pages.
        </p>
      </header>

      <main className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Controls */}
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600"
            onClick={onPick}
            disabled={state.busy}
          >
            Choose Photo
          </button>

          <button
            className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600"
            onClick={onReset}
            disabled={state.busy}
          >
            Reset
          </button>

          {/* NEW: Download PDF button */}
          <button
            className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
            onClick={onDownloadPdf}
            disabled={!state.originalDataUrl || !state.lineArtUrl || state.busy}
            title={!state.lineArtUrl ? "Generate line art first" : "Download PDF"}
          >
            Download PDF
          </button>

          <button
            className="ml-auto px-5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
            onClick={onGenerate}
            disabled={!state.originalDataUrl || state.busy}
          >
            {state.busy ? "Generating…" : "Generate Line Art"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
          />
        </div>

        {/* Preview panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-slate-800 rounded-xl p-4">
            <h2 className="text-xl font-semibold mb-3">Original</h2>
            <div className="aspect-video bg-slate-900/50 rounded-lg flex items-center justify-center">
              {state.originalDataUrl ? (
                <img
                  src={state.originalDataUrl}
                  alt="original"
                  className="w-full h-full object-contain rounded-md"
                />
              ) : (
                <span className="text-slate-500">Pick an image to begin</span>
              )}
            </div>
          </section>

          <section className="bg-slate-800 rounded-xl p-4">
            <h2 className="text-xl font-semibold mb-3">Line Art (AI)</h2>
            <div className="aspect-video bg-slate-900/50 rounded-lg flex items-center justify-center">
              {state.lineArtUrl ? (
                <img
                  src={state.lineArtUrl}
                  alt="line art"
                  className="w-full h-full object-contain rounded-md"
                />
              ) : (
                <span className="text-slate-500">
                  {state.busy ? "Generating…" : "No line art yet"}
                </span>
              )}
            </div>
          </section>
        </div>

        {state.error && (
          <div className="rounded-md bg-rose-900/40 border border-rose-700 text-rose-200 p-3">
            Error: {state.error}
          </div>
        )}

        <p className="text-sm text-slate-500">
          Line art is generated by a hosted AI model for high-quality, print-ready output.
        </p>
      </main>
    </div>
  );
}
