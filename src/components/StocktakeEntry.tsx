import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, ImageOff, Loader2, RotateCcw, Upload } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type CountMode = 'singles' | 'pick_face' | 'bulk';
type UnitOption = 'units' | 'cases' | 'layers' | 'pallets';

interface StocktakeEntryProps {
  initialStockCode?: string;
  initialLotNumber?: string;
  recountTaskId?: string;
  onSubmitSuccess?: () => Promise<void> | void;
  compact?: boolean;
  hideHeading?: boolean;
}

const COUNT_MODE_OPTIONS: Record<CountMode, { label: string; units: UnitOption[] }> = {
  singles: {
    label: 'Singles',
    units: ['units', 'cases']
  },
  pick_face: {
    label: 'Pick Face',
    units: ['layers', 'cases']
  },
  bulk: {
    label: 'Bulk',
    units: ['pallets', 'layers', 'cases']
  }
};

export default function StocktakeEntry({
  initialStockCode,
  initialLotNumber,
  recountTaskId,
  onSubmitSuccess,
  compact = false,
  hideHeading = false
}: StocktakeEntryProps) {
  const { user } = useAuth();
  const [countMode, setCountMode] = useState<CountMode>('singles');
  const [unit, setUnit] = useState<UnitOption>('units');
  const [quantity, setQuantity] = useState('');
  const [stockCode, setStockCode] = useState(initialStockCode ?? '');
  const [lotNumber, setLotNumber] = useState(initialLotNumber ?? '');
  const [notes, setNotes] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStockCode(initialStockCode ?? '');
  }, [initialStockCode]);

  useEffect(() => {
    setLotNumber(initialLotNumber ?? '');
  }, [initialLotNumber]);

  useEffect(() => {
    const availableUnits = COUNT_MODE_OPTIONS[countMode].units;
    if (!availableUnits.includes(unit)) {
      setUnit(availableUnits[0]);
    }
  }, [countMode, unit]);

  const availableUnits = useMemo(() => COUNT_MODE_OPTIONS[countMode].units, [countMode]);

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setPhotoPreview(result);
    };
    reader.readAsDataURL(file);
    setErrorMessage('');
    setSuccessMessage('');
  }

  function resetPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  }

  function resetForm() {
    setCountMode('singles');
    setUnit('units');
    setQuantity('');
    setNotes('');
    resetPhoto();
    setErrorMessage('');
    if (!initialStockCode) {
      setStockCode('');
    }
    if (!initialLotNumber) {
      setLotNumber('');
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    if (!photoFile) {
      setErrorMessage('A photo is required before submitting.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Unable to authenticate request. Please sign in again.');
      }

      const formData = new FormData();
      formData.append('count_mode', countMode);
      formData.append('unit', unit);
      formData.append('quantity', quantity);
      formData.append('stock_code', stockCode);
      formData.append('lot_number', lotNumber);
      formData.append('notes', notes);
      formData.append('submitted_by', user.id);
      if (recountTaskId) {
        formData.append('recount_task_id', recountTaskId);
      }
      formData.append('photo', photoFile);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-count`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`
          },
          body: formData
        }
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to submit count.');
      }

      setSuccessMessage('Captured ✓ — processing in background');
      resetForm();
      if (onSubmitSuccess) {
        await onSubmitSuccess();
      }
    } catch (error) {
      console.error('Error submitting count:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit count.');
    } finally {
      setSubmitting(false);
    }
  }

  const wrapperClass = compact ? '' : 'max-w-3xl mx-auto';
  const cardClass = compact ? 'space-y-6' : 'bg-white rounded-xl shadow-lg p-6 space-y-6';

  return (
    <div className={wrapperClass}>
      <div className={cardClass}>
        {!hideHeading && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Capture Count</h2>
              <p className="text-gray-600 text-sm">Upload a count with supporting photo evidence.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              {(Object.keys(COUNT_MODE_OPTIONS) as CountMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCountMode(mode)}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    countMode === mode
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200'
                  }`}
                >
                  {COUNT_MODE_OPTIONS[mode].label}
                </button>
              ))}
            </div>
          </div>
        )}

        {hideHeading && (
          <div className="flex flex-wrap gap-3">
            {(Object.keys(COUNT_MODE_OPTIONS) as CountMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCountMode(mode)}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  countMode === mode
                    ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200'
                }`}
              >
                {COUNT_MODE_OPTIONS[mode].label}
              </button>
            ))}
          </div>
        )}

        {successMessage && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Stock Code
              <input
                type="text"
                value={stockCode}
                onChange={(event) => setStockCode(event.target.value.toUpperCase())}
                required
                placeholder="e.g. SKU-12345"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Lot Number
              <input
                type="text"
                value={lotNumber}
                onChange={(event) => setLotNumber(event.target.value)}
                required
                placeholder="Batch or lot reference"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Quantity
              <input
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
                placeholder="Enter amount counted"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Unit
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value as UnitOption)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {availableUnits.map((option) => (
                  <option key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 md:col-span-1 md:col-start-auto">
              Notes
              <input
                type="text"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional comments"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-sm transition hover:bg-blue-700"
              >
                <Camera className="h-5 w-5" />
                Take Photo
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-600 px-4 py-2 text-white shadow-sm transition hover:bg-gray-700"
              >
                <Upload className="h-5 w-5" />
                Upload Photo
              </button>
              {photoPreview && (
                <button
                  type="button"
                  onClick={resetPhoto}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-100"
                >
                  <RotateCcw className="h-5 w-5" />
                  Retake
                </button>
              )}
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50">
              {photoPreview ? (
                <img src={photoPreview} alt="Count evidence" className="h-64 w-full object-contain bg-white" />
              ) : (
                <div className="flex h-64 flex-col items-center justify-center gap-2 text-gray-500">
                  <ImageOff className="h-10 w-10" />
                  <p className="text-sm">No photo selected yet</p>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !stockCode || !lotNumber || !quantity || !photoFile}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-white font-semibold shadow-sm transition enabled:hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Capturing...
              </>
            ) : (
              'Submit Count'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
