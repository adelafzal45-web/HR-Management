import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { UserX, Mail, BadgeCheck, X, ChevronDown } from "lucide-react";
import { useTheme } from "../../lib/ThemeContext";
import type { Employee } from "../../lib/employeeApi";

export type DeactivateSubmission = { reason: string; reasonNote?: string; notifyEmployee: boolean };

type Props = {
  open: boolean;
  employee: Employee | null;
  loading?: boolean;
  onConfirm: (submission: DeactivateSubmission) => void;
  onCancel: () => void;
};

const REASON_OPTIONS = [
  "Voluntary resignation",
  "End of contract",
  "Termination — performance",
  "Termination — policy violation",
  "Layoff / restructuring",
  "Extended leave of absence",
  "Other",
];

// A richer, "are you sure" confirmation for the one destructive action that
// genuinely warrants more context than a corner ConfirmDialog can hold: it
// surfaces exactly who is being deactivated, requires a reason for the audit
// trail, and lets the admin decide whether the employee is notified —
// mirroring the offboarding dialogs in SAP SuccessFactors / BambooHR rather
// than a bare yes/no prompt.
export default function DeactivateEmployeeDialog({ open, employee, loading = false, onConfirm, onCancel }: Props) {
  const { themeClass } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState(REASON_OPTIONS[0]);
  const [reasonNote, setReasonNote] = useState("");
  const [notifyEmployee, setNotifyEmployee] = useState(true);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setReason(REASON_OPTIONS[0]);
      setReasonNote("");
      setNotifyEmployee(true);
      setTouched(false);
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

  if (!mounted || !employee) return null;

  const needsNote = reason === "Other";
  const canSubmit = !needsNote || reasonNote.trim().length > 0;

  const submit = () => {
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    onConfirm({ reason, reasonNote: needsNote ? reasonNote.trim() : undefined, notifyEmployee });
  };

  return createPortal(
    <div className={`${themeClass} fixed inset-0 z-[100] flex items-center justify-center px-4 py-6`}>
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
        aria-labelledby="deactivate-dialog-title"
        className={`relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all duration-200 dark:bg-gray-900 ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-gray-100 px-6 py-5 dark:border-gray-800">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
            <UserX size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="deactivate-dialog-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Deactivate employee
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              They'll immediately lose system access. This can be reversed at any time.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-300 transition hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {/* Employee summary card */}
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3.5 ring-1 ring-gray-100 dark:bg-gray-800/60 dark:ring-gray-800">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-light text-sm font-semibold text-brand-dark dark:bg-brand/10 dark:text-brand">
              {employee.firstName[0]}
              {employee.lastName[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {employee.firstName} {employee.lastName}
              </p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                {employee.designationName} · {employee.departmentName}
              </p>
            </div>
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-700 xs:flex">
              <BadgeCheck size={12} className="text-gray-400" /> {employee.employeeCode}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 px-0.5 text-xs text-gray-400 dark:text-gray-500">
            <Mail size={12} /> <span className="truncate">{employee.email}</span>
          </div>

          {/* Reason */}
          <label className="mt-5 block">
            <span className="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">
              Reason for deactivation
            </span>
            <div className="relative">
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full appearance-none rounded-lg bg-gray-100 px-3.5 py-2.5 pr-9 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60 dark:bg-gray-800 dark:text-gray-100"
              >
                {REASON_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </label>

          {needsNote && (
            <label className="mt-3 block">
              <span className="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Add a note</span>
              <textarea
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                rows={2}
                placeholder="Briefly describe the reason…"
                className={`w-full resize-none rounded-lg bg-gray-100 px-3.5 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 ${
                  touched && !canSubmit ? "ring-2 ring-rose-400" : ""
                }`}
              />
              {touched && !canSubmit && <p className="mt-1 text-xs text-rose-500">A short note is required for "Other".</p>}
            </label>
          )}

          {/* Notify toggle */}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3.5 dark:border-gray-800">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Notify employee by email</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Sends an automated notice to {employee.email}.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyEmployee}
              aria-label="Notify employee by email"
              onClick={() => setNotifyEmployee((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 ${
                notifyEmployee ? "bg-brand" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  notifyEmployee ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-6 py-4 dark:border-gray-800 xs:flex-row">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 flex-1 rounded-full border border-gray-200 px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="min-h-10 flex-1 rounded-full bg-red-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600 disabled:bg-red-300"
          >
            {loading ? "Deactivating…" : "Deactivate employee"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
