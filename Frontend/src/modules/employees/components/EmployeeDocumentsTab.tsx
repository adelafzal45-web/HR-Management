// ============================================================================
// Read-only documents view for the employee detail page.
//
// The edit form's DocumentsUpload owns attaching and deleting; this tab is the
// view side of the same store — it lists what is on file, grouped by category,
// with a link to open or download each one. The bytes are served statically at
// /uploads/employee-documents/<stored_name> (see documentUrl), so a plain
// anchor is all a download needs.
// ============================================================================

import { useEffect, useState } from "react";
import { Download, FileText, FolderOpen, Loader2 } from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import { API_BASE_URL } from "@/lib/apiClient";
import { useToast } from "@/app/providers/ToastContext";
import { Can } from "@/components/permission/Can";
import { employeeService } from "@/modules/employees/api/employeeService";
import {
  documentUrl,
  type EmployeeDocument,
} from "@/modules/employees/types/employee.types";
import { DOCUMENT_CATEGORIES } from "@/modules/employees/components/DocumentsUpload";

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Categories in the fixed catalog order, with anything the backend returns under
 * an unrecognised label appended after — so a legacy category still shows rather
 * than silently vanishing.
 */
function orderedCategories(docs: EmployeeDocument[]): string[] {
  const extras = docs
    .map((d) => d.category)
    .filter((c) => !DOCUMENT_CATEGORIES.includes(c as never));
  return [...DOCUMENT_CATEGORIES, ...Array.from(new Set(extras))];
}

export default function EmployeeDocumentsTab({
  employeeId,
  employeeCode,
}: {
  employeeId: string;
  /** Used to name the "export all" archive; falls back to the id when absent. */
  employeeCode?: string;
}) {
  const toast = useToast();

  const [docs, setDocs] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    employeeService
      .listDocuments(employeeId)
      .then((res) => {
        if (alive) setDocs(res);
      })
      .catch((err) => {
        if (!alive) return;
        setDocs([]);
        toast.showError(
          err instanceof Error ? err.message : "Couldn't load documents.",
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const handleExportAll = async () => {
    setExporting(true);
    try {
      await employeeService.exportDocuments([employeeId]);
    } catch (err) {
      toast.showError(
        err instanceof Error ? err.message : "Couldn't export the documents.",
      );
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <EmptyState
          icon={FolderOpen}
          title="No documents on file"
          description="ID proofs, certificates and contracts uploaded for this employee will appear here."
        />
      </div>
    );
  }

  const categories = orderedCategories(docs);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {docs.length} document{docs.length === 1 ? "" : "s"} on file
          {employeeCode ? ` for ${employeeCode}` : ""}.
        </p>
        <Can permission="employees.documents.view">
          <button
            type="button"
            onClick={() => void handleExportAll()}
            disabled={exporting}
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {exporting ? "Preparing…" : "Download all"}
          </button>
        </Can>
      </div>

      {categories.map((category) => {
        const inCategory = docs.filter((d) => d.category === category);
        if (inCategory.length === 0) return null;

        return (
          <div
            key={category}
            className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
          >
            <h3 className="mb-4 text-sm font-semibold text-gray-900">
              {category}
              <span className="ml-2 text-xs font-normal text-gray-400">
                {inCategory.length}
              </span>
            </h3>
            <ul className="space-y-2">
              {inCategory.map((doc) => {
                const href = documentUrl(doc.stored_name, API_BASE_URL);
                return (
                  <li
                    key={doc.document_id}
                    className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-400 ring-1 ring-gray-100">
                      <FileText size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">
                        {doc.original_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatSize(doc.size_bytes)} · Uploaded{" "}
                        {formatDate(doc.uploaded_at)}
                      </p>
                    </div>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        // `download` asks the browser to save rather than
                        // navigate, and names the file what the uploader called
                        // it instead of the UUID on disk.
                        download={doc.original_name}
                        className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        <Download size={14} /> Download
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
