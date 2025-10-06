import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2, RefreshCcw, Search } from 'lucide-react';
import StocktakeEntry from './StocktakeEntry';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface RecountTask {
  id: string;
  stock_code: string;
  lot_number: string;
  description?: string | null;
  warehouse?: string | null;
  location?: string | null;
  created_at?: string;
}

export default function Recounts() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<RecountTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<RecountTask | null>(null);
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('recount_tasks')
        .select('*')
        .eq('assigned_to', user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: true });

      if (queryError) throw queryError;
      setTasks(data ?? []);
      if (data && data.length > 0) {
        setSelectedTask(data[0]);
      } else {
        setSelectedTask(null);
      }
    } catch (err) {
      console.error('Error loading recount tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load recount tasks.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function handleTaskCompleted(task: RecountTask) {
    try {
      setSubmittingTaskId(task.id);
      const { error: updateError } = await supabase
        .from('recount_tasks')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', task.id);

      if (updateError) throw updateError;
      await loadTasks();
    } catch (err) {
      console.error('Error marking task as done:', err);
      setError(err instanceof Error ? err.message : 'Failed to update task status.');
    } finally {
      setSubmittingTaskId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-blue-600" />
          Recounts
        </h2>
        <p className="text-gray-600 text-sm">
          Review variance recounts assigned to you and submit updated counts.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <p className="mt-3 text-gray-600">Loading recount tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-8 text-center space-y-3">
          <Search className="mx-auto h-10 w-10 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-800">No recounts assigned</h3>
          <p className="text-gray-600 text-sm">
            When managers flag variances for review, you&apos;ll see them appear here.
          </p>
          <button
            type="button"
            onClick={loadTasks}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6">
          <div className="bg-white rounded-xl shadow-lg p-4 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">Open Tasks</h3>
              <button
                type="button"
                onClick={loadTasks}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </button>
            </div>

            <div className="space-y-3">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedTask(task)}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition ${
                    selectedTask?.id === task.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{task.warehouse || 'Warehouse'}</span>
                    <span>{task.location || 'Location'}</span>
                  </div>
                  <div className="mt-2 font-semibold text-gray-900">{task.stock_code}</div>
                  <div className="text-sm text-gray-600">Lot {task.lot_number}</div>
                  {task.description && (
                    <p className="mt-2 text-sm text-gray-500 line-clamp-2">{task.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            {selectedTask ? (
              <div className="space-y-6">
                <div className="border-b border-gray-200 pb-4">
                  <h3 className="text-xl font-semibold text-gray-900">Submit recount</h3>
                  <p className="text-sm text-gray-600">
                    Provide your updated count for <span className="font-medium">{selectedTask.stock_code}</span>{' '}
                    (Lot {selectedTask.lot_number}). Ensure the supporting photo clearly shows the quantity counted.
                  </p>
                </div>

                <StocktakeEntry
                  initialStockCode={selectedTask.stock_code}
                  initialLotNumber={selectedTask.lot_number}
                  recountTaskId={selectedTask.id}
                  onSubmitSuccess={() => handleTaskCompleted(selectedTask)}
                  compact
                  hideHeading
                />

                {submittingTaskId === selectedTask.id && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating task status...
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-gray-500">
                <ClipboardList className="h-10 w-10" />
                <p>Select a task from the list to begin the recount.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
