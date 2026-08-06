// ============================================================================
// Document attachments.
//
// Two lists live side by side per category: documents already stored on the
// backend (`stored`, fetched by the parent) and files picked in this session
// that have not been sent yet (`value`). Pending files upload when the employee
// is saved — on create there is no employee id to attach them to until then, so
// deferring is the only correct order, and doing the same on edit keeps one
// code path instead of two.
//
// Deleting a stored document goes straight to the backend; there is nothing to
// defer, and pretending otherwise would leave the list lying until save.
// ============================================================================

import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Trash2, UploadCloud } from "lucide-react";

/** The categories the spec calls for. Must match DOCUMENT_CATEGORIES on the backend. */
export const DOCUMENT_CATEGORIES = [
  "ID Proof",
  "Certificates",
  "Contracts",
  "Other Documents",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export type SessionDocument = {
  /** Stable key for list rendering — index would break on removal. */
  id: string;
  category: DocumentCategory;
  file: File;
};

/** The subset of the stored-document record this component renders. */
export type StoredDocument = {
  document_id: string;
  category: string;
  original_name: string;
  size_bytes: number;
};

/** 10 MB — matches MAX_DOCUMENT_BYTES in the backend service. */
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

type DocumentsUploadProps = {
  value: SessionDocument[];
  onChange: (next: SessionDocument[]) => void;
  /** Documents already on the backend. Omit on the create form. */
  stored?: StoredDocument[];
  /** Deletes a stored document. Omit to hide the delete control. */
  onDeleteStored?: (documentId: string) => Promise<void>;
  disabled?: boolean;
};

export default function DocumentsUpload({
  value,
  onChange,
  stored = [],
  onDeleteStored,
  disabled = false,
}: DocumentsUploadProps) {
  // One hidden input per category, so the chosen file already knows what it is
  // without a second "which kind?" prompt.
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);

  const add = (category: DocumentCategory, files: FileList | null) => {
    if (!files?.length) return;

    const accepted: SessionDocument[] = [];
    const tooLarge: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_DOCUMENT_BYTES) {
        tooLarge.push(file.name);
        continue;
      }
      accepted.push({
        // crypto.randomUUID is available in every browser this app targets and
        // avoids a counter that would collide across re-mounts.
        id: crypto.randomUUID(),
        category,
        file,
      });
    }

    setRejected(tooLarge);
    if (accepted.length) onChange([...value, ...accepted]);
  };

  const remove = (id: string) => onChange(value.filter((doc) => doc.id !== id));

  const removeStored = async (documentId: string) => {
    if (!onDeleteStored) return;
    setDeleting(documentId);
    try {
      await onDeleteStored(documentId);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 p-3 text-blue-900 ring-1 ring-blue-200">
          <UploadCloud size={16} className="mt-0.5 shrink-0" />
          <p className="text-sm">
            {value.length} file{value.length === 1 ? "" : "s"} will be uploaded
            when you save.
          </p>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          Skipped (over {formatSize(MAX_DOCUMENT_BYTES)}): {rejected.join(", ")}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {DOCUMENT_CATEGORIES.map((category) => {
          const pending = value.filter((doc) => doc.category === category);
          const saved = stored.filter((doc) => doc.category === category);
          const empty = pending.length === 0 && saved.length === 0;

          return (
            <div key={category} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-800">{category}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => inputs.current[category]?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:border-brand/60 hover:bg-brand-light/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Paperclip size={13} />
                  Attach
                </button>
              </div>

              <input
                ref={(el) => {
                  inputs.current[category] = el;
                }}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => {
                  add(category, e.target.files);
                  e.target.value = "";
                }}
              />

              {empty ? (
                <p className="mt-2 text-xs text-gray-400">No files attached.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {saved.map((doc) => (
                    <li
                      key={doc.document_id}
                      className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5"
                    >
                      <FileText size={14} className="shrink-0 text-gray-400" />
                      <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                        {doc.original_name}
                      </span>
                      <span className="shrink-0 text-[11px] text-gray-400">
                        {formatSize(doc.size_bytes)}
                      </span>
                      {onDeleteStored && (
                        <button
                          type="button"
                          disabled={disabled || deleting === doc.document_id}
                          onClick={() => void removeStored(doc.document_id)}
                          aria-label={`Delete ${doc.original_name}`}
                          className="shrink-0 rounded p-0.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed"
                        >
                          {deleting === doc.document_id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      )}
                    </li>
                  ))}

                  {pending.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-2 rounded-lg bg-blue-50/70 px-2.5 py-1.5 ring-1 ring-blue-100"
                    >
                      <UploadCloud size={14} className="shrink-0 text-blue-400" />
                      <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                        {doc.file.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-gray-400">
                        {formatSize(doc.file.size)}
                      </span>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => remove(doc.id)}
                        aria-label={`Remove ${doc.file.name}`}
                        className="shrink-0 rounded p-0.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-500">
        PDF, JPEG, PNG, WebP, Word or Excel. Up to{" "}
        {formatSize(MAX_DOCUMENT_BYTES)} per file.
      </p>
    </div>
  );
}
