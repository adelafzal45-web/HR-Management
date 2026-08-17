import { AlertTriangle, RotateCcw, type LucideIcon } from "lucide-react";
import { describeError, isPermissionError } from "@/lib/describeError";

type ErrorStateProps = {
  /**
   * The thrown value. Turned into a sentence via `describeError`, so an
   * `ApiError`'s status/message drives the copy (a 403 reads "you can't see
   * this", a 0 "can't reach the server"). Never rendered as raw JSON.
   */
  error?: unknown;
  /** Overrides the message derived from `error`. */
  message?: string;
  /** Heading above the message. */
  title?: string;
  /**
   * Retry handler. Rendered as a button unless the failure is a permission
   * error, where retrying the same request would just fail the same way.
   */
  onRetry?: () => void;
  icon?: LucideIcon;
};

/**
 * The Error sibling of `EmptyState`: shown when a fetch FAILED, so the screen
 * never renders a real backend error as an innocuous "no data" empty state.
 * Same card shell as EmptyState, an alert-toned icon, and an optional Retry.
 */
export default function ErrorState({ error, message, title = "Couldn't load this", onRetry, icon: Icon = AlertTriangle }: ErrorStateProps) {
  const description = message ?? describeError(error);
  const showRetry = !!onRetry && !isPermissionError(error);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6 py-14 text-center shadow-sm ring-1 ring-gray-100">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
        <Icon size={24} />
      </span>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="max-w-sm text-sm text-gray-500">{description}</p>
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
        >
          <RotateCcw size={15} /> Try again
        </button>
      )}
    </div>
  );
}
