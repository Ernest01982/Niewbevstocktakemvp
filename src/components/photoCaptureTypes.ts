export type Roi = { xPct: number; yPct: number; wPct: number; hPct: number };

export const ROI_BARCODE: Roi = { xPct: 0.1, yPct: 0.55, wPct: 0.8, hPct: 0.25 };
export const ROI_TEXT_TOP: Roi = { xPct: 0.08, yPct: 0.1, wPct: 0.84, hPct: 0.28 };
export const ROI_LOT: Roi = { xPct: 0.08, yPct: 0.85, wPct: 0.84, hPct: 0.12 };

export interface RoiCropResult {
  barcode?: Blob;
  textTop?: Blob;
  lot?: Blob;
  hints: {
    roi: {
      barcode: Roi;
      textTop: Roi;
      lot: Roi;
    };
    expected: {
      barcodeSymbologies: string[];
      keywords: string[];
    };
  };
}

