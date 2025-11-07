export type PaletteEntry = {
  hex: string;          // e.g., "#f5f2e8"
  name: string;         // e.g., "Sail & Cap Off-White"
  brand?: string;       // e.g., "Faber-Castell"
  number?: string;      // e.g., "103"
};

export type Manifest = {
  id: string;
  originalUrl: string;
  lineArtUrl: string;
  createdAt?: string;

  // Optional, planned fields
  palette?: PaletteEntry[];
  tips?: string[];

  // Not always present in the manifest; may be returned separately
  qrPngUrl?: string;
};
