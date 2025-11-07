// api/bundles-get.ts
// GET /api/bundles-get?id=pla-xxxxxxxxxx
// -> { id, manifest, manifestUrl, qrPngUrl }
//
// Uses @vercel/blob list() to find the bundle's files without hardcoding the blob host.

import { list } from "@vercel/blob";

function q(req: any, key: string): string | undefined {
  return (req.query?.[key] ?? req.query?.[key.toLowerCase()]) as string | undefined;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const id = q(req, "id");
    if (!id || !/^pla-[a-z0-9]+$/i.test(id)) {
      return res.status(400).json({ error: "Provide valid ?id=pla-xxxxxxxxxx" });
    }

    const prefix = `bundles/${id}/`;
    // List all blobs under this bundle prefix
    const { blobs } = await list({ prefix, limit: 25 });
    if (!blobs || blobs.length === 0) {
      return res.status(404).json({ error: "Bundle not found", id });
    }

    // Find manifest and qr entries
    const manifestBlob = blobs.find(b => b.pathname.endsWith("/manifest.json"));
    const qrBlob = blobs.find(b => b.pathname.endsWith("/qr.png"));

    if (!manifestBlob?.url) {
      return res.status(404).json({ error: "manifest.json not found for bundle", id });
    }

    // Fetch manifest content (public)
    const r = await fetch(manifestBlob.url);
    if (!r.ok) {
      return res.status(502).json({ error: "Failed to fetch manifest content", status: r.status });
    }
    const manifest = await r.json();

    return res.status(200).json({
      id,
      manifest,
      manifestUrl: manifestBlob.url,
      qrPngUrl: qrBlob?.url || null,
    });
  } catch (err: any) {
    console.error("[bundles-get] crash:", err);
    return res.status(500).json({ error: "bundles-get crashed", detail: err?.message || String(err) });
  }
}
