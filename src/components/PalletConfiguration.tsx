import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Package, Save, Plus, Trash2, Upload, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { loadXLSX } from '../lib/xlsxLoader';

interface PalletConfig {
  id: string;
  product_name: string;
  barcode: string;
  units_per_case: number;
  cases_per_layer: number;
  layers_per_pallet: number;
  units_per_pallet: number;
  created_at: string;
  updated_at: string;
}

export default function PalletConfiguration() {
  const [configs, setConfigs] = useState<PalletConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Partial<PalletConfig> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    total: number;
    success: number;
    failed: number;
    errors: Array<{ row: number; error: string }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    try {
      const { data, error } = await supabase
        .from('pallet_configurations')
        .select('*')
        .order('product_name');

      if (error) throw error;
      setConfigs(data || []);
    } catch (error) {
      console.error('Error loading configs:', error);
    } finally {
      setLoading(false);
    }
  }

  function startNewConfig() {
    setEditingConfig({
      product_name: '',
      barcode: '',
      units_per_case: 0,
      cases_per_layer: 0,
      layers_per_pallet: 0,
      units_per_pallet: 0
    });
  }

  function calculateUnitsPerPallet(config: Partial<PalletConfig>): number {
    const unitsPerCase = config.units_per_case || 0;
    const casesPerLayer = config.cases_per_layer || 0;
    const layersPerPallet = config.layers_per_pallet || 0;
    return unitsPerCase * casesPerLayer * layersPerPallet;
  }

  async function saveConfig() {
    if (!editingConfig) return;

    setSaving(true);
    try {
      const unitsPerPallet = calculateUnitsPerPallet(editingConfig);

      const configData = {
        ...editingConfig,
        units_per_pallet: unitsPerPallet
      };

      if (editingConfig.id) {
        const { error } = await supabase
          .from('pallet_configurations')
          .update(configData)
          .eq('id', editingConfig.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('pallet_configurations')
          .insert(configData);

        if (error) throw error;
      }

      setEditingConfig(null);
      await loadConfigs();
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function deleteConfig(id: string) {
    if (!confirm('Are you sure you want to delete this configuration?')) return;

    try {
      const { error } = await supabase
        .from('pallet_configurations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadConfigs();
    } catch (error) {
      console.error('Error deleting config:', error);
      alert('Failed to delete configuration');
    }
  }

  async function downloadTemplate() {
    try {
      const XLSX = await loadXLSX();
      const headers = [
        'Product Name',
        'Barcode',
        'Units per Case',
        'Cases per Layer',
        'Layers per Pallet'
      ];

      const sampleData = [
        ['Example Product', '1234567890123', '24', '10', '5']
      ];

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pallet Config');
      XLSX.writeFile(workbook, 'pallet_configuration_template.xlsx');
    } catch (error) {
      console.error('Template download error:', error);
      alert('Failed to generate Excel template.');
    }
  }

  async function handleBulkUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const { headers, rows, rowNumbers } = await parseDataFile(file);

      let successCount = 0;
      let failedCount = 0;
      const errors: Array<{ row: number; error: string }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = rowNumbers[i] ?? i + 2;

        try {
          const config = parseConfigRow(headers, row);
          const { error } = await supabase
            .from('pallet_configurations')
            .upsert({
              product_name: config.product_name,
              barcode: config.barcode,
              units_per_case: config.units_per_case,
              cases_per_layer: config.cases_per_layer,
              layers_per_pallet: config.layers_per_pallet,
              units_per_pallet: config.units_per_pallet
            }, {
              onConflict: 'barcode'
            });

          if (error) {
            throw error;
          }

          successCount++;
        } catch (error) {
          failedCount++;
          errors.push({
            row: rowNum,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      if (successCount > 0) {
        await loadConfigs();
      }

      setUploadResult({
        total: rows.length,
        success: successCount,
        failed: failedCount,
        errors
      });
    } catch (error) {
      console.error('Bulk upload error:', error);
      alert(error instanceof Error ? error.message : 'Failed to process file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function parseDataFile(file: File): Promise<{ headers: string[]; rows: string[][]; rowNumbers: number[] }> {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.xlsx')) {
      const XLSX = await loadXLSX();
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData: Array<Array<string | number | undefined>> = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false
      });

      const filtered = rawData.filter(row =>
        Array.isArray(row) && row.some(cell => (cell ?? '').toString().trim() !== '')
      );

      if (filtered.length < 2) {
        throw new Error('File must contain headers and at least one data row');
      }

      const headers = filtered[0].map(cell => (cell ?? '').toString().trim().toLowerCase());
      const rows = filtered.slice(1).map(row =>
        headers.map((_, idx) => (row[idx] ?? '').toString().trim())
      );
      const rowNumbers = rows.map((_, idx) => idx + 2);
      return { headers, rows, rowNumbers };
    }

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line);

    if (lines.length < 2) {
      throw new Error('File must contain headers and at least one data row');
    }

    const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase());
    const rows = lines.slice(1).map(line => {
      const parsed = parseCSVRow(line);
      return headers.map((_, idx) => (parsed[idx] ?? '').trim());
    });
    const rowNumbers = rows.map((_, idx) => idx + 2);
    return { headers, rows, rowNumbers };
  }

  function parseCSVRow(row: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  function parseConfigRow(headers: string[], values: string[]) {
    const getValue = (name: string) => {
      const index = headers.findIndex(header => header.includes(name.toLowerCase()));
      return index >= 0 ? values[index] : '';
    };

    const productName = getValue('product');
    const barcode = getValue('barcode');

    if (!productName || !barcode) {
      throw new Error('Product name and barcode are required');
    }

    const unitsPerCase = parseInt(getValue('units per case') || '0', 10) || 0;
    const casesPerLayer = parseInt(getValue('cases per layer') || '0', 10) || 0;
    const layersPerPallet = parseInt(getValue('layers per pallet') || '0', 10) || 0;

    return {
      product_name: productName,
      barcode,
      units_per_case: unitsPerCase,
      cases_per_layer: casesPerLayer,
      layers_per_pallet: layersPerPallet,
      units_per_pallet: unitsPerCase * casesPerLayer * layersPerPallet
    };
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Package className="w-7 h-7" />
            Pallet Configuration
          </h2>
          <button
            onClick={startNewConfig}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-all flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Configuration
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            Configure pallet structures to automatically convert counts from pallets, cases, or layers back to units.
            This enables accurate stock reconciliation against your unit-based stock on hand.
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Bulk Upload</h3>
              <p className="text-sm text-gray-600">
                Download the Excel template, populate your pallet configurations, and upload the completed file (Excel or CSV).
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <button
                onClick={downloadTemplate}
                className="flex-1 sm:flex-none bg-gray-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-700 transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Excel Template
              </button>
              <div className="relative flex-1 sm:flex-none">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv,.txt"
                  onChange={handleBulkUpload}
                  disabled={uploading}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  <Upload className="w-5 h-5" />
                  {uploading ? 'Uploading...' : 'Upload File'}
                </button>
              </div>
            </div>
          </div>

          {uploadResult && (
            <div className="mt-4 space-y-4">
              <div className={`border rounded-lg p-4 ${
                uploadResult.failed === 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  {uploadResult.failed === 0 ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                  )}
                  <h4 className="font-semibold text-gray-800">Bulk upload summary</h4>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xl font-bold text-gray-800">{uploadResult.total}</p>
                    <p className="text-xs text-gray-600">Total</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-green-600">{uploadResult.success}</p>
                    <p className="text-xs text-gray-600">Success</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-red-600">{uploadResult.failed}</p>
                    <p className="text-xs text-gray-600">Failed</p>
                  </div>
                </div>
              </div>

              {uploadResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h5 className="font-semibold text-red-900 mb-2">Errors</h5>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {uploadResult.errors.map((error, idx) => (
                      <div key={idx} className="text-sm text-red-800">
                        <strong>Row {error.row}:</strong> {error.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {editingConfig && (
          <div className="bg-gray-50 border-2 border-blue-300 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {editingConfig.id ? 'Edit Configuration' : 'New Configuration'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={editingConfig.product_name || ''}
                  onChange={(e) => setEditingConfig({ ...editingConfig, product_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter product name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Barcode *
                </label>
                <input
                  type="text"
                  value={editingConfig.barcode || ''}
                  onChange={(e) => setEditingConfig({ ...editingConfig, barcode: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter barcode"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Units per Case *
                </label>
                <input
                  type="number"
                  min="0"
                  value={editingConfig.units_per_case || ''}
                  onChange={(e) => setEditingConfig({ ...editingConfig, units_per_case: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., 24"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cases per Layer *
                </label>
                <input
                  type="number"
                  min="0"
                  value={editingConfig.cases_per_layer || ''}
                  onChange={(e) => setEditingConfig({ ...editingConfig, cases_per_layer: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., 10"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Layers per Pallet *
                </label>
                <input
                  type="number"
                  min="0"
                  value={editingConfig.layers_per_pallet || ''}
                  onChange={(e) => setEditingConfig({ ...editingConfig, layers_per_pallet: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., 5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Units per Pallet (Calculated)
                </label>
                <div className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 font-semibold">
                  {calculateUnitsPerPallet(editingConfig).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={saveConfig}
                disabled={saving || !editingConfig.product_name || !editingConfig.barcode}
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
              <button
                onClick={() => setEditingConfig(null)}
                className="bg-gray-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-600 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading configurations...</div>
        ) : configs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No pallet configurations yet. Click "New Configuration" to add one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Product</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Barcode</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Units/Case</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Cases/Layer</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Layers/Pallet</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Units/Pallet</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => (
                  <tr key={config.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-800">{config.product_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">{config.barcode}</td>
                    <td className="px-4 py-3 text-sm text-center text-gray-800">{config.units_per_case}</td>
                    <td className="px-4 py-3 text-sm text-center text-gray-800">{config.cases_per_layer}</td>
                    <td className="px-4 py-3 text-sm text-center text-gray-800">{config.layers_per_pallet}</td>
                    <td className="px-4 py-3 text-sm text-center font-semibold text-gray-800">
                      {config.units_per_pallet.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setEditingConfig(config)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteConfig(config.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
