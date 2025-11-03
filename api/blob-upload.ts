// api/blob-upload.ts
// Edge-compatible handler that issues client upload tokens for Vercel Blob.
// Docs pattern: "Client Uploads with Vercel Blob" (Other frameworks). 

export const config = { runtime: 'nodejs18.x' }; // or 'nodejs20.x'

import type { VercelRequest, VercelResponse } from '@vercel/node';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (_pathname /*, clientPayload */) => {
        // You could authz here if you want. For MVP allow images:
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          addRandomSuffix: true,
          // tokenPayload: JSON.stringify({ uid: 'anon' }), // optional
        };
      },
      onUploadCompleted: async ({ blob /*, tokenPayload */ }) => {
        // Optional: keep simple for MVP. You could log or update a DB.
        console.log('Blob upload completed:', blob.url);
      },
    });

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'upload init failed' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
}
