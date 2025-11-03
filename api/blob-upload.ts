// api/blob-upload.ts
// Node runtime token endpoint for Vercel Blob client uploads.
// We adapt to a Fetch Request for handleUpload.

export const config = { runtime: 'nodejs' };

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = (req.body || {}) as HandleUploadBody;

    // Build a Fetch-style Request so handleUpload works on Node
    const request = new Request('https://blob-upload.local', {
      method: 'POST',
      headers: new Headers(req.headers as any),
      body: JSON.stringify(body),
    });

    const json = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (_pathname) => {
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // You can keep or remove this log; Node can log just fine.
        console.log('Blob upload completed:', blob.url);
      },
    });

    return res.status(200).json(json);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'upload init failed' });
  }
}
