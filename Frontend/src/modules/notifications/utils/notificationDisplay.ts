import {
  Bell,
  CalendarX2,
  Wallet,
  ClipboardCheck,
  Fingerprint,
  Megaphone,
  Users,
  Building2,
  User as UserIcon,
} from "lucide-react";
import type { NotificationRecord, NotificationType, NotificationAudienceType } from "@/api/hrApi";

/**
 * How a notification is presented, shared by the list row and the detail panel.
 *
 * Both render the same notification in two densities, so the icon, tone and
 * audience wording live here rather than being written twice and drifting.
 */

export const ICON_BY_TYPE: Record<NotificationType, typeof Bell> = {
  Leave: CalendarX2,
  Payroll: Wallet,
  Attendance: Fingerprint,
  Appraisal: ClipboardCheck,
  Announcement: Megaphone,
  General: Bell,
};

export const TONE_BY_TYPE: Record<NotificationType, string> = {
  Leave: "bg-sky-50 text-sky-500",
  Payroll: "bg-emerald-50 text-emerald-500",
  Attendance: "bg-amber-50 text-amber-500",
  Appraisal: "bg-violet-50 text-violet-500",
  Announcement: "bg-rose-50 text-rose-500",
  General: "bg-gray-100 text-gray-500",
};

export const AUDIENCE_ICON: Record<NotificationAudienceType, typeof Bell> = {
  Specific: UserIcon,
  Department: Building2,
  All: Users,
};

/**
 * Characters of the message a list row shows before it is cut off.
 *
 * This is a display cap only — the stored message is untouched, and the detail
 * panel shows all of it. That distinction is the whole point: the row cap used
 * to sit at 200 to match the compose textarea's `maxLength`, which meant it
 * never fired, while the textarea was quietly clipping messages at 200 as they
 * were typed. The compose cap is now 2,000 and enforced by the DTO too; this
 * one stays small so a row carries the gist at a consistent height.
 */
export const MESSAGE_PREVIEW_LIMIT = 120;

/**
 * Caps a message for a list row, trimming first so the limit counts visible
 * characters rather than incidental whitespace, and again after slicing so the
 * ellipsis doesn't float after a trailing space.
 */
export function truncateMessage(message: string, limit: number = MESSAGE_PREVIEW_LIMIT) {
  const trimmed = message.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit).trimEnd()}…`;
}

/** "412 KB" / "1.8 MB". Bytes are not a useful thing to show a sender. */
export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The long form for the detail panel's header — includes the year. */
export function formatFullDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Engineering · 12 recipients · 9 read" — who a sent notification reached. */
export function audienceLabel(n: NotificationRecord) {
  const parts: string[] = [];

  if (n.audienceType === "Department") {
    parts.push(n.audienceDepartmentName || "Department");
  } else if (n.audienceType === "Specific") {
    parts.push("Specific people");
  } else if (n.audienceType === "All") {
    parts.push("Everyone");
  }

  if (n.recipientCount != null) {
    parts.push(`${n.recipientCount} recipient${n.recipientCount === 1 ? "" : "s"}`);
  }
  if (n.readCount != null) parts.push(`${n.readCount} read`);

  return parts.join(" · ");
}
