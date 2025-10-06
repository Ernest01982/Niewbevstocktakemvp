import { useMemo, useState } from 'react';
import { AlertCircle, ClipboardList, Loader2, RefreshCcw } from 'lucide-react';
import { useEventWarehouse } from '../contexts/EventWarehouseContext';
import { useVariance } from '../hooks/useVariance';
import { useAssignRecounts } from '../hooks/useAssignRecounts';

export default function VarianceReports() {
  const { eventId, warehouseCode, selectedEvent, selectedWarehouse } = useEventWarehouse();
  const varianceQuery = useVariance(eventId, warehouseCode);
  const assignMutation = useAssignRecounts();
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const rows = useMemo(() => varianceQuery.data ?? [], [varianceQuery.data]);
  const nothingSelected = selectedRows.size === 0;

  function toggleRow(id: string) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleAssign() {
    if (!eventId || !warehouseCode || nothingSelected) return;
    const items = rows
      .filter((row) => selectedRows.has(row.stock_code ?? `${row.description}-${row.lot_number}`))
      .filter((row) => Boolean(row.stock_code))
      .map((row) => ({
        stock_code: row.stock_code as string,
        lot_number: row.lot_number
      }));

    if (items.length === 0) return;

    try {
      await assignMutation.mutateAsync({ eventId, warehouseCode, items });
      setSelectedRows(new Set());
      await varianceQuery.refetch();
    } catch (error) {
      console.error('Failed to assign recounts', error);
    }
  }

  const isLoading = varianceQuery.isLoading;
  const error = varianceQuery.error;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <ClipboardList className="h-6 w-6 text-blue-600" /> Variance Overview
          </h2>
          <p className="text-sm text-gray-600">
            Review variances for <strong>{selectedEvent?.name ?? '…'}</strong> in{' '}
            <strong>{selectedWarehouse?.name ?? '…'}</strong>. Select rows to trigger recount tasks.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => varianceQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>

          <button
            type="button"
            onClick={handleAssign}
            disabled={nothingSelected || assignMutation.isPending || !eventId || !warehouseCode}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {assignMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Assigning…
              </>
            ) : (
              'Assign recounts'
            )}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" /> {error.message}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-600">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" /> Loading variance data…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
            No variances to show for this selection.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Select</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Lot Number</th>
                  <th className="px-4 py-3 text-right">Variance Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((row) => {
                  const id = row.stock_code ?? `${row.description}-${row.lot_number}`;
                  const isSelected = selectedRows.has(id);
                  return (
                    <tr key={id} className={isSelected ? 'bg-blue-50' : undefined}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800">{row.description}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.lot_number}</td>
                      <td
                        className={`px-4 py-3 text-right text-sm font-semibold ${
                          row.variance_units < 0 ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {row.variance_units}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
