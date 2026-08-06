// ============================================================================
// One export control for every appraisal screen.
//
// Four formats are asked for (Excel / CSV / PDF / Print) but only three code
// paths exist, and pretending otherwise would be a lie in the UI:
//
//   · Excel  — the backend builds a real .xlsx for stats / compare / results and
//              exports *every matching row*, not just the page on screen. When a
//              caller passes `onServerExport` that is used; screens with no
//              server endpoint (the employee's own history) fall back to the
//              client .xls writer.
//   · CSV    — client-side, from the rows the caller hands over.
//   · PDF /
//     Print  — both open the print-formatted document and raise the browser's
//              print dialog, because "Save as PDF" *is* that dialog. They are
//              listed separately because users look for both labels, and the
//              hint under each says which one it lands on.
//
// The server export is the only asynchronous path, so it owns the spinner: a
// stats export over a wide date range takes long enough that a dead button
// reads as a broken one.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Printer } from "lucide-react";

import { downloadCSV, toCSV } from "@/utils/csv";
import { exportExcel, exportPDF, type ExportColumn } from "@/utils/exportUtils";

type ExportMenuProps = {
  /** Document heading and the basis of the download filename. */
  title: string;
  columns: ExportColumn[];
  /** The rows to write. Keys must match `columns[].key`. */
  rows: Array<Record<string, unknown>>;
  /**
   * Server-built .xlsx. Preferred over the client writer when present because
   * it covers the whole result set rather than the current page.
   */
  onServerExport?: () => Promise<void>;
  /** Surfaced when the server export fails — usually a toast. */
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
};

/** `Daily report — March 2026` -> `daily-report-march-2026` */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function ExportMenu({
  title,
  columns,
  rows,
  onServerExport,
  onError,
  disabled = false,
  className = "",
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape. Both listeners are only attached while
  // the menu is open so a page with four export buttons is not running eight
  // permanent document listeners.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const empty = rows.length === 0;
  const filename = slugify(title) || "export";

  const runExcel = async () => {
    setOpen(false);
    if (!onServerExport) {
      exportExcel(filename, columns, rows);
      return;
    }
    setBusy(true);
    try {
      await onServerExport();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "The export could not be generated.");
    } finally {
      setBusy(false);
    }
  };

  const runCsv = () => {
    setOpen(false);
    // toCSV keys off the header strings, so the rows are re-shaped to be keyed
    // by label rather than by field name.
    const headers = columns.map((c) => c.label);
    const shaped = rows.map((row) =>
      Object.fromEntries(columns.map((c) => [c.label, row[c.key]])),
    );
    downloadCSV(`${filename}.csv`, toCSV(headers, shaped));
  };

  const runPrint = () => {
    setOpen(false);
    if (!exportPDF(title, columns, rows)) {
      onError?.("Your browser blocked the print window. Allow pop-ups for this site and retry.");
    }
  };

  const item =
    "flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-9 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-brand/60 hover:bg-brand-light/40 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download size={15} />
        {busy ? "Preparing…" : "Export"}
        <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg"
        >
          <button type="button" role="menuitem" onClick={runExcel} className={item}>
            <Download size={15} className="mt-0.5 shrink-0 text-gray-400" />
            <span>
              Excel
              <span className="block text-xs text-gray-400">
                {onServerExport ? "All matching rows, built server-side" : "Spreadsheet download"}
              </span>
            </span>
          </button>

          <button type="button" role="menuitem" onClick={runCsv} disabled={empty} className={item}>
            <Download size={15} className="mt-0.5 shrink-0 text-gray-400" />
            <span>
              CSV
              <span className="block text-xs text-gray-400">
                {empty ? "Nothing to export" : `${rows.length} row${rows.length === 1 ? "" : "s"} on screen`}
              </span>
            </span>
          </button>

          <button type="button" role="menuitem" onClick={runPrint} disabled={empty} className={item}>
            <Download size={15} className="mt-0.5 shrink-0 text-gray-400" />
            <span>
              PDF
              <span className="block text-xs text-gray-400">Opens the print dialog — Save as PDF</span>
            </span>
          </button>

          {/* Print keeps its own glyph: it is the one item here that does not
              produce a file, and a download arrow on it would be a lie. */}
          <button type="button" role="menuitem" onClick={runPrint} disabled={empty} className={item}>
            <Printer size={15} className="mt-0.5 shrink-0 text-gray-500" />
            <span>
              Print
              <span className="block text-xs text-gray-400">Print-formatted layout</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
