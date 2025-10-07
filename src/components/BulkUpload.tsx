import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase, ProductImportRow } from '../lib/supabase';
import { loadXLSX } from '../lib/xlsxLoader';

export default function BulkUpload() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    total: number;
    success: number;
    failed: number;
    skipped: number;
    errors: Array<{ row: number; error: string }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function downloadTemplate() {
    try {
      const XLSX = await loadXLSX();
      const headers = [
        'Product Number',
        'Product Description',
        'Lot',
        'Expiry Date',
        'Branch',
        'Location',
        'Stock on Hand',
        'Allocated Stock',
        'Available Stock'
      ];

      const sampleData = [
        ['1234567890123', 'Premium Coffee Beans', 'LOT2024001', '2025-12-31', 'Main Warehouse', 'A-01', '100', '10', '90'],
        ['9876543210987', 'Organic Tea Leaves', 'LOT2024002', '2025-11-30', 'Main Warehouse', 'A-02', '150', '20', '130']
      ];

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Stocktake');
      XLSX.writeFile(workbook, 'stocktake_template.xlsx');
    } catch (error) {
      console.error('Template download error:', error);
      alert('Failed to generate Excel template.');
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setResult(null);

    try {
      const { headers, rows, rowNumbers } = await parseDataFile(file);

      const uploadRecord = {
        user_id: user.id,
        filename: file.name,
        records_total: rows.length,
        records_success: 0,
        records_failed: 0,
        status: 'processing' as const,
        error_log: []
      };

      const { data: upload, error: uploadError } = await supabase
        .from('bulk_uploads')
        .insert(uploadRecord)
        .select()
        .single();

      if (uploadError) throw uploadError;

      let successCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const errors: Array<{ row: number; error: string }> = [];

      const { data: existingProducts, error: existingProductsError } = await supabase
        .from('products')
        .select('barcode');

      if (existingProductsError) throw existingProductsError;
      const existingBarcodes = new Set(existingProducts.map(p => p.barcode));

      for (let i = 0; i < rows.length; i++) {
        const values = rows[i];
        const rowNum = rowNumbers[i] ?? i + 2;

        try {
          const product = parseProductRow(headers, values);

          if (existingBarcodes.has(product.product_number)) {
            skippedCount++;
            continue;
          }

          const { error: insertError } = await supabase
            .from('products')
            .insert({
              barcode: product.product_number,
              product_name: product.product_description,
              lot: product.lot,
              expiry_date: product.expiry_date || null,
              branch: product.branch,
              location: product.location,
              stock_on_hand: product.stock_on_hand,
              allocated_stock: product.allocated_stock,
              available_stock: product.available_stock,
              pack_size: '',
              expected_quantity: product.stock_on_hand,
              unit_type: 'case' as const
            });

          if (insertError) throw insertError;
          successCount++;
        } catch (error) {
          failedCount++;
          errors.push({
            row: rowNum,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      await supabase
        .from('bulk_uploads')
        .update({
          records_success: successCount,
          records_failed: failedCount,
          skipped_rows: skippedCount,
          status: failedCount === 0 ? 'completed' : 'failed',
          error_log: errors
        })
        .eq('id', upload.id);

      setResult({
        total: rows.length,
        success: successCount,
        failed: failedCount,
        skipped: skippedCount,
        errors
      });
    } catch (error) {
      console.error('Upload error:', error);
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

  function parseProductRow(headers: string[], values: string[]): ProductImportRow {
    const getIndex = (name: string) => headers.findIndex(h =>
      h.includes(name.toLowerCase())
    );

    return {
      product_number: values[getIndex('product number')] || values[getIndex('number')] || '',
      product_description: values[getIndex('description')] || '',
      lot: values[getIndex('lot')] || '',
      expiry_date: values[getIndex('expiry')] || '',
      branch: values[getIndex('branch')] || '',
      location: values[getIndex('location')] || '',
      stock_on_hand: parseInt(values[getIndex('stock on hand')] || values[getIndex('on hand')] || '0'),
      allocated_stock: parseInt(values[getIndex('allocated')] || '0'),
      available_stock: parseInt(values[getIndex('available')] || '0')
    };
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <FileSpreadsheet className="w-7 h-7" />
          Bulk Upload Products
        </h2>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">Excel or CSV Format</h3>
          <p className="text-sm text-blue-800 mb-3">
            Upload an Excel (.xlsx) or CSV file with the following columns:
          </p>
          <ul className="text-sm text-blue-800 space-y-1 ml-4">
            <li>• Product Number (Barcode/SKU)</li>
            <li>• Product Description</li>
            <li>• Lot</li>
            <li>• Expiry Date (YYYY-MM-DD)</li>
            <li>• Branch</li>
            <li>• Location</li>
            <li>• Stock on Hand</li>
            <li>• Allocated Stock</li>
            <li>• Available Stock</li>
          </ul>
        </div>

        <div className="space-y-4">
          <button
            onClick={downloadTemplate}
            className="w-full bg-gray-600 text-white py-3 rounded-lg font-medium hover:bg-gray-700 transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" />
            Download Excel Template
          </button>

          <div className="relative">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,.txt"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full bg-blue-600 text-white py-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              <Upload className="w-5 h-5" />
              {uploading ? 'Processing...' : 'Upload File (.xlsx or .csv)'}
            </button>
          </div>
        </div>

        {result && (
          <div className="mt-6 space-y-4">
            <div className={`border rounded-lg p-4 ${
              result.failed === 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                {result.failed === 0 ? (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                )}
                <h3 className="font-semibold text-gray-800">Upload Complete</h3>
              </div>

              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-gray-800">{result.total}</p>
                  <p className="text-sm text-gray-600">Total</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{result.success}</p>
                  <p className="text-sm text-gray-600">Success</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{result.skipped}</p>
                  <p className="text-sm text-gray-600">Skipped</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{result.failed}</p>
                  <p className="text-sm text-gray-600">Failed</p>
                </div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-red-900 mb-2">Errors</h4>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {result.errors.map((error, idx) => (
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
    </div>
  );
}
