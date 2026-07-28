import { useState } from "react";
import { PartyPopper, Megaphone, X } from "lucide-react";
import { calendarEvents } from "@/modules/dashboard/mocks/dashboardMockData";
import { useNotifications } from "@/app/providers/NotificationsContext";
import type { AuthUser } from "@/utils/auth";

// How many days out a holiday needs to be before it's worth surfacing —
// further out and it'd just be noise on every single dashboard load.
const DAYS_AHEAD_THRESHOLD = 7;
const DISMISS_KEY_PREFIX = "hrms.dashboard.holidayBanner.dismissed.";

function daysUntil(dateIso: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateIso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

type HolidayBannerProps = {
  role?: AuthUser["role"];
};

// Surfaces the next upcoming holiday — computed from the same `calendarEvents`
// data the Calendar widget renders, so the two can never disagree — as a
// dismissible banner. HR Managers and Administrators additionally get a
// "Notify Team" action that posts through the same real, polling Notification
// system every other screen already uses (NotificationsContext, 30s poll),
// so the reminder shows up live in everyone's bell icon rather than being a
// dashboard-only decoration.
export default function HolidayBanner({ role }: HolidayBannerProps) {
  const { sendNotification } = useNotifications();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const nextHoliday = calendarEvents
    .filter((e) => e.type === "holiday")
    .map((e) => ({ ...e, daysAway: daysUntil(e.date) }))
    .filter((e) => e.daysAway >= 0 && e.daysAway <= DAYS_AHEAD_THRESHOLD)
    .sort((a, b) => a.daysAway - b.daysAway)[0];

  const dismissKey = nextHoliday ? `${DISMISS_KEY_PREFIX}${nextHoliday.id}` : null;
  const [dismissed, setDismissed] = useState(() => {
    if (!dismissKey) return false;
    try {
      return localStorage.getItem(dismissKey) === "1";
    } catch {
      return false;
    }
  });

  if (!nextHoliday || dismissed) return null;

  const canBroadcast = role === "hr_manager" || role === "administrator";

  const dismiss = () => {
    if (dismissKey) {
      try {
        localStorage.setItem(dismissKey, "1");
      } catch {
        // Best-effort — worst case it just reappears next visit.
      }
    }
    setDismissed(true);
  };

  const notifyTeam = async () => {
    setSending(true);
    try {
      await sendNotification({
        title: "Company holiday reminder",
        message: `${nextHoliday.title} is observed on ${nextHoliday.displayDate} — the office will be closed.`,
        type: "Announcement",
      });
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  const dayLabel =
    nextHoliday.daysAway === 0 ? "today" : nextHoliday.daysAway === 1 ? "tomorrow" : `in ${nextHoliday.daysAway} days`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-brand-light/60 p-4 ring-1 ring-brand/20 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
          <PartyPopper size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {nextHoliday.title} is {dayLabel}
          </p>
          <p className="text-xs text-gray-600">{nextHoliday.displayDate} — office will be closed.</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        {canBroadcast && (
          <button
            type="button"
            onClick={notifyTeam}
            disabled={sending || sent}
            className="flex min-h-9 items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            <Megaphone size={14} />
            {sent ? "Sent" : sending ? "Sending…" : "Notify Team"}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-white/60"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
