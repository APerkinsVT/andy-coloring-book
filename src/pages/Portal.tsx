// src/pages/Portal.tsx
// Renders the QR Portal page for /p/pla-xxxxxx
// No external router required — we'll mount this from App.tsx based on pathname.

import { useEffect, useMemo, useState } from "react";

type Manifest = {
  id: string;
  createdAt?: string;
  portalUrl?: string;
  sourceUrl: string;
  lineArtUrl: string;
  palette?: any;
  tips?: any;
  model?: { name?: string; version?: string };
};

type GetResponse =
  | { error: string; detail?: string }
  | { id: string; manifestUrl: string; qrPngUrl: string | null; manifest: Manifest };

function getIdFromPathname(): string | null {
  // expects /p/pla-xxxxx (no trailing slash)
  const m = window.location.pathname.match(/^\/p\/(pla-[A-Za-z0-9_-]+)$/);
  return m ? m[1] : null;
}

export default function Portal() {
  const id = useMemo(getIdFromPathname, []);
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    data: (GetResponse & { ok?: boolean }) | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!id) {
        setState({ loading: false, error: "Missing or invalid portal id.", data: null });
        return;
      }
      try {
        const r = await fetch(`/api/bundles-get?id=${encodeURIComponent(id)}`);
        const json = (await r.json()) as GetResponse;
        if (cancelled) return;
        if (!r.ok || (json as any).error) {
          setState({
            loading: false,
            error: (json as any).error || `Failed to load bundle (${r.status})`,
            data: json,
          });
          return;
        }
        setState({ loading: false, error: null, data: { ...(json as any), ok: true } });
      } catch (e: any) {
        if (cancelled) return;
        setState({ loading: false, error: e?.message || "Network error.", data: null });
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // simple, brand-friendly styles without adding a CSS file
  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #eaeaea",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  };

  const label: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: "#555",
    marginBottom: 8,
  };

  if (state.loading) {
    return (
      <div style={{ maxWidth: 1100, margin: "32px auto", padding: "0 16px" }}>
        <h1 style={{ marginBottom: 8 }}>Photo Line Art — Portal</h1>
        <div>Loading…</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={{ maxWidth: 1100, margin: "32px auto", padding: "0 16px" }}>
        <h1 style={{ marginBottom: 8 }}>Photo Line Art — Portal</h1>
        <div style={{ color: "#b00020", marginTop: 12 }}>{state.error}</div>
      </div>
    );
  }

  const resp = state.data as any;
  const manifest = resp?.manifest as Manifest;
  const created = manifest?.createdAt ? new Date(manifest.createdAt) : null;

  return (
    <div style={{ maxWidth: 1100, margin: "24px auto 48px", padding: "0 16px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Photo Line Art</div>
        <div style={{ color: "#666", marginTop: 4 }}>
          Portal view for <code>{manifest?.id}</code>
        </div>
      </div>

      {/* Top row: Original | Line Art */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
          marginBottom: 16,
        }}
      >
        <div style={card}>
          <div style={label}>Original</div>
          {manifest?.sourceUrl ? (
            <img
              src={manifest.sourceUrl}
              alt="Original"
              style={{ width: "100%", height: "auto", borderRadius: 8 }}
            />
          ) : (
            <div style={{ color: "#999" }}>No source image.</div>
          )}
        </div>

        <div style={card}>
          <div style={label}>Line Art</div>
          {manifest?.lineArtUrl ? (
            <img
              src={manifest.lineArtUrl}
              alt="Line Art"
              style={{ width: "100%", height: "auto", borderRadius: 8, background: "#f8f8f8" }}
            />
          ) : (
            <div style={{ color: "#999" }}>No line art image.</div>
          )}
        </div>
      </div>

      {/* Color Plan + Tips */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={card}>
          <div style={label}>Color Plan</div>
          {manifest?.palette ? (
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                color: "#333",
                background: "#fafafa",
                border: "1px solid #eee",
                borderRadius: 8,
                padding: 12,
              }}
            >
              {JSON.stringify(manifest.palette, null, 2)}
            </pre>
          ) : (
            <div style={{ color: "#999" }}>No palette saved for this bundle.</div>
          )}
        </div>

        <div style={card}>
          <div style={label}>Tips & Suggestions</div>
          {manifest?.tips ? (
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                color: "#333",
                background: "#fafafa",
                border: "1px solid #eee",
                borderRadius: 8,
                padding: 12,
              }}
            >
              {JSON.stringify(manifest.tips, null, 2)}
            </pre>
          ) : (
            <div style={{ color: "#999" }}>No tips saved for this bundle.</div>
          )}
        </div>
      </div>

      {/* Footer meta */}
      <div style={{ marginTop: 16, color: "#666", fontSize: 13 }}>
        {created && (
          <span>
            Created: {created.toLocaleString()} &nbsp; • &nbsp;
          </span>
        )}
        Model: {manifest?.model?.name || "unknown"}{" "}
        {manifest?.model?.version ? `(${manifest.model.version.slice(0, 8)}…)` : ""}
        <span style={{ float: "right" }}>
          <a href="/" style={{ textDecoration: "none", color: "#7A77FF" }}>
            Make your own →
          </a>
        </span>
      </div>
    </div>
  );
}
