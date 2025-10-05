interface QueuedEntry {
  id: string;
  imageFile: File;
  imageDataUrl: string;
  extractedData: {
    product_name: string;
    barcode: string;
    lot_number: string;
    pack_size: string;
  };
  quantity: number;
  unitType: 'pallet' | 'case' | 'layer';
  timestamp: number;
}

const QUEUE_KEY = 'stocktake_sync_queue';

export function addToQueue(entry: Omit<QueuedEntry, 'id' | 'timestamp'>): string {
  const queue = getQueue();
  const newEntry: QueuedEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: Date.now()
  };
  queue.push(newEntry);
  saveQueue(queue);
  return newEntry.id;
}

export function getQueue(): QueuedEntry[] {
  try {
    const data = localStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function removeFromQueue(id: string): void {
  const queue = getQueue().filter(entry => entry.id !== id);
  saveQueue(queue);
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

function saveQueue(queue: QueuedEntry[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to save queue:', error);
  }
}

export function getQueueCount(): number {
  return getQueue().length;
}
