import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, CheckCircle, FileText } from 'lucide-react';
import { supabase, VarianceReport, Product } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type VarianceReportWithProduct = VarianceReport & { product: Product | null };

export default function VarianceReports() {
  const { profile } = useAuth();
  const [reports, setReports] = useState<VarianceReportWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed' | 'resolved'>('all');
  const [selectedReport, setSelectedReport] = useState<VarianceReportWithProduct | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('variance_reports')
        .select(`
          *,
          product:products(*)
        `)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setReports(data as VarianceReportWithProduct[]);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function updateReportStatus(reportId: string, status: 'reviewed' | 'resolved', notes: string) {
    if (!profile) return;

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('variance_reports')
        .update({
          status,
          reviewed_by: profile.id,
          notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      if (error) throw error;

      await loadReports();
      setSelectedReport(null);
      setReviewNotes('');
    } catch (error) {
      console.error('Error updating report:', error);
    } finally {
      setUpdating(false);
    }
  }

  function getVarianceColor(percentage: number) {
    const abs = Math.abs(percentage);
    if (abs < 5) return 'text-green-600';
    if (abs < 15) return 'text-yellow-600';
    return 'text-red-600';
  }

  function getVarianceBgColor(percentage: number) {
    const abs = Math.abs(percentage);
    if (abs < 5) return 'bg-green-50 border-green-200';
    if (abs < 15) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-7 h-7" />
            Variance Reports
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filter === 'pending'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilter('reviewed')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filter === 'reviewed'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Reviewed
            </button>
            <button
              onClick={() => setFilter('resolved')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filter === 'resolved'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Resolved
            </button>
          </div>
        </div>

        {reports.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No Reports Found</h3>
            <p className="text-gray-600">
              {filter === 'all'
                ? 'No variance reports have been generated yet'
                : `No ${filter} reports at this time`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div
                key={report.id}
                className={`border rounded-lg p-4 transition-all ${getVarianceBgColor(report.variance_percentage)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 text-lg mb-2">
                      {report.product?.product_name || 'Unknown Product'}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Barcode:</span>
                        <p className="font-medium font-mono">{report.product?.barcode || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Lot:</span>
                        <p className="font-medium">{report.lot_number || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Expected (units):</span>
                        <p className="font-medium">{report.expected_units ?? report.expected_quantity}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Actual (units):</span>
                        <p className="font-medium">{report.actual_units ?? report.actual_quantity}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Variance:</span>
                        <p className={`font-bold ${getVarianceColor(report.variance_percentage)} flex items-center gap-1`}>
                          {report.variance > 0 ? (
                            <TrendingUp className="w-4 h-4" />
                          ) : (
                            <TrendingDown className="w-4 h-4" />
                          )}
                          {report.variance} ({report.variance_percentage.toFixed(1)}%)
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        report.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        report.status === 'reviewed' ? 'bg-blue-100 text-blue-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {report.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(report.created_at).toLocaleString()}
                      </span>
                    </div>
                    {report.notes && (
                      <div className="mt-2 text-sm text-gray-700 bg-white bg-opacity-60 p-2 rounded">
                        <strong>Notes:</strong> {report.notes}
                      </div>
                    )}
                  </div>
                  {profile?.role && ['manager', 'admin'].includes(profile.role) && report.status !== 'resolved' && (
                    <button
                      onClick={() => {
                        setSelectedReport(report);
                        setReviewNotes(report.notes || '');
                      }}
                      className="ml-4 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-all flex items-center gap-2"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Review
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Review Variance Report</h3>

            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p className="font-semibold">{selectedReport.product?.product_name}</p>
              <p className="text-sm text-gray-600 mt-1">
                Variance: {selectedReport.variance} ({selectedReport.variance_percentage.toFixed(1)}%)
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Review Notes
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Add your notes here..."
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => updateReportStatus(selectedReport.id, 'reviewed', reviewNotes)}
                disabled={updating}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {updating ? 'Updating...' : 'Mark Reviewed'}
              </button>
              <button
                onClick={() => updateReportStatus(selectedReport.id, 'resolved', reviewNotes)}
                disabled={updating}
                className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-all"
              >
                {updating ? 'Updating...' : 'Mark Resolved'}
              </button>
              <button
                onClick={() => {
                  setSelectedReport(null);
                  setReviewNotes('');
                }}
                disabled={updating}
                className="px-4 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
