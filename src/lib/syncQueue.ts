interface ImageFileMetadata {
  name: string;
  type: string;
  lastModified?: number;
}

interface SerializedQueuedEntry {
  id: string;
  imageDataUrl: string;
  imageFileMetadata: ImageFileMetadata;
  extractedData: {
    product_name: string;
    barcode: string;
    lot_number: string;
    pack_size: string;
  };
  quantity: number;
  unitType: 'pallet' | 'case' | 'layer';
  branch: string;
  location: string;
  expiryDate: string | null;
  timestamp: number;
}

export interface QueuedEntry extends SerializedQueuedEntry {
  imageFile: File | Blob | null;
}

export type QueueEntryInput = {
  imageFile: File;
  imageDataUrl: string;
  extractedData: SerializedQueuedEntry['extractedData'];
  quantity: number;
  unitType: SerializedQueuedEntry['unitType'];
  branch: string;
  location: string;
  expiryDate: SerializedQueuedEntry['expiryDate'];
};

const QUEUE_KEY = 'stocktake_sync_queue';

export function addToQueue(entry: QueueEntryInput): string {
  const queue = getStoredQueue();
  const id = crypto.randomUUID();
  const serializedEntry: SerializedQueuedEntry = {
    id,
    imageDataUrl: entry.imageDataUrl,
    imageFileMetadata: {
      name: entry.imageFile.name,
      type: entry.imageFile.type || 'application/octet-stream',
      lastModified: entry.imageFile.lastModified
    },
    extractedData: entry.extractedData,
    quantity: entry.quantity,
    unitType: entry.unitType,
    branch: entry.branch,
    location: entry.location,
    expiryDate: entry.expiryDate ?? null,
    timestamp: Date.now()
  };

  queue.push(serializedEntry);
  saveQueue(queue);

  return id;
}

export function getQueue(): QueuedEntry[] {
  const queue = getStoredQueue();
  return queue.map(hydrateQueueEntry);
}

export function removeFromQueue(id: string): void {
  const queue = getStoredQueue().filter(entry => entry.id !== id);
  saveQueue(queue);
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

export function getQueueCount(): number {
  return getStoredQueue().length;
}

export function rebuildFileFromDataUrl(
  imageDataUrl: string,
  metadata: ImageFileMetadata
): File | Blob | null {
  try {
    const blob = dataUrlToBlob(imageDataUrl, metadata.type);

    if (typeof File !== 'undefined') {
      return new File([blob], metadata.name, {
        type: metadata.type,
        lastModified: metadata.lastModified ?? Date.now()
      });
    }

    return blob;
  } catch (error) {
    console.error('Failed to rebuild file from data URL:', error);
    return null;
  }
}

function hydrateQueueEntry(entry: SerializedQueuedEntry): QueuedEntry {
  const imageFile = rebuildFileFromDataUrl(entry.imageDataUrl, entry.imageFileMetadata);
  return {
    ...entry,
    imageFile
  };
}

function getStoredQueue(): SerializedQueuedEntry[] {
  try {
    const data = localStorage.getItem(QUEUE_KEY);
    if (!data) {
      return [];
    }

    const parsed = JSON.parse(data) as SerializedQueuedEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse stored queue:', error);
    return [];
  }
}

function saveQueue(queue: SerializedQueuedEntry[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to save queue:', error);
  }
}

function dataUrlToBlob(dataUrl: string, fallbackType?: string): Blob {
  const [header, data] = dataUrl.split(',');
  if (!header || !data) {
    throw new Error('Invalid data URL');
  }

  const isBase64 = header.includes('base64');
  const mimeMatch = header.match(/data:(.*?)(;|,)/);
  const mimeType = mimeMatch?.[1] || fallbackType || 'application/octet-stream';

  const binaryString = isBase64 ? atob(data) : decodeURIComponent(data);
  const byteArray = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    byteArray[i] = binaryString.charCodeAt(i);
  }

  return new Blob([byteArray], { type: mimeType });
}
