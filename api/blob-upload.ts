// api/blob-upload.ts
// Edge-compatible token endpoint for Vercel Blob client uploads.


export const config = { runtime: 'edge' };

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (_pathname /*, clientPayload */) => {
        // MVP: allow common image types
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob /*, tokenPayload */ }) => {
        // Optional: log or notify
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
