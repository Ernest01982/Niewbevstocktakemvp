import { useState, useEffect } from 'react';
import { Package, Save, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
