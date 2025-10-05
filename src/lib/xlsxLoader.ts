let xlsxPromise: Promise<any> | null = null;

export async function loadXLSX(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('XLSX can only be loaded in the browser environment.');
  }

  if (window.XLSX) {
    return window.XLSX;
  }

  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.async = true;
      script.onload = () => {
        if (window.XLSX) {
          resolve(window.XLSX);
        } else {
          reject(new Error('Failed to load XLSX library.'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load XLSX library.'));
      document.head.appendChild(script);
    });
  }

  return xlsxPromise;
}

declare global {
  interface Window {
    XLSX: any;
  }
}
