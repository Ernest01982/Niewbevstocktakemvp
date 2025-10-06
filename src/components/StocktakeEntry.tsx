import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import PhotoCapture, { type RoiCropResult } from './PhotoCapture';
import { useEventWarehouse } from '../contexts/EventWarehouseContext';
import { useProductsLookup } from '../hooks/useProductsLookup';
import { useSubmitCount } from '../hooks/useSubmitCount';
import { unitsBulk, unitsPickface, unitsSingles } from '../utils/packaging';

export type CountMode = 'singles' | 'pickface' | 'bulk';

type UnitState = {
  singlesUnits: string;
  singlesCases: string;
  pickfaceLayers: string;
  pickfaceCases: string;
  bulkPallets: string;
  bulkLayers: string;
  bulkCases: string;
};

const TAB_LABELS: Record<CountMode, string> = {
  singles: 'Singles',
  pickface: 'Pick Face',
  bulk: 'Bulk'
};

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
  const [activeTab, setActiveTab] = useState<CountMode>('singles');
  const [stockCode, setStockCode] = useState(initialStockCode ?? '');
  const [caseBarcode, setCaseBarcode] = useState('');
  const [unitBarcode, setUnitBarcode] = useState('');
  const [lotNumber, setLotNumber] = useState(initialLotNumber ?? '');
  const [units, setUnits] = useState<UnitState>({
    singlesUnits: '',
    singlesCases: '',
    pickfaceLayers: '',
    pickfaceCases: '',
    bulkPallets: '',
    bulkLayers: '',
    bulkCases: ''
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCrops, setPhotoCrops] = useState<RoiCropResult | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setStockCode(initialStockCode ?? '');
  }, [initialStockCode]);

  useEffect(() => {
    setLotNumber(initialLotNumber ?? '');
  }, [initialLotNumber]);

  const productQuery = useProductsLookup({ stockCode, caseBarcode, unitBarcode });
  const product = productQuery.data as any;

  const packaging = useMemo(() => {
    return {
      upc: typeof product?.units_per_case === 'number' ? product.units_per_case : undefined,
      cpl: typeof product?.cases_per_layer === 'number' ? product.cases_per_layer : undefined,
      lpp: typeof product?.layers_per_pallet === 'number' ? product.layers_per_pallet : undefined,
      description: product?.product_name ?? product?.description ?? ''
    };
  }, [product]);

  const submitCount = useSubmitCount();

  function parseNumberInput(value: string): number | null {
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed);
  }

  const singlesUnitsValue = parseNumberInput(units.singlesUnits);
  const singlesCasesValue = parseNumberInput(units.singlesCases);
  const pickfaceLayersValue = parseNumberInput(units.pickfaceLayers);
  const pickfaceCasesValue = parseNumberInput(units.pickfaceCases);
  const bulkPalletsValue = parseNumberInput(units.bulkPallets);
  const bulkLayersValue = parseNumberInput(units.bulkLayers);
  const bulkCasesValue = parseNumberInput(units.bulkCases);

  const totals = {
    singles: unitsSingles(singlesUnitsValue ?? 0, singlesCasesValue ?? 0, packaging.upc),
    pickface: unitsPickface(pickfaceLayersValue ?? 0, pickfaceCasesValue ?? 0, packaging.upc, packaging.cpl),
    bulk: unitsBulk(
      bulkPalletsValue ?? 0,
      bulkLayersValue ?? 0,
      bulkCasesValue ?? 0,
      packaging.upc,
      packaging.cpl,
      packaging.lpp
    )
  };

  const hasQuantity = useMemo(() => {
    switch (activeTab) {
      case 'singles':
        return (singlesUnitsValue ?? 0) > 0 || (singlesCasesValue ?? 0) > 0;
      case 'pickface':
        return (pickfaceLayersValue ?? 0) > 0 || (pickfaceCasesValue ?? 0) > 0;
      case 'bulk':
        return (
          (bulkPalletsValue ?? 0) > 0 ||
          (bulkLayersValue ?? 0) > 0 ||
          (bulkCasesValue ?? 0) > 0
        );
      default:
        return false;
    }
  }, [
    activeTab,
    bulkCasesValue,
    bulkLayersValue,
    bulkPalletsValue,
    pickfaceCasesValue,
    pickfaceLayersValue,
    singlesCasesValue,
    singlesUnitsValue
  ]);

  const totalUnits = totals[activeTab];
  const packagingComplete = {
    singles: Boolean(packaging.upc),
    pickface: Boolean(packaging.upc && packaging.cpl),
    bulk: Boolean(packaging.upc && packaging.cpl && packaging.lpp)
  };

  function handlePhotoChange(file: File | null, crops: RoiCropResult | null) {
    setPhotoFile(file);
    setPhotoCrops(crops ?? null);
  }

  function resetQuantities() {
    setUnits({
      singlesUnits: '',
      singlesCases: '',
      pickfaceLayers: '',
      pickfaceCases: '',
      bulkPallets: '',
      bulkLayers: '',
      bulkCases: ''
    });
  }

  function handleResetAfterSubmit() {
    resetQuantities();
    if (!initialLotNumber) {
      setLotNumber('');
    }
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

    if (!stockCode && !caseBarcode && !unitBarcode) {
      setErrorMessage('Provide a stock code or barcode so we can match the product.');
      return;
    }

    if (!photoFile) {
      setErrorMessage('Capture a supporting photo before submitting.');
      return;
    }

    if (!hasQuantity) {
      setErrorMessage('Enter at least one quantity before submitting.');
      return;
    }

    try {
      const payload = {
        eventId,
        warehouseCode,
        stockCode: stockCode || undefined,
        caseBarcode: caseBarcode || undefined,
        unitBarcode: unitBarcode || undefined,
        lotNumber: lotNumber || undefined,
        photo: photoFile,
        roiCrops: photoCrops,
        recountTaskId
      } as const;

      const numericPayload = { ...payload } as any;
      if (activeTab === 'singles') {
        numericPayload.singlesUnits = singlesUnitsValue;
        numericPayload.singlesCases = singlesCasesValue;
      } else if (activeTab === 'pickface') {
        numericPayload.pickfaceLayers = pickfaceLayersValue;
        numericPayload.pickfaceCases = pickfaceCasesValue;
      } else {
        numericPayload.bulkPallets = bulkPalletsValue;
        numericPayload.bulkLayers = bulkLayersValue;
        numericPayload.bulkCases = bulkCasesValue;
      }

      await submitCount.mutateAsync(numericPayload);

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
              Snap a photo, enter what you see, and move on. Totals update instantly and AI extraction runs in the background.
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
          <div className="sticky top-16 z-10 space-y-3 rounded-xl border border-blue-100 bg-blue-50/80 p-4 backdrop-blur">
            <div className="flex flex-wrap gap-3">
              <InputField
                label="Stock Code"
                placeholder="e.g. SKU123"
                value={stockCode}
                onChange={(value) => setStockCode(value.toUpperCase())}
              />
              <InputField
                label="Case Barcode"
                placeholder="Scan case barcode"
                value={caseBarcode}
                onChange={setCaseBarcode}
              />
              <InputField
                label="Unit Barcode"
                placeholder="Scan unit barcode"
                value={unitBarcode}
                onChange={setUnitBarcode}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Packaging Factors</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Chip label="Units / Case" value={packaging.upc ? `${packaging.upc}` : '—'} />
                  <Chip label="Cases / Layer" value={packaging.cpl ? `${packaging.cpl}` : '—'} />
                  <Chip label="Layers / Pallet" value={packaging.lpp ? `${packaging.lpp}` : '—'} />
                </div>
              </div>
              <div className="text-right text-xs text-gray-600">
                {productQuery.isLoading ? 'Looking up product…' : packaging.description || 'Awaiting identification'}
              </div>
            </div>
          </div>

          <PhotoCapture file={photoFile} onChange={handlePhotoChange} />

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Lot number (optional)</label>
            <input
              type="text"
              value={lotNumber}
              onChange={(event) => setLotNumber(event.target.value)}
              placeholder="Lot / batch reference"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TAB_LABELS) as CountMode[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            {activeTab === 'singles' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <NumberField
                  label="Units"
                  value={units.singlesUnits}
                  onChange={(value) => setUnits((prev) => ({ ...prev, singlesUnits: value }))}
                />
                <NumberField
                  label="Cases"
                  value={units.singlesCases}
                  onChange={(value) => setUnits((prev) => ({ ...prev, singlesCases: value }))}
                />
              </div>
            )}

            {activeTab === 'pickface' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <NumberField
                  label="Layers"
                  value={units.pickfaceLayers}
                  onChange={(value) => setUnits((prev) => ({ ...prev, pickfaceLayers: value }))}
                />
                <NumberField
                  label="Cases"
                  value={units.pickfaceCases}
                  onChange={(value) => setUnits((prev) => ({ ...prev, pickfaceCases: value }))}
                />
                <TotalPill value={totalUnits} label="Total Units" />
              </div>
            )}

            {activeTab === 'bulk' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <NumberField
                  label="Full Pallets"
                  value={units.bulkPallets}
                  onChange={(value) => setUnits((prev) => ({ ...prev, bulkPallets: value }))}
                />
                <NumberField
                  label="Layers"
                  value={units.bulkLayers}
                  onChange={(value) => setUnits((prev) => ({ ...prev, bulkLayers: value }))}
                />
                <NumberField
                  label="Cases"
                  value={units.bulkCases}
                  onChange={(value) => setUnits((prev) => ({ ...prev, bulkCases: value }))}
                />
                <TotalPill value={totalUnits} label="Total Units" />
              </div>
            )}

            {activeTab === 'singles' && (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                <span className="font-medium text-gray-700">Total Units</span>
                <span className="text-lg font-semibold text-gray-900">{totalUnits}</span>
              </div>
            )}

            {!packagingComplete[activeTab] && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                We&apos;ll calculate the missing conversions once packaging data is available. Submit anyway to keep moving.
              </div>
            )}
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

function TotalPill({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-center text-sm text-blue-700">
      <span className="text-xs uppercase tracking-wide text-blue-600">{label}</span>
      <span className="text-lg font-semibold text-blue-800">{value}</span>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs text-blue-700">
      <span className="font-semibold uppercase tracking-wide text-blue-600">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-1 min-w-[160px] flex-col gap-2 text-sm font-medium text-gray-700">
      {label}
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
    </label>
  );
}
