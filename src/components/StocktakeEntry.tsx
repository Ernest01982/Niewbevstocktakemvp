import { useState, useRef } from 'react';
import { Camera, Upload, Loader2, CheckCircle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface ExtractedData {
  product_name: string;
  barcode: string;
  lot_number: string;
  pack_size: string;
  mock?: boolean;
  message?: string;
}

interface ProductData {
  product_name: string;
  barcode: string;
  lot_number: string;
  pack_size: string;
}

function createEmptyProductData(): ProductData {
  return {
    product_name: '',
    barcode: '',
    lot_number: '',
    pack_size: '',
  };
}

export default function StocktakeEntry() {
  const { user } = useAuth();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [extractionInfo, setExtractionInfo] = useState<{ mock?: boolean; message?: string } | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unitType, setUnitType] = useState<'pallet' | 'case' | 'layer'>('case');
  const [branch, setBranch] = useState('');
  const [location, setLocation] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function updateProductData(field: keyof ProductData, value: string) {
    setProductData((prev) => {
      const base = prev ?? createEmptyProductData();
      return { ...base, [field]: value };
    });
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setProductData(createEmptyProductData());
      setExtractionInfo(null);
      setExtractionError(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setImagePreview(result);
        handleExtract(result);
      };
      reader.readAsDataURL(file);
      setSuccess(false);
      setError('');
    }
  }

  async function handleExtract(imageData?: string) {
    const dataToUse = imageData || imagePreview;
    if (!dataToUse) return;

    setExtracting(true);
    setExtractionError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-product-info`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_base64: dataToUse })
      });

      if (!response.ok) {
        throw new Error('Failed to extract product information');
      }

      const data: ExtractedData = await response.json();
      setProductData({
        product_name: data.product_name || '',
        barcode: data.barcode || '',
        lot_number: data.lot_number || '',
        pack_size: data.pack_size || '',
      });
      setExtractionInfo({ mock: data.mock, message: data.message });
    } catch (err) {
      setExtractionError(err instanceof Error ? err.message : 'Failed to extract data');
    } finally {
      setExtracting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageFile || !user) return;

    setUploading(true);
    setError('');

    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('stocktake-images')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('stocktake-images')
        .getPublicUrl(fileName);

      let productId = null;
      if (productData?.barcode) {
        const { data: product } = await supabase
          .from('products')
          .select('id')
          .eq('barcode', productData.barcode)
          .maybeSingle();

        productId = product?.id || null;
      }

      const { error: insertError } = await supabase
        .from('stocktake_entries')
        .insert({
          user_id: user.id,
          product_id: productId,
          image_url: publicUrl,
          extracted_product_name: productData?.product_name || null,
          extracted_barcode: productData?.barcode || null,
          extracted_lot_number: productData?.lot_number || null,
          extracted_pack_size: productData?.pack_size || null,
          actual_quantity: parseInt(quantity, 10),
          unit_type: unitType,
          branch: branch,
          location: location,
          expiry_date: expiryDate || null,
          synced: true
        });

      if (insertError) throw insertError;

      setSuccess(true);
      setTimeout(() => {
        resetForm();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry');
    } finally {
      setUploading(false);
    }
  }

  function resetForm() {
    setImagePreview(null);
    setImageFile(null);
    setProductData(null);
    setExtractionInfo(null);
    setExtractionError(null);
    setQuantity('');
    setUnitType('case');
    setBranch('');
    setLocation('');
    setExpiryDate('');
    setSuccess(false);
    setError('');
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">New Stocktake Entry</h2>

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center">
            <CheckCircle className="w-5 h-5 mr-2" />
            Entry saved successfully!
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {!imagePreview ? (
          <div className="space-y-4">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full bg-blue-600 text-white py-4 rounded-lg font-medium hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
            >
              <Camera className="w-5 h-5" />
              Take Photo
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-gray-600 text-white py-4 rounded-lg font-medium hover:bg-gray-700 transition-all flex items-center justify-center gap-2"
            >
              <Upload className="w-5 h-5" />
              Upload Photo
            </button>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <img
                src={imagePreview}
                alt="Product preview"
                className="w-full h-64 object-contain bg-gray-100 rounded-lg"
              />
              <button
                type="button"
                onClick={resetForm}
                className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full hover:bg-red-700 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {extracting && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Extracting product information...
              </div>
            )}

            {extractionInfo?.mock && extractionInfo.message && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
                {extractionInfo.message}
              </div>
            )}

            {extractionError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">We couldn't extract product details automatically.</p>
                  <p className="text-sm">{extractionError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleExtract()}
                  disabled={extracting}
                  className="inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Retry extraction
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Name
                </label>
                <input
                  type="text"
                  value={productData?.product_name ?? ''}
                  onChange={(e) => updateProductData('product_name', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Barcode
                </label>
                <input
                  type="text"
                  value={productData?.barcode ?? ''}
                  onChange={(e) => updateProductData('barcode', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lot Number
                </label>
                <input
                  type="text"
                  value={productData?.lot_number ?? ''}
                  onChange={(e) => updateProductData('lot_number', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pack Size
                </label>
                <input
                  type="text"
                  value={productData?.pack_size ?? ''}
                  onChange={(e) => updateProductData('pack_size', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Branch *
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Main Warehouse"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location *
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., A-01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity *
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter quantity"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Unit Type *
                </label>
                <select
                  value={unitType}
                  onChange={(e) => setUnitType(e.target.value as 'pallet' | 'case' | 'layer')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="pallet">Pallet</option>
                  <option value="case">Case</option>
                  <option value="layer">Layer</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={uploading || !quantity || !branch || !location}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Entry'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
