import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useEventWarehouse } from '../hooks/useEventWarehouse';
import { useExportCounts } from '../hooks/useExportCounts';

export default function ExportCounts() {
  const { eventId, warehouseCode, selectedEvent, selectedWarehouse } = useEventWarehouse();
  const exportMutation = useExportCounts();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function handleDownload() {
    setError('');
    setNotice('');
    if (!eventId || !warehouseCode) {
      setError('Choose an event and warehouse first.');
      return;
    }

    try {
      const blob = await exportMutation.mutateAsync({ eventId, warehouseCode });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `counts-${eventId}-${warehouseCode}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setNotice('Export started — check your downloads for the CSV file.');
    } catch (err) {
      console.error('Export failed', err);
      setError(err instanceof Error ? err.message : 'Failed to export counts');
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6 space-y-6">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Download className="h-6 w-6 text-blue-600" /> Export Counts
          </h2>
          <p className="text-sm text-gray-600">
            Download all captured counts for{' '}
            <strong>{selectedEvent?.name ?? 'your event'}</strong> in <strong>{selectedWarehouse?.name ?? 'your warehouse'}</strong>.
          </p>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>
        )}

        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-700">
          <p>
            Event: <span className="font-semibold text-gray-900">{selectedEvent?.name ?? 'Select an event'}</span>
          </p>
          <p>
            Warehouse:{' '}
            <span className="font-semibold text-gray-900">{selectedWarehouse?.name ?? 'Select a warehouse'}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={exportMutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {exportMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          {exportMutation.isPending ? 'Preparing export…' : 'Download CSV'}
        </button>
      </div>
    </div>
  );
}
