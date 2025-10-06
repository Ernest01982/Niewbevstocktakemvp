import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface EventOption {
  id: string;
  name: string;
}

interface WarehouseOption {
  id: string;
  name: string;
}

export default function ExportCounts() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    async function loadOptions() {
      setLoading(true);
      setError('');
      try {
        const [{ data: eventData, error: eventError }, { data: warehouseData, error: warehouseError }] = await Promise.all([
          supabase.from('stocktake_events').select('id, name').order('name'),
          supabase.from('warehouses').select('id, name').order('name')
        ]);

        if (eventError) throw eventError;
        if (warehouseError) throw warehouseError;

        setEvents(eventData ?? []);
        setWarehouses(warehouseData ?? []);
      } catch (err) {
        console.error('Error loading export options:', err);
        setError(err instanceof Error ? err.message : 'Failed to load export filters.');
      } finally {
        setLoading(false);
      }
    }

    loadOptions();
  }, []);

  async function handleDownload() {
    setDownloading(true);
    setError('');
    setNotice('');

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Unable to authenticate download request.');
      }

      const params = new URLSearchParams();
      if (selectedEvent) {
        params.append('event_id', selectedEvent);
      }
      if (selectedWarehouse) {
        params.append('warehouse_id', selectedWarehouse);
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-counts?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        }
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to download export.');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `stock-counts-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setNotice('Export started. Check your downloads for the CSV file.');
    } catch (err) {
      console.error('Error exporting counts:', err);
      setError(err instanceof Error ? err.message : 'Failed to export counts.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Download className="h-6 w-6 text-blue-600" />
            Export Counts
          </h2>
          <p className="text-gray-600 text-sm mt-1">
            Download the captured counts for auditing or reconciliation. Choose an event and warehouse to filter your export.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {notice && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-600">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            Loading export filters...
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
              Event
              <select
                value={selectedEvent}
                onChange={(event) => setSelectedEvent(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">All events</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
              Warehouse
              <select
                value={selectedWarehouse}
                onChange={(event) => setSelectedWarehouse(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">All warehouses</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
              {downloading ? 'Preparing export…' : 'Download CSV'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
