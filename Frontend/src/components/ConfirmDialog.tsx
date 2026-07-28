import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { TriangleAlert, CircleHelp } from "lucide-react";
import { useTheme } from "../lib/ThemeContext";

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
// Styled to match the notification bell popup (Header.tsx): a compact card
// anchored to the top-right corner that fades/slides in, rather than a
// full-screen centered modal with a dark backdrop.
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
  const { themeClass } = useTheme();

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
      ? "bg-red-500 text-white hover:bg-red-600 disabled:bg-red-300"
      : "bg-gradient-to-r from-brand to-brand-dark text-gray-900 hover:brightness-95 disabled:opacity-60";

  const defaultIcon = (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
        tone === "danger"
          ? "bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400"
          : "bg-brand-light text-brand-dark dark:bg-brand/10"
      }`}
    >
      {tone === "danger" ? <TriangleAlert size={19} /> : <CircleHelp size={19} />}
    </div>
  );

  return createPortal(
    <div className={`${themeClass} fixed inset-0 z-[100]`}>
      {/* Transparent click-catcher, not a dark backdrop — matches the
          notification/profile dropdowns, which dismiss on outside click
          without dimming the page. */}
      <div className="absolute inset-0" onClick={onCancel} aria-hidden />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className={`absolute right-4 top-4 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white p-5 text-left shadow-xl ring-1 ring-gray-100 transition-all duration-200 dark:bg-gray-900 dark:ring-gray-800 xs:right-6 xs:top-6 xs:w-96 ${
          visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
      >
        <div className="flex items-start gap-3">
          {icon ?? defaultIcon}
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 xs:flex-row">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`min-h-10 flex-1 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${confirmClasses}`}
          >
            {loading ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
