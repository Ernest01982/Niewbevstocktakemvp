type ArrayOfArrays = Array<Array<string | number>>;

interface XLSXUtils {
  aoa_to_sheet(data: ArrayOfArrays): unknown;
  book_new(): unknown;
  book_append_sheet(workbook: unknown, worksheet: unknown, sheetName: string): void;
  sheet_to_json(
    sheet: unknown,
    options: { header: 1; raw: false }
  ): Array<Array<string | number | undefined>>;
}

interface XLSXModule {
  utils: XLSXUtils;
  read(data: ArrayBuffer, options: { type: 'array' | string }): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  writeFile(workbook: unknown, filename: string): void;
}

let xlsxPromise: Promise<XLSXModule> | null = null;

export async function loadXLSX(): Promise<XLSXModule> {
  if (typeof window === 'undefined') {
    throw new Error('XLSX can only be loaded in the browser environment.');
  }

  if (window.XLSX) {
    return window.XLSX;
  }

  if (!xlsxPromise) {
    xlsxPromise = new Promise<XLSXModule>((resolve, reject) => {
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
    XLSX?: XLSXModule;
  }
}
