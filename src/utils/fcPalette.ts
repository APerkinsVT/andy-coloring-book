// src/utils/fcPalette.ts
// Load the canonical Faber-Castell Polychromos palette JSON

export type FCPencil = {
  id: number
  name: string
  hex: string
  rgb: [number, number, number]
  sets: number[]
}

export async function loadFaberCastellPalette(): Promise<FCPencil[]> {
  const res = await fetch('/palettes/faber-castell-polychromos.json', { cache: 'force-cache' })
  if (!res.ok) throw new Error(`Palette fetch failed: ${res.status}`)
  const data = (await res.json()) as FCPencil[]
  // cheap sanity
  if (!Array.isArray(data) || !data.length) throw new Error('Palette JSON empty')
  return data
}
