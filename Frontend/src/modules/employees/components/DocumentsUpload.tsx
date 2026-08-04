// ============================================================================
// Document attachments — deliberately session-only.
//
// There is no document-storage endpoint on the backend, and inventing one
// client-side would be worse than not having it: files would appear to be saved
// and vanish on reload with no indication why. So this component holds files in
// component state, says so plainly in the UI, and keeps the shape an upload API
// would need (category + file) so wiring one up later is a change of one
// function, not a redesign.
//
// When the API lands, `onUpload` is the seam: pass an uploader and the notice
// can be dropped.
// ============================================================================

import { useRef } from "react";
import { FileText, Info, Paperclip, Trash2 } from "lucide-react";

/** The categories the spec calls for. */
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

/** 10 MB — a sane ceiling for a PDF or scan held in memory. */
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

type DocumentsUploadProps = {
  value: SessionDocument[];
  onChange: (next: SessionDocument[]) => void;
  disabled?: boolean;
};

export default function DocumentsUpload({
  value,
  onChange,
  disabled = false,
}: DocumentsUploadProps) {
  // One hidden input per category, so the chosen file already knows what it is
  // without a second "which kind?" prompt.
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const add = (category: DocumentCategory, files: FileList | null) => {
    if (!files?.length) return;

    const accepted: SessionDocument[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_DOCUMENT_BYTES) continue;
      accepted.push({
        // crypto.randomUUID is available in every browser this app targets and
        // avoids a counter that would collide across re-mounts.
        id: crypto.randomUUID(),
        category,
        file,
      });
    }

    if (accepted.length) onChange([...value, ...accepted]);
  };

  const remove = (id: string) => onChange(value.filter((doc) => doc.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p className="text-sm">
          Stored for this session only. Document storage API is not implemented
          yet.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {DOCUMENT_CATEGORIES.map((category) => {
          const items = value.filter((doc) => doc.category === category);

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
                className="hidden"
                onChange={(e) => {
                  add(category, e.target.files);
                  e.target.value = "";
                }}
              />

              {items.length === 0 ? (
                <p className="mt-2 text-xs text-gray-400">No files attached.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {items.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5"
                    >
                      <FileText size={14} className="shrink-0 text-gray-400" />
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
        Up to {formatSize(MAX_DOCUMENT_BYTES)} per file. Larger files are skipped.
      </p>
    </div>
  );
}
