import { useEffect, useRef, useState } from 'react';
import { Camera, ImageOff, Loader2, RefreshCcw } from 'lucide-react';

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

interface PhotoCaptureProps {
  file: File | null;
  onChange: (file: File | null, crops: RoiCropResult | null) => void;
  disabled?: boolean;
}

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

export default function PhotoCapture({ file, onChange, disabled }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    if (!nextFile) {
      onChange(null, null);
      return;
    }

    setProcessing(true);
    try {
      const crops = await getRoiCrops(nextFile);
      onChange(nextFile, crops);
    } catch (error) {
      console.warn('Photo capture crop failure', error);
      onChange(nextFile, null);
    } finally {
      setProcessing(false);
    }
  }

  function handleClear() {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onChange(null, null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
        >
          {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          {processing ? 'Processing…' : 'Capture Photo'}
        </button>
        {file && (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-100"
          >
            <RefreshCcw className="h-5 w-5" />
            Replace
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />

      <div className="relative overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50">
        {preview ? (
          <>
            <img src={preview} alt="Captured count" className="h-64 w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between text-white/80">
              <div className="bg-gradient-to-b from-black/40 to-transparent p-2 text-center text-xs uppercase tracking-wider">
                Product Text / Description
              </div>
              <div className="self-center rounded-full bg-black/50 px-3 py-1 text-xs uppercase tracking-wider">Barcode Area</div>
              <div className="bg-gradient-to-t from-black/40 to-transparent p-2 text-center text-xs uppercase tracking-wider">
                Lot / Inkjet Strip
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-500">
            <ImageOff className="h-10 w-10" />
            <p className="text-sm">Snap a clear photo that shows the label, barcode, and lot strip.</p>
          </div>
        )}
      </div>
    </div>
  );
}
