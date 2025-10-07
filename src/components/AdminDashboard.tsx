import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Package,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Users
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useEventWarehouse } from '../contexts/EventWarehouseContext';
import { supabase } from '../lib/supabase';

type EventStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

interface AdminMetrics {
  totalUsers: number;
  totalEntries: number;
  openVarianceCount: number;
  bulkOperations: number;
}

interface RecentEntry {
  id: string;
  created_at: string | null;
  branch?: string | null;
  location?: string | null;
  actual_quantity?: number | null;
  unit_type?: string | null;
  user_profiles?: { full_name?: string | null } | null;
}

interface VarianceItem {
  id: string;
  created_at: string | null;
  variance_percentage?: number | null;
  status?: string | null;
  product?: { product_name?: string | null } | null;
}

interface NewEventDraft {
  name: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
}

interface NewWarehouseDraft {
  code: string;
  name: string;
}

const DEFAULT_METRICS: AdminMetrics = {
  totalUsers: 0,
  totalEntries: 0,
  openVarianceCount: 0,
  bulkOperations: 0
};

const EVENT_STATUSES: EventStatus[] = ['draft', 'active', 'paused', 'completed', 'archived'];

function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    console.warn('Failed to format date', error);
    return value;
  }
}

function extractFirst<T extends Record<string, unknown>>(value: unknown): T | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value[0] as T | undefined;
  }
  if (typeof value === 'object') {
    return value as T;
  }
  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'An unexpected error occurred';
  }
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const {
    events,
    warehouses,
    selectedEvent,
    eventId,
    warehouseCode,
    setEventId,
    setWarehouseCode,
    refreshEvents,
    refreshWarehouses
  } = useEventWarehouse();

  const [metrics, setMetrics] = useState<AdminMetrics>(DEFAULT_METRICS);
  const [roleBreakdown, setRoleBreakdown] = useState<Record<string, number>>({});
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [openVariances, setOpenVariances] = useState<VarianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [creatingWarehouse, setCreatingWarehouse] = useState(false);
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState<NewEventDraft>({
    name: '',
    status: 'draft',
    startsAt: '',
    endsAt: ''
  });
  const [newWarehouse, setNewWarehouse] = useState<NewWarehouseDraft>({ code: '', name: '' });

  const totalWarehouses = warehouses.length;
  const activeEvents = useMemo(() => events.filter((event) => event.status === 'active').length, [events]);

  const canAdminister = profile?.role === 'admin';

  const loadDashboardData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      const [userResult, entryCountResult, varianceCountResult, bulkCountResult, openVarianceResult, recentEntriesResult] =
        await Promise.all([
          supabase.from('user_profiles').select('id, role'),
          supabase.from('stocktake_entries').select('id', { count: 'exact', head: true }),
          supabase
            .from('variance_reports')
            .select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'reviewed']),
          supabase.from('bulk_uploads').select('id', { count: 'exact', head: true }),
          supabase
            .from('variance_reports')
            .select('id, variance_percentage, created_at, status, product:products(product_name)')
            .in('status', ['pending', 'reviewed'])
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('stocktake_entries')
            .select('id, created_at, branch, location, actual_quantity, unit_type, user_profiles(full_name)')
            .order('created_at', { ascending: false })
            .limit(5)
        ]);

      if (userResult.error) throw userResult.error;
      if (entryCountResult.error) throw entryCountResult.error;
      if (varianceCountResult.error) throw varianceCountResult.error;
      if (bulkCountResult.error) throw bulkCountResult.error;
      if (openVarianceResult.error) throw openVarianceResult.error;
      if (recentEntriesResult.error) throw recentEntriesResult.error;

      const newMetrics: AdminMetrics = {
        totalUsers: userResult.count ?? userResult.data?.length ?? 0,
        totalEntries: entryCountResult.count ?? 0,
        openVarianceCount: varianceCountResult.count ?? 0,
        bulkOperations: bulkCountResult.count ?? 0
      };

      const breakdown = (userResult.data ?? []).reduce<Record<string, number>>((acc, user) => {
        const role = ((user as { role?: string | null }).role ?? 'unknown').toLowerCase();
        acc[role] = (acc[role] ?? 0) + 1;
        return acc;
      }, {});

      const normalizedVariances: VarianceItem[] = (openVarianceResult.data ?? []).map((row, index) => {
        const rawId = (row as { id?: unknown }).id;
        const id = typeof rawId === 'string' ? rawId : rawId != null ? String(rawId) : `variance-${index}`;
        const product = extractFirst<{ product_name?: string | null }>((row as { product?: unknown }).product);
        const rawVariance = (row as { variance_percentage?: number | string | null }).variance_percentage;

        return {
          id,
          created_at: ((row as { created_at?: string | null }).created_at ?? null) as string | null,
          variance_percentage:
            typeof rawVariance === 'number'
              ? rawVariance
              : rawVariance != null
                ? Number(rawVariance)
                : null,
          status: ((row as { status?: string | null }).status ?? null) as string | null,
          product: product ? { product_name: product.product_name ?? null } : undefined
        };
      });

      const normalizedEntries: RecentEntry[] = (recentEntriesResult.data ?? []).map((row, index) => {
        const rawId = (row as { id?: unknown }).id;
        const id = typeof rawId === 'string' ? rawId : rawId != null ? String(rawId) : `entry-${index}`;
        const profile = extractFirst<{ full_name?: string | null }>((row as { user_profiles?: unknown }).user_profiles);
        const rawQuantity = (row as { actual_quantity?: number | string | null }).actual_quantity;

        return {
          id,
          created_at: ((row as { created_at?: string | null }).created_at ?? null) as string | null,
          branch: ((row as { branch?: string | null }).branch ?? null) as string | null,
          location: ((row as { location?: string | null }).location ?? null) as string | null,
          actual_quantity:
            typeof rawQuantity === 'number'
              ? rawQuantity
              : rawQuantity != null
                ? Number(rawQuantity)
                : null,
          unit_type: ((row as { unit_type?: string | null }).unit_type ?? null) as string | null,
          user_profiles: profile ? { full_name: profile.full_name ?? null } : undefined
        };
      });

      setMetrics(newMetrics);
      setRoleBreakdown(breakdown);
      setOpenVariances(normalizedVariances);
      setRecentEntries(normalizedEntries);
    } catch (caughtError) {
      console.error('Failed to load admin metrics', caughtError);
      setError(getErrorMessage(caughtError));
      setMetrics(DEFAULT_METRICS);
      setRoleBreakdown({});
      setOpenVariances([]);
      setRecentEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canAdminister) {
      setLoading(false);
      return;
    }
    void loadDashboardData();
  }, [canAdminister, loadDashboardData]);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([loadDashboardData(), refreshEvents(), refreshWarehouses()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboardData, refreshEvents, refreshWarehouses]);

  const handleCreateEvent = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!newEvent.name.trim()) {
        setError('Event name is required');
        return;
      }

      try {
        setCreatingEvent(true);
        const payload = {
          name: newEvent.name.trim(),
          status: newEvent.status,
          starts_at: newEvent.startsAt ? new Date(newEvent.startsAt).toISOString() : null,
          ends_at: newEvent.endsAt ? new Date(newEvent.endsAt).toISOString() : null
        };

        const { error: insertError } = await supabase.from('stocktake_events').insert([payload]);
        if (insertError) throw insertError;

        setNewEvent({ name: '', status: 'draft', startsAt: '', endsAt: '' });
        await refreshEvents();
        await loadDashboardData();
      } catch (caughtError) {
        console.error('Failed to create event', caughtError);
        setError(getErrorMessage(caughtError));
      } finally {
        setCreatingEvent(false);
      }
    },
    [loadDashboardData, newEvent, refreshEvents]
  );

  const handleUpdateEventStatus = useCallback(
    async (id: string, status: EventStatus) => {
      try {
        setUpdatingEventId(id);
        const { error: updateError } = await supabase
          .from('stocktake_events')
          .update({ status })
          .eq('id', id);
        if (updateError) throw updateError;
        await refreshEvents();
        await loadDashboardData();
      } catch (caughtError) {
        console.error('Failed to update event status', caughtError);
        setError(getErrorMessage(caughtError));
      } finally {
        setUpdatingEventId(null);
      }
    },
    [loadDashboardData, refreshEvents]
  );

  const handleCreateWarehouse = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!newWarehouse.code.trim()) {
        setError('Warehouse code is required');
        return;
      }
      if (!newWarehouse.name.trim()) {
        setError('Warehouse name is required');
        return;
      }

      try {
        setCreatingWarehouse(true);
        const payload = {
          code: newWarehouse.code.trim(),
          name: newWarehouse.name.trim()
        };

        const { error: insertError } = await supabase.from('warehouses').insert([payload]);
        if (insertError) throw insertError;

        setNewWarehouse({ code: '', name: '' });
        await refreshWarehouses();
      } catch (caughtError) {
        console.error('Failed to create warehouse', caughtError);
        setError(getErrorMessage(caughtError));
      } finally {
        setCreatingWarehouse(false);
      }
    },
    [newWarehouse, refreshWarehouses]
  );

  if (!canAdminister) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-100 p-8">
        <div className="flex items-center gap-3 text-red-600">
          <ShieldCheck className="w-6 h-6" />
          <div>
            <h2 className="text-lg font-semibold">Administrator access required</h2>
            <p className="text-sm text-red-500">
              You need administrator privileges to view the control panel.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const quickStats = [
    {
      label: 'Total Users',
      value: metrics.totalUsers,
      icon: Users,
      accent: 'bg-blue-50 text-blue-600'
    },
    {
      label: 'Warehouses',
      value: totalWarehouses,
      icon: Package,
      accent: 'bg-emerald-50 text-emerald-600'
    },
    {
      label: 'Active Events',
      value: activeEvents,
      icon: CalendarClock,
      accent: 'bg-amber-50 text-amber-600'
    },
    {
      label: 'Open Variances',
      value: metrics.openVarianceCount,
      icon: AlertTriangle,
      accent: 'bg-rose-50 text-rose-600'
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Administrator Control Panel</h2>
          <p className="text-gray-500">
            Gain visibility into system activity, manage operational resources, and keep the stocktake programme on track.
          </p>
        </div>
        <button
          onClick={() => void handleRefresh()}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
          disabled={refreshing}
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          Refresh data
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <section>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">System snapshot</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {quickStats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.accent}`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <p className="mt-4 text-sm font-medium text-gray-500">{stat.label}</p>
              <p className="text-2xl font-semibold text-gray-900">{loading ? '—' : stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">Variance watchlist</h3>
              <AlertTriangle className="w-5 h-5 text-rose-500" />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Monitor variances requiring review before they impact reconciliations.
            </p>
            <div className="mt-4 space-y-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading variances...
                </div>
              ) : openVariances.length === 0 ? (
                <p className="text-sm text-emerald-600">No outstanding variances. Great work!</p>
              ) : (
                openVariances.map((variance) => (
                  <div key={variance.id} className="rounded-lg border border-gray-100 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {variance.product?.product_name ?? 'Unlinked product'}
                        </p>
                        <p className="text-xs text-gray-500">Raised {formatDate(variance.created_at)}</p>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
                        {variance.variance_percentage?.toFixed(2) ?? '—'}%
                      </span>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-wide text-gray-400">Status</p>
                    <p className="text-sm font-medium text-gray-700 capitalize">{variance.status ?? 'pending'}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">Recent stocktake activity</h3>
              <Activity className="w-5 h-5 text-blue-500" />
            </div>
            <p className="mt-1 text-sm text-gray-500">Live feed of the last five entries captured across the network.</p>
            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading activity...
                </div>
              ) : recentEntries.length === 0 ? (
                <p className="text-sm text-gray-500">No stocktake entries recorded yet.</p>
              ) : (
                recentEntries.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-gray-100 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {entry.user_profiles?.full_name ?? 'Unknown user'}
                        </p>
                        <p className="text-xs text-gray-500">{formatDate(entry.created_at)}</p>
                      </div>
                      <span className="text-sm font-semibold text-blue-600">
                        {entry.actual_quantity ?? 0} {entry.unit_type ?? 'units'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      {entry.branch ?? '—'} · {entry.location ?? 'No location'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Role distribution</h3>
                <p className="text-sm text-gray-500">Understand how responsibilities are allocated.</p>
              </div>
              <BarChart3 className="w-5 h-5 text-purple-500" />
            </div>
            <div className="mt-4 space-y-3">
              {loading && Object.keys(roleBreakdown).length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Fetching role data...
                </div>
              ) : Object.keys(roleBreakdown).length === 0 ? (
                <p className="text-sm text-gray-500">No users found.</p>
              ) : (
                Object.entries(roleBreakdown).map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between text-sm text-gray-600">
                    <span className="capitalize">{role}</span>
                    <span className="font-semibold text-gray-900">{count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Current focus</h3>
                <p className="text-sm text-gray-500">
                  {selectedEvent ? `Tracking ${selectedEvent.name}` : 'Select an event to focus dashboards and exports.'}
                </p>
              </div>
              <ClipboardCheck className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active event</label>
                <select
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={eventId ?? ''}
                  onChange={(event) => setEventId(event.target.value)}
                >
                  <option value="" disabled>
                    Select event
                  </option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Primary warehouse</label>
                <select
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={warehouseCode ?? ''}
                  onChange={(event) => setWarehouseCode(event.target.value)}
                >
                  <option value="" disabled>
                    Select warehouse
                  </option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.code} value={warehouse.code}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedEvent && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-800">{selectedEvent.name}</p>
                  <p className="text-xs text-gray-500">
                    {selectedEvent.starts_at ? `From ${formatDate(selectedEvent.starts_at)}` : 'Start date TBC'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectedEvent.ends_at ? `To ${formatDate(selectedEvent.ends_at)}` : 'End date TBC'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Create stocktake event</h3>
              <p className="text-sm text-gray-500">Coordinate campaigns across regions with clear timelines.</p>
            </div>
            <Plus className="w-5 h-5 text-blue-500" />
          </div>
          <form className="mt-4 space-y-4" onSubmit={handleCreateEvent}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="new-event-name">
                Event name
              </label>
              <input
                id="new-event-name"
                type="text"
                value={newEvent.name}
                onChange={(event) => setNewEvent((current) => ({ ...current, name: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Quarterly stocktake"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="new-event-start">
                  Starts at
                </label>
                <input
                  id="new-event-start"
                  type="datetime-local"
                  value={newEvent.startsAt}
                  onChange={(event) => setNewEvent((current) => ({ ...current, startsAt: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="new-event-end">
                  Ends at
                </label>
                <input
                  id="new-event-end"
                  type="datetime-local"
                  value={newEvent.endsAt}
                  onChange={(event) => setNewEvent((current) => ({ ...current, endsAt: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="new-event-status">
                Status
              </label>
              <select
                id="new-event-status"
                value={newEvent.status}
                onChange={(event) => setNewEvent((current) => ({ ...current, status: event.target.value as EventStatus }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {EVENT_STATUSES.map((status) => (
                  <option key={status} value={status} className="capitalize">
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={creatingEvent}
            >
              {creatingEvent ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Create event
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Register warehouse</h3>
              <p className="text-sm text-gray-500">Keep facilities catalogued for assignment and reporting.</p>
            </div>
            <Package className="w-5 h-5 text-emerald-500" />
          </div>
          <form className="mt-4 space-y-4" onSubmit={handleCreateWarehouse}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="new-warehouse-code">
                Warehouse code
              </label>
              <input
                id="new-warehouse-code"
                type="text"
                value={newWarehouse.code}
                onChange={(event) => setNewWarehouse((current) => ({ ...current, code: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="e.g. DC-01"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="new-warehouse-name">
                Warehouse name
              </label>
              <input
                id="new-warehouse-name"
                type="text"
                value={newWarehouse.name}
                onChange={(event) => setNewWarehouse((current) => ({ ...current, name: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Distribution Centre"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={creatingWarehouse}
            >
              {creatingWarehouse ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add warehouse
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Event oversight</h3>
            <p className="text-sm text-gray-500">Review live and historical programmes and update their lifecycle states.</p>
          </div>
          <CalendarClock className="w-5 h-5 text-blue-500" />
        </div>
        <div className="mt-4 space-y-4">
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">No events configured yet. Create one to begin planning.</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="rounded-lg border border-gray-100 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{event.name}</p>
                    <p className="text-xs text-gray-500">
                      {event.starts_at ? `Starts ${formatDate(event.starts_at)}` : 'Start date TBC'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {event.ends_at ? `Ends ${formatDate(event.ends_at)}` : 'End date TBC'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 md:items-end">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</label>
                      <select
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        value={(event.status as EventStatus | null) ?? 'draft'}
                        onChange={(changeEvent) =>
                          void handleUpdateEventStatus(event.id, changeEvent.target.value as EventStatus)
                        }
                        disabled={updatingEventId === event.id}
                      >
                        {EVENT_STATUSES.map((status) => (
                          <option key={status} value={status} className="capitalize">
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEventId(event.id)}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${
                        eventId === event.id
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Set as current
                    </button>
                  </div>
                </div>
                {updatingEventId === event.id && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-blue-500">
                    <Loader2 className="w-3 h-3 animate-spin" /> Updating status...
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
