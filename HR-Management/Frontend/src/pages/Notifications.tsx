import { Bell, CalendarX2, Wallet, ClipboardCheck, Fingerprint, Megaphone, Check } from "lucide-react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import EmptyState from "../components/EmptyState";
import { useNotifications } from "../lib/NotificationsContext";
import type { NotificationType } from "../lib/hrApi";

const ICON_BY_TYPE: Record<NotificationType, typeof Bell> = {
  Leave: CalendarX2,
  Payroll: Wallet,
  Attendance: Fingerprint,
  Appraisal: ClipboardCheck,
  Announcement: Megaphone,
  General: Bell,
};

const TONE_BY_TYPE: Record<NotificationType, string> = {
  Leave: "bg-sky-50 text-sky-500",
  Payroll: "bg-emerald-50 text-emerald-500",
  Attendance: "bg-amber-50 text-amber-500",
  Appraisal: "bg-violet-50 text-violet-500",
  Announcement: "bg-rose-50 text-rose-500",
  General: "bg-gray-100 text-gray-500",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Notifications() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();

  return (
    <DashboardLayout title="Notifications" activeKey="notification">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {unreadCount > 0 ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}.` : "You're all caught up."}
        </p>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="flex min-h-11 items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Check size={14} /> Mark all as read
          </button>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        {loading ? (
          <div className="space-y-px p-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-2">
            <EmptyState icon={Bell} title="No new notifications" description="We'll let you know when something needs your attention." />
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {notifications.map((n) => {
              const Icon = ICON_BY_TYPE[n.type] ?? Bell;
              return (
                <li key={n.notificationId}>
                  <button
                    type="button"
                    onClick={() => markAsRead(n.notificationId)}
                    className={`flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-gray-50 ${
                      n.isRead ? "" : "bg-brand-light/20"
                    }`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_BY_TYPE[n.type]}`}>
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-dark" />}
                        <span className="truncate text-sm font-semibold text-gray-900">{n.title}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-gray-500">{n.message}</span>
                      <span className="mt-1 block text-xs text-gray-400">{formatDateTime(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}
