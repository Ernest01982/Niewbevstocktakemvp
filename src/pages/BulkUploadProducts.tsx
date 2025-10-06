import { useState, useEffect, FormEvent } from "react";

import { supabase } from "../lib/supabase";

type BulkUploadLog = {
  id: string;
  filename: string;
  status: string;
  total_rows: number | null;
  inserted_rows: number | null;
  skipped_rows: number | null;
  records_failed: number | null;
  created_at: string;
  finished_at: string | null;
};

type UploadResult = {
  upload_id?: string;
  filename: string;
  total_rows: number;
  inserted_rows: number;
  skipped_rows: number;
  errors?: Array<{ batch: number; message: string }>;
};

export default function BulkUploadProducts() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<BulkUploadLog[]>([]);

  const hasErrors = (result?.errors?.length ?? 0) > 0;
  const errorList = result?.errors ?? [];

  async function loadLogs() {
    const { data } = await supabase
      .from("bulk_uploads")
      .select(
        "id, filename, status, total_rows, inserted_rows, skipped_rows, records_failed, created_at, finished_at"
      )
      .order("created_at", { ascending: false })
      .limit(5);
    setLogs(data || []);
  }

  useEffect(() => {
    loadLogs();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file) return setError("Choose a CSV or XLSX file first.");

    setLoading(true);
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be signed in.");

      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-products`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: fd
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setResult(json);
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Bulk Upload — Products</h1>
      <p className="text-sm opacity-80">
        Upload a CSV or XLSX matching the template. Existing products (by
        <code>stock_code</code>) will be skipped; only new ones are inserted.
      </p>

      <div className="flex gap-3">
        <a
          className="underline text-blue-600"
          href="/products_import_template.csv"
          download
        >
          Download CSV template
        </a>
        <a
          className="underline text-blue-600"
          href="/products_import_template.xlsx"
          download
        >
          Download XLSX template
        </a>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="file"
          accept=".csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full"
        />
        <button
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          disabled={loading || !file}
        >
          {loading ? "Uploading…" : "Upload & Import"}
        </button>
      </form>

      {error && <div className="text-red-600">{error}</div>}

      {result && (
        <div className="p-3 rounded bg-gray-100 space-y-1">
          <div>
            <b>Upload ID:</b> {result.upload_id || "—"}
          </div>
          <div>
            <b>File:</b> {result.filename}
          </div>
          <div>
            <b>Total rows:</b> {result.total_rows}
          </div>
          <div>
            <b>Inserted:</b> {result.inserted_rows}
          </div>
          <div>
            <b>Skipped (existing):</b> {result.skipped_rows}
          </div>
          {hasErrors ? (
            <details className="mt-2">
              <summary className="cursor-pointer">
                <b>Errors</b> ({errorList.length})
              </summary>
              <ul className="list-disc pl-5">
                {errorList.map((e, i) => (
                  <li key={i}>
                    Batch {e.batch}: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <div className="mt-2 text-green-700">No batch errors 🎉</div>
          )}
        </div>
      )}

      {!!logs.length && (
        <div className="p-3 rounded border">
          <div className="font-medium mb-2">Recent Imports</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th>When</th>
                <th>File</th>
                <th>Status</th>
                <th>Total</th>
                <th>Inserted</th>
                <th>Skipped</th>
                <th>Failed</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.filename}</td>
                  <td>{r.status}</td>
                  <td>{r.total_rows ?? "—"}</td>
                  <td>{r.inserted_rows ?? "—"}</td>
                  <td>{r.skipped_rows ?? "—"}</td>
                  <td>{r.records_failed ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
