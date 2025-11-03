// api/blob-upload.ts
// Node runtime token endpoint for Vercel Blob client uploads.
// No onUploadCompleted => no callbackUrl needed (works in dev & prod).

export const config = { runtime: 'nodejs' };

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = (req.body || {}) as HandleUploadBody;

    // Create a fetch-style Request for handleUpload
    const request = new Request('https://blob-upload.local', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    });

    const json = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
        addRandomSuffix: true,
      }),
      // no onUploadCompleted in dev/prod (keeps local happy)
    });

    return res.status(200).json(json);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'upload init failed' });
  }
}
