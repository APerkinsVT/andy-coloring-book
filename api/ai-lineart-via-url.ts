// api/ai-lineart-via-url.ts
// Zero-logic pass-through to /api/ai-lineart.
// We *do not* parse the body here; we forward the raw stream so the core
// handler is the single source of truth for validation and parsing.

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ----- Compute same-origin base URL (works locally and on Vercel) -----
    const proto =
      (req.headers?.["x-forwarded-proto"] as string) ||
      ((req.connection && (req.connection as any).encrypted) ? "https" : "http") ||
      "http";
    const host =
      (req.headers?.["x-forwarded-host"] as string) ||
      (req.headers?.host as string) ||
      "localhost:3000";
    const origin = `${proto}://${host}`;

    // ----- Build a headers object to forward (minus hop-by-hop junk) -----
    const fwdHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers || {})) {
      if (Array.isArray(v)) fwdHeaders[k] = v.join(", ");
      else if (typeof v === "string") fwdHeaders[k] = v;
    }
    // Remove headers that can break node-fetch / undici when re-sending.
    delete fwdHeaders["content-length"];
    delete fwdHeaders["transfer-encoding"];
    delete fwdHeaders["connection"];

    // If no content-type was set by the client, keep it generic so the core
    // can choose how to read the stream.
    if (!fwdHeaders["content-type"]) {
      fwdHeaders["content-type"] = "application/octet-stream";
    }

    // ----- Forward the raw request stream to the core route -----
    // In Node runtime, req is an IncomingMessage (readable stream) — valid as a fetch body.
    // In Edge runtime, this file wouldn't be used (unless forced), but if it is,
    // req.body would be a web ReadableStream; we fall back to buffering below.
    let bodyToSend: any = req;

    // Some adapters don’t allow passing the IncomingMessage directly.
    // If fetch rejects, we’ll buffer the request and re-send as a Uint8Array.
    async function tryForward(asBuffer: boolean) {
      if (asBuffer) {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
        bodyToSend = Buffer.concat(chunks);
      }
      return fetch(`${origin}/api/ai-lineart`, {
        method: "POST",
        headers: fwdHeaders,
        body: bodyToSend as any,
      });
    }

    let r: Response;
    try {
      r = (await tryForward(false)) as any;
    } catch {
      r = (await tryForward(true)) as any;
    }

    // ----- Mirror the core response -----
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = await r.json().catch(() => null);
      if (json) return res.status(r.status).json(json);
    }
    const text = await r.text().catch(() => "");
    return res
      .status(r.status)
      .json({ error: "ai-lineart returned non-JSON", preview: text.slice(0, 1000) });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: "ai-lineart-via-url crashed", detail: err?.message || String(err) });
  }
}
