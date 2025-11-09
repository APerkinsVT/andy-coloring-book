import React, { useEffect, useMemo, useState } from "react";

import PaletteGrid from "@/components/PaletteGrid";
import TipsPanel from "@/components/TipsPanel";

type PaletteEntry = { hex: string; name: string; brand?: string; number?: string };

type ManifestShape = {
  id?: string;
  createdAt?: string;
  originalUrl?: string;
  sourceUrl?: string;
  lineArtUrl?: string;
  palette?: PaletteEntry[] | null;
  tips?: string[] | null; // API returns string[]
  qrPngUrl?: string;
  portalUrl?: string;
  manifestUrl?: string;
  model?: { name?: string; version?: string };
};

type BundlesGetResponse =
  | { id: string; manifest: ManifestShape; qrPngUrl?: string; manifestUrl?: string }
  | (ManifestShape & { id?: string; qrPngUrl?: string; manifestUrl?: string });

function coerceManifest(data: BundlesGetResponse, bundleId: string): Required<ManifestShape> {
  const base: ManifestShape =
    "manifest" in (data as any) && (data as any).manifest ? (data as any).manifest : (data as any);
  const original = base.originalUrl || base.sourceUrl || "";
  return {
    id: base.id || bundleId,
    createdAt: base.createdAt || "",
    originalUrl: original,
    sourceUrl: base.sourceUrl || "",
    lineArtUrl: base.lineArtUrl || "",
    palette: (base.palette as PaletteEntry[] | null) ?? null,
    tips: (base.tips as string[] | null) ?? null,
    qrPngUrl: (data as any).qrPngUrl || base.qrPngUrl || "",
    portalUrl: base.portalUrl || "",
    manifestUrl: (data as any).manifestUrl || base.manifestUrl || "",
    model: base.model || {},
  };
}

export default function Portal() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [m, setM] = useState<Required<ManifestShape> | null>(null);

  const bundleId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const parts = window.location.pathname.split("/");
    return parts[2] || "";
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!bundleId) throw new Error("No bundle id found in URL. Expected /p/:id.");

        const res = await fetch(`/api/bundles-get?id=${encodeURIComponent(bundleId)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`bundles-get failed: ${res.status} ${res.statusText} — ${text}`);
        }
        const json: BundlesGetResponse = await res.json();
        const mm = coerceManifest(json, bundleId);
        if (!cancelled) {
          setM(mm);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bundleId]);

  const Banner = () => (
    <div
      style={{
        background: "#e9d5ff",
        border: "1px solid #c4b5fd",
        color: "#3730a3",
        padding: "10px 14px",
        borderRadius: 8,
        fontWeight: 700,
        marginBottom: 12,
      }}
    >
      PORTAL VIEW — Shared bundle page (/p/:id)
    </div>
  );

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <Banner />
        <h2 style={{ marginTop: 0 }}>Loading bundle…</h2>
        <div style={{ opacity: 0.7 }}>Fetching images and details.</div>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 16 }}>
        <Banner />
        <h2 style={{ marginTop: 0 }}>Couldn’t load bundle</h2>
        <pre style={{ whiteSpace: "pre-wrap", background: "#fafafa", border: "1px solid #eee", padding: 12 }}>
        {err.includes('"code": "404"')
          ? "We couldn’t find that bundle. It may have expired or the ID is wrong."
          : err}
        </pre>
      </div>
    );
  }

  if (!m) {
    return (
      <div style={{ padding: 16 }}>
        <Banner />
        <h2 style={{ marginTop: 0 }}>Nothing to show</h2>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <Banner />

      <header>
        <h2 style={{ margin: 0 }}>Bundle: {m.id}</h2>
        {m.qrPngUrl && (
          <div style={{ marginTop: 8 }}>
            <img src={m.qrPngUrl} alt="QR to open this portal" style={{ width: 96, height: 96 }} />
          </div>
        )}
        {m.manifestUrl && (
          <div style={{ marginTop: 4, fontSize: 13 }}>
            <a href={m.manifestUrl} target="_blank" rel="noreferrer">
              View manifest
            </a>
          </div>
        )}
      </header>

      <section
        aria-label="Images"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <figure style={{ margin: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Original</div>
          {m.originalUrl ? (
            <img
              src={m.originalUrl}
              alt="Original"
              style={{ width: "100%", height: "auto", border: "1px solid #ddd", borderRadius: 8 }}
              loading="lazy"
            />
          ) : (
            <div style={{ fontStyle: "italic", opacity: 0.7 }}>Missing original image URL</div>
          )}
        </figure>

        <figure style={{ margin: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Line Art</div>
          {m.lineArtUrl ? (
            <img
              src={m.lineArtUrl}
              alt="Line art"
              style={{ width: "100%", height: "auto", border: "1px solid #ddd", borderRadius: 8, background: "#fff" }}
              loading="lazy"
            />
          ) : (
            <div style={{ fontStyle: "italic", opacity: 0.7 }}>Missing line art URL</div>
          )}
        </figure>
      </section>

      <section aria-label="Palette & Tips" style={{ display: "grid", gap: 16 }}>
        <PaletteGrid palette={m.palette ?? undefined} />
        <TipsPanel
          palette={m.palette ?? []}   //  <-- add this
          tips={
            Array.isArray(m.tips)
              ? (m.tips as any[]).map((t: any) => (typeof t === "string" ? { text: t } : t))
              : undefined
          }
        />
      </section>
    </div>
  );
}
