import { useEffect, useState } from "react";
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
//
// Centered modal with a dimmed backdrop — this is a blocking decision
// (confirm/cancel a destructive or important action), so it should demand
// full attention in the middle of the screen rather than sit off to the side
// like a passive notification.
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
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timeout = setTimeout(() => setMounted(false), 180);
    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!mounted) return null;

  const confirmClasses =
    tone === "danger"
      ? "bg-red-500 hover:bg-red-600 disabled:bg-red-300"
      : "bg-brand hover:bg-brand-dark disabled:opacity-60";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 sm:px-6">
      {/* Dimmed backdrop — signals a blocking, must-decide action. */}
      <div
        className={`absolute inset-0 bg-gray-900/50 backdrop-blur-[2px] transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onCancel}
        aria-hidden
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className={`relative w-full max-w-[92vw] overflow-hidden rounded-2xl bg-white p-6 text-left shadow-2xl transition-all duration-200 xs:max-w-sm ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <div className="flex items-start gap-3">
          {icon && <div className="flex shrink-0 items-center justify-center">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-gray-900">
              {title}
            </h2>
            {description && <p className="mt-2 text-sm leading-relaxed text-gray-500">{description}</p>}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`min-h-11 flex-1 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${confirmClasses}`}
          >
            {loading ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
