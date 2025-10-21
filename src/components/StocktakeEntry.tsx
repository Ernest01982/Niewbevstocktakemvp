import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import PhotoCapture from './PhotoCapture';
import type { RoiCropResult } from './photoCaptureTypes';
import { useEventWarehouse } from '../hooks/useEventWarehouse';
import { useSubmitCount, type SubmitCountPayload } from '../hooks/useSubmitCount';

interface StocktakeEntryProps {
  initialStockCode?: string;
  initialLotNumber?: string;
  recountTaskId?: string;
  onSubmitSuccess?: () => Promise<void> | void;
  compact?: boolean;
  hideHeading?: boolean;
}

export default function StocktakeEntry({
  initialStockCode,
  initialLotNumber,
  recountTaskId,
  onSubmitSuccess,
  compact = false,
  hideHeading = false
}: StocktakeEntryProps) {
  const { eventId, warehouseCode, selectedEvent, selectedWarehouse, loading: contextLoading } = useEventWarehouse();
  const [counts, setCounts] = useState({
    pallets: '',
    layers: '',
    cases: '',
    units: ''
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCrops, setPhotoCrops] = useState<RoiCropResult | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setCounts({ pallets: '', layers: '', cases: '', units: '' });
  }, [initialStockCode, initialLotNumber]);

  const submitCount = useSubmitCount();

  function parseNumberInput(value: string): number | null {
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed);
  }

  const palletCount = parseNumberInput(counts.pallets);
  const layerCount = parseNumberInput(counts.layers);
  const caseCount = parseNumberInput(counts.cases);
  const unitCount = parseNumberInput(counts.units);

  const hasQuantity = (palletCount ?? 0) > 0 || (layerCount ?? 0) > 0 || (caseCount ?? 0) > 0 || (unitCount ?? 0) > 0;

  function handlePhotoChange(file: File | null, crops: RoiCropResult | null) {
    setPhotoFile(file);
    setPhotoCrops(crops ?? null);
  }

  function resetQuantities() {
    setCounts({ pallets: '', layers: '', cases: '', units: '' });
  }

  function handleResetAfterSubmit() {
    resetQuantities();
    handlePhotoChange(null, null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!eventId || !warehouseCode) {
      setErrorMessage('Select an active event and warehouse before capturing a count.');
      return;
    }

    if (!hasQuantity) {
      setErrorMessage('Enter at least one quantity before submitting.');
      return;
    }

    try {
      const payload: SubmitCountPayload = {
        eventId,
        warehouseCode,
        photo: photoFile,
        roiCrops: photoCrops,
        recountTaskId
      };
      if (initialStockCode) {
        payload.stockCode = initialStockCode;
      }
      if (initialLotNumber) {
        payload.lotNumber = initialLotNumber;
      }

      payload.bulkPallets = palletCount;
      payload.bulkLayers = layerCount;
      payload.bulkCases = caseCount;
      payload.singlesUnits = unitCount;

      await submitCount.mutateAsync(payload);

      setSuccessMessage('Captured ✓ — processing in background');
      handleResetAfterSubmit();
      await onSubmitSuccess?.();
    } catch (error) {
      console.error('Count submission failed', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to submit count');
    }
  }

  const wrapperClass = compact ? 'space-y-6' : 'max-w-3xl mx-auto space-y-6';
  const cardClass = compact ? 'space-y-6' : 'bg-white rounded-xl shadow-lg p-6 space-y-6';

  return (
    <div className={wrapperClass}>
      <div className={cardClass}>
        {!hideHeading && !compact && (
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-gray-900">Capture Count</h2>
            <p className="text-gray-600 text-sm">
              Snap a photo, note the pallet, layer, case and unit counts, and move on. AI extraction handles the rest in the
              background.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white/60 p-4 space-y-3">
          <div className="flex flex-col gap-2 text-sm text-gray-600">
            <div className="flex items-center gap-2 text-gray-800 font-medium">
              <Info className="h-4 w-4 text-blue-500" />
              Session Context
            </div>
            <div className="flex flex-wrap gap-3 text-xs sm:text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                Event: {selectedEvent?.name ?? (contextLoading ? 'Loading…' : 'Select an event')}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                Warehouse: {selectedWarehouse?.name ?? (contextLoading ? 'Loading…' : 'Select a warehouse')}
              </span>
            </div>
          </div>
        </div>

        {successMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-5 w-5" />
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <PhotoCapture file={photoFile} onChange={handlePhotoChange} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Pallets"
              value={counts.pallets}
              onChange={(value) => setCounts((prev) => ({ ...prev, pallets: value }))}
            />
            <NumberField
              label="Layers"
              value={counts.layers}
              onChange={(value) => setCounts((prev) => ({ ...prev, layers: value }))}
            />
            <NumberField
              label="Cases"
              value={counts.cases}
              onChange={(value) => setCounts((prev) => ({ ...prev, cases: value }))}
            />
            <NumberField
              label="Units"
              value={counts.units}
              onChange={(value) => setCounts((prev) => ({ ...prev, units: value }))}
            />
          </div>

          <button
            type="submit"
            disabled={submitCount.isPending || !hasQuantity || !eventId || !warehouseCode || !photoFile}
            className="sticky bottom-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-lg font-semibold text-white shadow-lg transition enabled:hover:bg-blue-700 disabled:opacity-60"
          >
            {submitCount.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Capturing…
              </span>
            ) : (
              'Submit count'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
      {label}
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
    </label>
  );
}
