// ============================================================================
// Send-password-reset-links dialog.
//
// Not a ConfirmDialog: this action has no single outcome to report. The
// backend answers `POST /users/password-reset-links` with 200 and a per-user
// `sent | skipped | failed` breakdown even when nothing was sent, because
// "3 of 5 sent" is not something one status code can express. A toast saying
// "Reset links sent" over a response where four were skipped would be a
// straightforward lie, and the admin would find out only when the employees
// say no mail arrived. So the result is rendered as a list, and the dialog
// stays open until it is dismissed.
//
// Every reason string shown here comes from the server verbatim: it knows why
// a target was skipped (no email address, resets disabled on the account) and
// guessing client-side would drift the moment that logic changes.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, KeyRound, MinusCircle, XCircle } from "lucide-react";

import { ApiError } from "@/lib/apiClient";
import {
  MAX_RESET_LINK_BATCH,
  adminPasswordResetApi,
  type BulkPasswordResetSummary,
  type ResetLinkStatus,
} from "@/modules/auth/api";

export type ResetLinkTarget = {
  userId: string;
  name: string;
  email?: string;
};

type Props = {
  open: boolean;
  targets: ResetLinkTarget[];
  onClose: () => void;
  /** Called once after a batch completes, so the caller can clear its selection. */
  onCompleted?: (summary: BulkPasswordResetSummary) => void;
};

const STATUS_META: Record<
  ResetLinkStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  sent: { label: "Sent", icon: CheckCircle2, className: "text-emerald-600" },
  skipped: { label: "Skipped", icon: MinusCircle, className: "text-amber-600" },
  failed: { label: "Failed", icon: XCircle, className: "text-rose-600" },
};

export default function SendResetLinksDialog({ open, targets, onClose, onCompleted }: Props) {
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<BulkPasswordResetSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset on open so a second batch never shows the previous one's results.
  useEffect(() => {
    if (open) {
      setSummary(null);
      setError(null);
      setSending(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, sending]);

  const nameById = useMemo(() => {
    const map = new Map<string, ResetLinkTarget>();
    for (const t of targets) map.set(t.userId, t);
    return map;
  }, [targets]);

  const overLimit = targets.length > MAX_RESET_LINK_BATCH;

  if (!open) return null;

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      const result = await adminPasswordResetApi.sendLinks(targets.map((t) => t.userId));
      setSummary(result);
      onCompleted?.(result);
    } catch (err) {
      // A thrown error here means the whole request was rejected (403, 429,
      // validation) — distinct from a 200 with per-user failures, which is not
      // an error and lands in `summary` instead.
      setError(
        err instanceof ApiError ? err.message : "Couldn't send the reset links. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 sm:px-6">
      <div
        className="absolute inset-0 bg-gray-900/50 backdrop-blur-[2px]"
        onClick={() => !sending && onClose()}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-links-title"
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white text-left shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-gray-100 p-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-dark">
            <KeyRound size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="reset-links-title" className="text-base font-semibold text-gray-900">
              {summary ? "Reset links processed" : `Send reset link to ${targets.length} employee(s)?`}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-500">
              {summary
                ? `${summary.sent} sent · ${summary.skipped} skipped · ${summary.failed} failed`
                : "Each employee gets a one-time link that expires in 60 minutes. Any earlier link they were sent stops working."}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {!summary && (
            <>
              {overLimit && (
                <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
                  <AlertTriangle size={15} className="mr-1.5 inline shrink-0" />
                  You've selected {targets.length}. The server accepts at most{" "}
                  {MAX_RESET_LINK_BATCH} per batch — deselect some and try again.
                </p>
              )}

              <ul className="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-100">
                {targets.slice(0, 50).map((t) => (
                  <li key={t.userId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0 truncate text-sm font-medium text-gray-900">
                      {t.name}
                    </span>
                    <span className="min-w-0 shrink-0 truncate text-xs text-gray-400">
                      {t.email || "no email on file"}
                    </span>
                  </li>
                ))}
              </ul>
              {targets.length > 50 && (
                <p className="mt-2 text-xs text-gray-400">
                  …and {targets.length - 50} more. All {targets.length} will be processed.
                </p>
              )}

              {error && (
                <p role="alert" className="mt-4 text-sm text-rose-600">
                  {error}
                </p>
              )}
            </>
          )}

          {summary && (
            <ul className="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-100">
              {summary.results.map((r) => {
                const meta = STATUS_META[r.status];
                const Icon = meta.icon;
                const target = nameById.get(r.user_id);
                return (
                  <li key={r.user_id} className="flex items-start gap-3 px-4 py-3">
                    <Icon size={16} className={`mt-0.5 shrink-0 ${meta.className}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {target?.name ?? r.user_id}
                      </p>
                      <p className="truncate text-xs text-gray-400">
                        {r.email ?? target?.email ?? "—"}
                      </p>
                      {r.reason && (
                        <p className={`mt-1 text-xs ${meta.className}`}>{r.reason}</p>
                      )}
                    </div>
                    <span className={`shrink-0 text-xs font-medium ${meta.className}`}>
                      {meta.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex gap-3 border-t border-gray-100 p-6">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="min-h-11 flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {summary ? "Done" : "Cancel"}
          </button>
          {!summary && (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || overLimit || targets.length === 0}
              className="min-h-11 flex-1 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send links"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
