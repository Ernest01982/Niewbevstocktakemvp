import { ROI_BARCODE, ROI_LOT, ROI_TEXT_TOP, type Roi, type RoiCropResult } from './photoCaptureTypes';

export async function getRoiCrops(file: File): Promise<RoiCropResult | null> {
  if (typeof window === 'undefined') return null;

  const hints: RoiCropResult['hints'] = {
    roi: {
      barcode: ROI_BARCODE,
      textTop: ROI_TEXT_TOP,
      lot: ROI_LOT
    },
    expected: {
      barcodeSymbologies: ['ITF-14', 'EAN-13'],
      keywords: ['RAINDANCE', 'NAMAQUA', 'FILLING DATE']
    }
  };

  async function cropImage(image: HTMLImageElement, roi: Roi): Promise<Blob | undefined> {
    try {
      const canvas = document.createElement('canvas');
      const sx = Math.floor(image.width * roi.xPct);
      const sy = Math.floor(image.height * roi.yPct);
      const sw = Math.floor(image.width * roi.wPct);
      const sh = Math.floor(image.height * roi.hPct);
      canvas.width = Math.max(1, sw);
      canvas.height = Math.max(1, sh);
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.7);
      });
      return blob ?? undefined;
    } catch (error) {
      console.warn('ROI crop failed', error);
      return undefined;
    }
  }

  const image = await loadImage(file);
  const [barcode, textTop, lot] = await Promise.all([
    cropImage(image, ROI_BARCODE),
    cropImage(image, ROI_TEXT_TOP),
    cropImage(image, ROI_LOT)
  ]);

  if (!barcode && !textTop && !lot) {
    return { hints };
  }

  return {
    barcode,
    textTop,
    lot,
    hints
  };
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    image.src = url;
  });
}

