import { useState, useEffect } from 'react';
import { Upload, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import {
  getQueue,
  removeFromQueue,
  clearQueue,
  rebuildFileFromDataUrl,
  QueuedEntry,
  QUEUE_UPDATED_EVENT
} from '../lib/syncQueue';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function SyncQueue() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<QueuedEntry[]>(getQueue());
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<Record<string, string>>({});

  useEffect(() => {
    function handleQueueUpdate() {
      setQueue(getQueue());
    }

    handleQueueUpdate();

    window.addEventListener(QUEUE_UPDATED_EVENT, handleQueueUpdate);
    return () => {
      window.removeEventListener(QUEUE_UPDATED_EVENT, handleQueueUpdate);
    };
  }, []);

  async function syncEntry(entry: QueuedEntry) {
    if (!user) return;

    try {
      setSyncProgress(prev => ({ ...prev, [entry.id]: 'uploading' }));

      const uploadSource =
        entry.imageFile ??
        rebuildFileFromDataUrl(entry.imageDataUrl, entry.imageFileMetadata);

      if (!uploadSource) {
        throw new Error('Unable to reconstruct image file for upload');
      }

      const originalName = entry.imageFileMetadata.name || 'image';
      const fileExtFromName = originalName.includes('.')
        ? originalName.split('.').pop()
        : undefined;
      const fileExt = fileExtFromName || entry.imageFileMetadata.type.split('/').pop() || 'bin';
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('stocktake-images')
        .upload(fileName, uploadSource);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('stocktake-images')
        .getPublicUrl(fileName);

      let productId = null;
      if (entry.extractedData.barcode) {
        const { data: product } = await supabase
          .from('products')
          .select('id')
          .eq('barcode', entry.extractedData.barcode)
          .maybeSingle();

        productId = product?.id || null;
      }

      const metadata = entry.metadata ?? {
        branch: '',
        location: '',
        expiryDate: null,
        userId: undefined
      };

      const userIdForInsert = metadata.userId ?? user.id;

      const { error: insertError } = await supabase
        .from('stocktake_entries')
        .insert({
          user_id: userIdForInsert,
          product_id: productId,
          image_url: publicUrl,
          extracted_product_name: entry.extractedData.product_name,
          extracted_barcode: entry.extractedData.barcode,
          extracted_lot_number: entry.extractedData.lot_number,
          extracted_pack_size: entry.extractedData.pack_size,
          actual_quantity: entry.quantity,
          unit_type: entry.unitType,
          branch: metadata.branch || null,
          location: metadata.location || null,
          expiry_date: metadata.expiryDate ?? null,
          synced: true
        });

      if (insertError) throw insertError;

      setSyncProgress(prev => ({ ...prev, [entry.id]: 'success' }));
      removeFromQueue(entry.id);

      setTimeout(() => {
        setSyncProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[entry.id];
          return newProgress;
        });
      }, 2000);
    } catch (error) {
      console.error('Sync error:', error);
      setSyncProgress(prev => ({ ...prev, [entry.id]: 'error' }));
    }
  }

  async function syncAll() {
    setSyncing(true);
    const currentQueue = getQueue();

    for (const entry of currentQueue) {
      await syncEntry(entry);
    }

    setSyncing(false);
    setQueue(getQueue());
  }

  function handleClearQueue() {
    if (confirm('Are you sure you want to clear all pending entries?')) {
      clearQueue();
      setQueue([]);
      setSyncProgress({});
    }
  }

  if (queue.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">All Synced!</h2>
          <p className="text-gray-600">No pending entries to upload</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            Sync Queue ({queue.length})
          </h2>
          <div className="flex gap-2">
            <button
              onClick={syncAll}
              disabled={syncing}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Sync All
                </>
              )}
            </button>
            <button
              onClick={handleClearQueue}
              disabled={syncing}
              className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {queue.map((entry) => (
            <div
              key={entry.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-all"
            >
              <div className="flex items-start gap-4">
                <img
                  src={entry.imageDataUrl}
                  alt="Product"
                  className="w-20 h-20 object-cover rounded-lg"
                />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800">
                    {entry.extractedData.product_name || 'Unknown Product'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Barcode: {entry.extractedData.barcode || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600">
                    Quantity: {entry.quantity} {entry.unitType}
                  </p>
                  {entry.metadata.branch && (
                    <p className="text-sm text-gray-600">
                      Branch: {entry.metadata.branch}
                    </p>
                  )}
                  {entry.metadata.location && (
                    <p className="text-sm text-gray-600">
                      Location: {entry.metadata.location}
                    </p>
                  )}
                  {entry.metadata.expiryDate && (
                    <p className="text-sm text-gray-600">
                      Expiry: {entry.metadata.expiryDate}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Added: {new Date(entry.timestamp).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {syncProgress[entry.id] === 'uploading' && (
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  )}
                  {syncProgress[entry.id] === 'success' && (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  )}
                  {syncProgress[entry.id] === 'error' && (
                    <span className="text-red-600 text-sm">Failed</span>
                  )}
                  {!syncProgress[entry.id] && (
                    <button
                      onClick={() => syncEntry(entry)}
                      disabled={syncing}
                      className="text-blue-600 hover:text-blue-700 disabled:opacity-50"
                    >
                      <Upload className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
