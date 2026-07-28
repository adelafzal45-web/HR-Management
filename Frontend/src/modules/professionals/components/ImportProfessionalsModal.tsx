import { useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, CircleCheck, CircleAlert } from "lucide-react";
import Modal from "@/components/dialogs/Modal";
import { parseCSV } from "@/utils/csv";

export type ImportRow = Record<string, string>;

type Props = {
  open: boolean;
  onClose: () => void;
  onImport: (rows: ImportRow[]) => Promise<{ success: number; failed: number }>;
};

const REQUIRED_HINT = "firstName, lastName, email are required. department, designation, employmentType, phone, salary are optional.";

export default function ImportProfessionalsModal({ open, onClose, onImport }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  const reset = () => {
    setFileName("");
    setRows([]);
    setError(null);
    setResult(null);
  };

  const handleFile = async (file: File) => {
    reset();
    setFileName(file.name);
    try {
      const text = await file.text();
      const table = parseCSV(text);
      if (table.length < 2) {
        setError("This file doesn't have any data rows below the header.");
        return;
      }
      const headers = table[0].map((h) => h.trim());
      const parsed = table.slice(1).map((cells) => {
        const record: ImportRow = {};
        headers.forEach((h, i) => (record[h] = (cells[i] ?? "").trim()));
        return record;
      });
      setRows(parsed);
    } catch {
      setError("Couldn't read that file. Make sure it's a valid CSV.");
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleConfirm = async () => {
    setImporting(true);
    try {
      const res = await onImport(rows);
      setResult(res);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Professionals" description="Upload a CSV to bulk-create professional records." maxWidth="max-w-lg">
      {result ? (
        <div className="space-y-4 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <CircleCheck size={26} />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Imported {result.success} of {result.success + result.failed} rows
            </p>
            {result.failed > 0 && <p className="mt-1 text-sm text-gray-500">{result.failed} row(s) couldn't be imported — check for duplicate emails or missing required fields.</p>}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="min-h-11 w-full rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center transition hover:border-brand/50 hover:bg-brand-light/20"
          >
            <UploadCloud size={26} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">{fileName || "Click to choose a CSV file"}</span>
            <span className="text-xs text-gray-400">{REQUIRED_HINT}</span>
          </button>

          {error && (
            <p className="flex items-center gap-1.5 text-sm text-rose-500">
              <CircleAlert size={14} /> {error}
            </p>
          )}

          {rows.length > 0 && !error && (
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <FileSpreadsheet size={15} className="text-gray-400" /> {rows.length} row(s) ready to import
              </p>
              <div className="max-h-40 overflow-auto rounded-lg bg-white text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400">
                      {Object.keys(rows[0]).slice(0, 4).map((h) => (
                        <th key={h} className="px-2 py-1.5 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 text-gray-600 last:border-0">
                        {Object.keys(rows[0]).slice(0, 4).map((h) => (
                          <td key={h} className="truncate px-2 py-1.5">
                            {r[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2.5 xs:flex-row">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={rows.length === 0 || importing}
              onClick={handleConfirm}
              className="min-h-11 flex-1 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? "Importing…" : `Import ${rows.length || ""} Professional${rows.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
