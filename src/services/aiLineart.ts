// src/services/aiLineart.ts
export async function generateAiLineArt(imageDataUrl: string, prompt?: string): Promise<{
  imageUrl: string;
  raw?: any;
}> {
  const r = await fetch("/api/ai-lineart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl, prompt }),
  });

  const json = await r.json();
  if (!r.ok) {
    // Surface server-side diagnostics
    console.error("AI line art server error:", json);
    throw new Error(`AI line art failed: ${r.status} ${JSON.stringify(json)}`);
  }
  if (!json?.imageUrl) {
    console.warn("No parsed imageUrl from server. Raw payload:", json);
    throw new Error("AI line art succeeded but no imageUrl parsed. See console for raw.");
  }
  return { imageUrl: json.imageUrl as string, raw: json.raw };
}
