import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Download, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type VarianceRow = {
  id: string;
  description: string;
  lot: string;
  variance: number;
  warehouse_id: string;
  warehouse_name?: string | null;
  event_name?: string | null;
  product_code?: string | null;
  created_at?: string;
};

type WarehouseAssignment = {
  warehouse_id: string;
  warehouse?: { id: string; name: string } | null;
};

export default function VarianceReports() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<VarianceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseAssignment[]>([]);
  const [assignedWarehouseIds, setAssignedWarehouseIds] = useState<string[]>([]);

  const warehouseOptions = useMemo(() => {
    return warehouses
      .map((assignment) => assignment.warehouse)
      .filter((w): w is { id: string; name: string } => Boolean(w));
  }, [warehouses]);

  const canAssign = selected.size > 0 && !assigning;

  const loadWarehouses = useCallback(async () => {
    if (!profile) {
      setWarehouses([]);
      setAssignedWarehouseIds([]);
      return [];
    }

    try {
      const { data, error: queryError } = await supabase
        .from('user_warehouse_assignments')
        .select('warehouse_id, warehouses(id, name)')
        .eq('user_id', profile.id);

      if (queryError) throw queryError;

      const normalized: WarehouseAssignment[] = (data ?? []).map((assignment: any) => ({
        warehouse_id: assignment.warehouse_id as string,
        warehouse: Array.isArray(assignment.warehouses)
          ? assignment.warehouses[0] ?? null
          : assignment.warehouses ?? null
      }));

      setWarehouses(normalized);
      const ids = normalized
        .map((assignment) => assignment.warehouse_id)
        .filter((id): id is string => Boolean(id));
      setAssignedWarehouseIds(ids);
      return ids;
    } catch (err) {
      console.error('Error loading warehouse assignments:', err);
      setError(err instanceof Error ? err.message : 'Unable to load warehouse assignments.');
      return [];
    }
  }, [profile]);

  const loadVariance = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const { data, error: queryError } = await supabase
          .from('manager_variance_view')
          .select('*')
          .in('warehouse_id', ids)
          .order('created_at', { ascending: false });

        if (queryError) throw queryError;
        const typedRows = (data ?? []) as VarianceRow[];
        setRows(typedRows);
      } catch (err) {
        console.error('Error loading variance view:', err);
        setError(err instanceof Error ? err.message : 'Failed to load variance data.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    async function initialise() {
      const ids = await loadWarehouses();
      if (ids.length > 0) {
        await loadVariance(ids);
      } else {
        setLoading(false);
        setRows([]);
      }
    }

    initialise();
  }, [loadVariance, loadWarehouses]);

  function toggleSelection(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleAssignRecounts() {
    if (selected.size === 0) return;
    setAssigning(true);
    setError('');

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Unable to authenticate assign request.');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assign-recounts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ variance_ids: Array.from(selected) })
        }
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to assign recounts.');
      }

      setSelected(new Set());
      if (assignedWarehouseIds.length > 0) {
        await loadVariance(assignedWarehouseIds);
      }
    } catch (err) {
      console.error('Error assigning recounts:', err);
      setError(err instanceof Error ? err.message : 'Failed to assign recounts.');
    } finally {
      setAssigning(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <p className="mt-3 text-gray-600">Loading variance data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Variance Overview</h2>
            <p className="text-gray-600 text-sm">
              Review stock variances across your assigned warehouses. Select rows to trigger recount tasks.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAssignRecounts}
            disabled={!canAssign}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Assign Recounts
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {rows.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center gap-3 py-10 text-gray-600">
            <CheckCircle className="h-10 w-10 text-green-500" />
            <p className="text-base font-medium">No variances detected for your warehouses.</p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Lot</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Variance
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Warehouse
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Event
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {rows.map((row) => {
                  const isSelected = selected.has(row.id);
                  const varianceClass = row.variance === 0 ? 'text-gray-600' : row.variance > 0 ? 'text-green-600' : 'text-red-600';
                  return (
                    <tr key={row.id} className={isSelected ? 'bg-blue-50' : undefined}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(row.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-semibold">{row.description}</div>
                        {row.product_code && (
                          <div className="text-xs text-gray-500">Code: {row.product_code}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.lot || '—'}</td>
                      <td className={`px-4 py-3 text-sm font-semibold ${varianceClass}`}>
                        <div className="flex items-center gap-2">
                          {row.variance === 0 ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                          {row.variance}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {row.warehouse_name || warehouseOptions.find((w) => w.id === row.warehouse_id)?.name || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.event_name || '—'}</td>
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
