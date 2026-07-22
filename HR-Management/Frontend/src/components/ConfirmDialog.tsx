import { createPortal } from "react-dom";
import type { ReactNode } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
  icon?: ReactNode;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Rendered via a portal straight into document.body so it always covers the
// full viewport, even when triggered from inside a translated/transformed
// ancestor (e.g. the mobile sidebar drawer), which would otherwise break a
// plain `fixed` overlay.
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "brand",
  icon,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const confirmClasses =
    tone === "danger"
      ? "bg-red-500 hover:bg-red-600 disabled:bg-red-300"
      : "bg-brand hover:bg-brand-dark disabled:opacity-60";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl xs:p-7"
      >
        {icon && <div className="mx-auto mb-4 flex items-center justify-center">{icon}</div>}
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900">
          {title}
        </h2>
        {description && <p className="mt-2 text-sm leading-relaxed text-gray-500">{description}</p>}

        <div className="mt-6 flex flex-col-reverse gap-2.5 xs:flex-row">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`min-h-11 flex-1 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition ${confirmClasses}`}
          >
            {loading ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
