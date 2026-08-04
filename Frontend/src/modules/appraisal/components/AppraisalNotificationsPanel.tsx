import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, CheckCheck, Clock, RotateCcw, ShieldCheck } from "lucide-react";

import { formatDisplayDate } from "@/utils/formatDate";
import {
  appraisalNotificationsApi,
  type AppraisalNotification,
} from "@/modules/appraisal/api/appraisalApi";

/*
 * `type` is a varchar on the server, not an enum the client can exhaustively
 * switch on, so an unrecognised type still renders — with the neutral bell —
 * rather than crashing on a missing map entry when a new type ships.
 */
const TYPE_ICON: Record<string, typeof Bell> = {
  SHIFT_REMINDER: Clock,
  PENDING_DIGEST: Bell,
  REVIEW_REOPENED: RotateCcw,
  REVIEW_APPROVED: ShieldCheck,
};

/**
 * The reader's own appraisal notifications.
 *
 * Read state is written server-side per notification; there is no bulk
 * mark-all endpoint, so "mark all read" issues one request each and refreshes
 * once at the end. Failures are swallowed on purpose — a notification that
 * stays unread is a cosmetic problem, and an error banner over a Team Lead's
 * dashboard for it would be noise.
 */
export default function AppraisalNotificationsPanel({
  onError,
  compact = false,
}: {
  onError?: (err: unknown, fallback: string) => void;
  compact?: boolean;
}) {
  const [items, setItems] = useState<AppraisalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    appraisalNotificationsApi
      .list()
      .then(setItems)
      .catch((err) => onError?.(err, "Could not load your notifications."))
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(load, [load]);

  const unread = items.filter((n) => !n.isRead);

  const markRead = async (notificationId: string) => {
    // Flip locally first: the row is already on screen and the request only
    // persists what the reader just did.
    setItems((prev) =>
      prev.map((n) => (n.notificationId === notificationId ? { ...n, isRead: true } : n)),
    );
    try {
      await appraisalNotificationsApi.markRead(notificationId);
    } catch (err) {
      onError?.(err, "Could not mark that notification as read.");
      load();
    }
  };

  const markAllRead = async () => {
    setBusy(true);
    const ids = unread.map((n) => n.notificationId);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await Promise.allSettled(ids.map((id) => appraisalNotificationsApi.markRead(id)));
    } finally {
      setBusy(false);
      load();
    }
  };

  const visible = compact ? items.slice(0, 5) : items;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Bell size={15} className="text-gray-400" />
          Notifications
          {unread.length > 0 && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">
              {unread.length}
            </span>
          )}
        </h3>
        {unread.length > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 transition hover:text-brand-dark disabled:opacity-50"
          >
            <CheckCheck size={13} />
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-center">
          <BellOff size={20} className="text-gray-300" />
          <p className="text-sm text-gray-400">Nothing to catch up on.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Bell;
            return (
              <li
                key={n.notificationId}
                className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 ${
                  n.isRead ? "bg-gray-50/70" : "bg-brand-light/40"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    n.isRead ? "bg-gray-200 text-gray-500" : "bg-brand text-white"
                  }`}
                >
                  <Icon size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                  <p className="mt-0.5 text-sm text-gray-600">{n.message}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {formatDisplayDate(n.createdAt, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {!n.isRead && (
                  <button
                    type="button"
                    onClick={() => markRead(n.notificationId)}
                    aria-label={`Mark "${n.title}" as read`}
                    title="Mark as read"
                    className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-brand-dark"
                  >
                    <CheckCheck size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {compact && items.length > visible.length && (
        <p className="mt-2.5 text-xs text-gray-400">
          +{items.length - visible.length} older notification
          {items.length - visible.length === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
