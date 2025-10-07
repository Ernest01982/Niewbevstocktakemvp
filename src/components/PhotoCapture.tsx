import { useEffect, useRef, useState } from 'react';
import { Camera, ImageOff, Loader2, RefreshCcw } from 'lucide-react';
import { getRoiCrops } from './photoCaptureUtils';
import { type RoiCropResult } from './photoCaptureTypes';

interface PhotoCaptureProps {
  file: File | null;
  onChange: (file: File | null, crops: RoiCropResult | null) => void;
  disabled?: boolean;
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
