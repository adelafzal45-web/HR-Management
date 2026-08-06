import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export type ExportFormat = "csv" | "excel" | "json";

type ExportMenuProps = {
  onExport: (format: ExportFormat, scope: "page" | "all") => void;
  isExporting?: boolean;
  showAllOption?: boolean;
};

/**
 * Export dropdown menu for DataTable.
 * Supports CSV, Excel (if library available), and JSON.
 */
export default function DataTableExport({
  onExport,
  isExporting = false,
  showAllOption = true,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleExport = (format: ExportFormat, scope: "page" | "all") => {
    onExport(format, scope);
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={isExporting}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-brand/60 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download size={15} />
        Export
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="p-2">
            <div className="mb-2 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Current Page
            </div>
            <button
              type="button"
              onClick={() => handleExport("csv", "page")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              <FileText size={16} />
              Export as CSV
            </button>
            <button
              type="button"
              onClick={() => handleExport("excel", "page")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              <FileSpreadsheet size={16} />
              Export as Excel
            </button>
            <button
              type="button"
              onClick={() => handleExport("json", "page")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              <FileText size={16} />
              Export as JSON
            </button>

            {showAllOption && (
              <>
                <div className="my-2 border-t border-gray-100" />
                <div className="mb-2 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  All Records
                </div>
                <button
                  type="button"
                  onClick={() => handleExport("csv", "all")}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <FileText size={16} />
                  Export all as CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("excel", "all")}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <FileSpreadsheet size={16} />
                  Export all as Excel
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("json", "all")}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <FileText size={16} />
                  Export all as JSON
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
