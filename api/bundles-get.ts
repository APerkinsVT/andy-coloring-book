import { list } from "@vercel/blob";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const id = (req.query.id as string) || "";
    if (!id || !/^pla-[a-z0-9]{5,}$/i.test(id)) {
      return res.status(400).json({ error: "Provide valid id like pla-abc123" });
    }

    const prefix = `bundles/${id}/`;
    const { blobs } = await list({ prefix });

    const manifestBlob = blobs.find(b => b.pathname === `${prefix}manifest.json` || b.pathname.endsWith("/manifest.json"));
    const qrBlob = blobs.find(b => b.pathname === `${prefix}qr.png` || b.pathname.endsWith("/qr.png"));

    if (!manifestBlob) {
      return res.status(404).json({ error: { code: "404", message: "Bundle not found" } });
    }

    const r = await fetch(manifestBlob.url);
    if (!r.ok) {
      return res.status(404).json({ error: { code: "404", message: "Manifest not found" } });
    }
    const manifest = await r.json();

    return res.status(200).json({
      id,
      manifest,
      manifestUrl: manifestBlob.url,
      qrPngUrl: qrBlob?.url ?? null,
    });
  } catch (err: any) {
    console.error("[bundles-get] crash:", err);
    return res.status(500).json({ error: "bundles-get crashed", detail: err?.message || String(err) });
  }
}
