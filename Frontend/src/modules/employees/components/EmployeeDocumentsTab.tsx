// ============================================================================
// Read-only documents view for the employee detail page.
//
// The edit form's DocumentsUpload owns attaching and deleting; this tab is the
// view side of the same store — it lists what is on file, grouped by category,
// with an in-app preview and a download link for each one. The bytes are served
// statically at /uploads/employee-documents/<stored_name> (see documentUrl), so
// a plain anchor is all a download needs, and an <img>/<iframe> is all a
// preview needs.
//
// It is also where certificates are *issued* from, not just stored: the
// "Generate certificate" action builds a completion / experience / employment
// certificate PDF from the employee's own record (see utils/certificatePdf.ts),
// so HR doesn't retype details the system already holds.
// ============================================================================

import { useEffect, useState } from "react";
import {
  Award,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
} from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/dialogs/Modal";
import { PrimaryButton } from "@/components/forms/FormField";
import { API_BASE_URL } from "@/lib/apiClient";
import { useBranding } from "@/app/providers/BrandingContext";
import { useToast } from "@/app/providers/ToastContext";
import { Can } from "@/components/permission/Can";
import { employeeService } from "@/modules/employees/api/employeeService";
import {
  documentUrl,
  fullName,
  type Employee,
  type EmployeeDocument,
} from "@/modules/employees/types/employee.types";
import { DOCUMENT_CATEGORIES } from "@/modules/employees/components/DocumentsUpload";
import {
  buildCertificateInput,
  CERTIFICATE_TYPES,
  downloadCertificatePdf,
  formatCertificateDate,
  type CertificateType,
} from "@/modules/employees/utils/certificatePdf";

/** Today as `yyyy-mm-dd`, for seeding the completion-date input. */
const todayValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Only images and PDFs render inline — a browser given anything else (a .docx,
 * a .zip) either downloads it or shows a blank frame, so those keep the
 * download-only treatment.
 */
function previewKind(mime: string): "image" | "pdf" | null {
  if (mime?.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  return null;
}

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
  const { branding } = useBranding();

  const [docs, setDocs] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<EmployeeDocument | null>(null);

  // ---- certificate generation ---------------------------------------------
  // The record is fetched lazily, when the dialog is first opened, because the
  // tab otherwise has no use for it — every certificate field comes from here.
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [certOpen, setCertOpen] = useState(false);
  const [certLoading, setCertLoading] = useState(false);
  const [certType, setCertType] = useState<CertificateType>("completion");
  const [certEndDate, setCertEndDate] = useState(todayValue());
  const [certRemarks, setCertRemarks] = useState("");
  const [generating, setGenerating] = useState(false);

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

  const openCertificate = async () => {
    setCertOpen(true);
    setCertType("completion");
    setCertEndDate(todayValue());
    setCertRemarks("");
    if (employee) return;
    setCertLoading(true);
    try {
      setEmployee(await employeeService.get(employeeId));
    } catch (err) {
      toast.showError(
        err instanceof Error ? err.message : "Couldn't load the employee's details.",
      );
      setCertOpen(false);
    } finally {
      setCertLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!employee) return;
    setGenerating(true);
    try {
      const input = buildCertificateInput(employee, branding, certType, {
        endDate: certEndDate,
        remarks: certRemarks,
      });
      await downloadCertificatePdf(input, branding, `${input.referenceNo}.pdf`);
      toast.showSuccess(`${CERTIFICATE_TYPES[certType].label} generated.`);
      setCertOpen(false);
    } catch {
      toast.showError("Couldn't generate the certificate.", "Please try again.");
    } finally {
      setGenerating(false);
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

  const categories = orderedCategories(docs);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {docs.length === 0
            ? "No documents on file"
            : `${docs.length} document${docs.length === 1 ? "" : "s"} on file`}
          {employeeCode ? ` for ${employeeCode}` : ""}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void openCertificate()}
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            <Award size={14} /> Generate certificate
          </button>
          <Can permission="employees.documents.view">
            <button
              type="button"
              onClick={() => void handleExportAll()}
              disabled={exporting || docs.length === 0}
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
      </div>

      {docs.length === 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <EmptyState
            icon={FolderOpen}
            title="No documents on file"
            description="ID proofs, certificates and contracts uploaded for this employee will appear here. Certificates issued from this page download straight to your device."
          />
        </div>
      )}

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
                const kind = previewKind(doc.mime_type);
                return (
                  <li
                    key={doc.document_id}
                    className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3"
                  >
                    {kind === "image" && href ? (
                      <button
                        type="button"
                        onClick={() => setPreview(doc)}
                        aria-label={`Preview ${doc.original_name}`}
                        className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-gray-100 transition hover:ring-brand"
                      >
                        <img
                          src={href}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-400 ring-1 ring-gray-100">
                        <FileText size={16} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">
                        {doc.original_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatSize(doc.size_bytes)} · Uploaded{" "}
                        {formatDate(doc.uploaded_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {kind && href && (
                        <button
                          type="button"
                          onClick={() => setPreview(doc)}
                          className="flex min-h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          <Eye size={14} /> Preview
                        </button>
                      )}
                      {href && (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          // `download` asks the browser to save rather than
                          // navigate, and names the file what the uploader
                          // called it instead of the UUID on disk.
                          download={doc.original_name}
                          className="flex min-h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          <Download size={14} /> Download
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <Modal
        open={!!preview}
        title={preview?.original_name ?? "Document"}
        description={
          preview
            ? `${preview.category} · ${formatSize(preview.size_bytes)} · Uploaded ${formatDate(preview.uploaded_at)}`
            : undefined
        }
        onClose={() => setPreview(null)}
        maxWidth="max-w-4xl"
      >
        {preview &&
          (() => {
            const href = documentUrl(preview.stored_name, API_BASE_URL);
            const kind = previewKind(preview.mime_type);
            if (!href) return null;
            return (
              <div className="space-y-4">
                {kind === "image" ? (
                  <img
                    src={href}
                    alt={preview.original_name}
                    className="mx-auto max-h-[65vh] w-auto rounded-xl object-contain"
                  />
                ) : (
                  // An <iframe> hands the PDF to the browser's own viewer,
                  // which every target browser ships — no PDF.js dependency.
                  <iframe
                    src={href}
                    title={preview.original_name}
                    className="h-[65vh] w-full rounded-xl border border-gray-100"
                  />
                )}
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  download={preview.original_name}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-gray-200 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  <Download size={15} /> Download original
                </a>
              </div>
            );
          })()}
      </Modal>

      <Modal
        open={certOpen}
        title="Generate certificate"
        description="Details are read from the employee's record — you only fill in what the system doesn't already hold."
        onClose={() => setCertOpen(false)}
        maxWidth="max-w-lg"
      >
        {certLoading || !employee ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Certificate type
              </span>
              <select
                value={certType}
                onChange={(e) => setCertType(e.target.value as CertificateType)}
                className="min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                {Object.entries(CERTIFICATE_TYPES).map(([value, def]) => (
                  <option key={value} value={value}>
                    {def.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Shown, not hidden: HR can see exactly what will be printed
                before committing, and spot a stale designation or a missing
                joining date here rather than on a signed certificate. */}
            <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Fetched from the employee record
              </p>
              <dl className="grid grid-cols-1 gap-2 text-sm xs:grid-cols-2">
                {[
                  ["Name", fullName(employee)],
                  ["Employee ID", employee.employee_code],
                  ["Designation", employee.designation?.title],
                  ["Department", employee.department?.department_name],
                  ["Date of joining", formatCertificateDate(employee.joining_date)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="font-medium text-gray-900">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {CERTIFICATE_TYPES[certType].needsEndDate && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  {certType === "completion" ? "Completion date" : "Last working day"}
                </span>
                <input
                  type="date"
                  value={certEndDate}
                  onChange={(e) => setCertEndDate(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Remarks <span className="font-normal text-gray-400">(optional)</span>
              </span>
              <textarea
                value={certRemarks}
                onChange={(e) => setCertRemarks(e.target.value)}
                rows={3}
                placeholder="Anything to add above the signature — a commendation, a project name, a note of thanks."
                className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>

            <PrimaryButton onClick={() => void handleGenerate()} loading={generating}>
              Download certificate
            </PrimaryButton>
          </div>
        )}
      </Modal>
    </div>
  );
}
