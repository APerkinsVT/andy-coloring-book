// api/ai-lineart-url.ts
// Accepts { imageUrl, prompt }, downloads the image from Blob,
// converts it to a data URL server-side, then calls your existing /api/ai-lineart.

export const config = { runtime: 'edge' };

export async function POST(request: Request): Promise<Response> {
  try {
    const { imageUrl, prompt } = await request.json() as { imageUrl?: string; prompt?: string };

    if (!imageUrl) {
      return json({ error: 'Missing imageUrl' }, 400);
    }

    const imgRes = await fetch(imageUrl, { cache: 'no-store' });
    if (!imgRes.ok) {
      return json({ error: `Failed to fetch image (${imgRes.status})` }, 400);
    }

    const ct = imgRes.headers.get('content-type') || 'image/jpeg';
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    const b64 = uint8ToBase64(buf);
    const dataUrl = `data:${ct};base64,${b64}`;

    // Call the original endpoint with a small JSON body (no more 413s).
    const origin = new URL(request.url).origin;
    const r = await fetch(`${origin}/api/ai-lineart`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: dataUrl, prompt }),
    });

    const ct2 = r.headers.get('content-type') || '';
    if (!ct2.includes('application/json')) {
      const txt = await r.text();
      return json({ error: 'ai-lineart returned non-JSON', status: r.status, preview: txt.slice(0, 200) }, 502);
    }

    const jsonOut = await r.json();
    return json(jsonOut, r.status);
  } catch (err: any) {
    return json({ error: err?.message || 'Unexpected error' }, 500);
  }
}

/* ─ helpers ─ */

function uint8ToBase64(u8: Uint8Array): string {
  // Edge runtime provides btoa; encode in manageable chunks
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk) as any);
  }
  // eslint-disable-next-line no-undef
  return btoa(binary);
}

function json(obj: any, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
