import { Bell, Paperclip, Download } from "lucide-react";
import SidePanel from "@/components/dialogs/SidePanel";
import type { NotificationRecord } from "@/api/hrApi";
import {
  ICON_BY_TYPE,
  TONE_BY_TYPE,
  AUDIENCE_ICON,
  formatBytes,
  formatFullDateTime,
  audienceLabel,
} from "@/modules/notifications/utils/notificationDisplay";

/**
 * Save an attachment under the name it was uploaded with.
 *
 * The `download` attribute alone is not enough: uploads are served from the
 * API origin, and a browser ignores `download` on a cross-origin href — so
 * the stored file would save under its UUID. Fetching the bytes first makes
 * the URL same-origin (a blob), and the real name applies.
 */
async function saveAttachment(url: string, name: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const objectUrl = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    return true;
  } catch {
    return false;
  }
}

type NotificationDetailPanelProps = {
  notification: NotificationRecord | null;
  onClose: () => void;
};

/**
 * The full notification, opened from a capped list row.
 *
 * Every list — the bell dropdown, the inbox table — only ever shows a
 * truncated preview of a message, so a long notification needs somewhere to
 * be read in full. This is that somewhere: a right-hand drawer rather than a
 * centred modal, since it opens from a row in a list the user is still
 * working through (the bell, or the inbox behind it), and a drawer keeps
 * that list in place instead of hiding it.
 */
export default function NotificationDetailPanel({ notification, onClose }: NotificationDetailPanelProps) {
  return (
    <SidePanel
      open={!!notification}
      onClose={onClose}
      title={notification?.title ?? ""}
      description={notification ? formatFullDateTime(notification.createdAt) : undefined}
      maxWidth="max-w-md"
    >
      {notification && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${TONE_BY_TYPE[notification.type]}`}
            >
              {(() => {
                const Icon = ICON_BY_TYPE[notification.type] ?? Bell;
                return <Icon size={12} />;
              })()}
              {notification.type}
            </span>
            {notification.createdByName && (
              <span className="text-xs text-gray-500">from {notification.createdByName}</span>
            )}
          </div>

          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700">
            {notification.message}
          </p>

          {notification.attachmentUrl && (
            <a
              href={notification.attachmentUrl}
              download={notification.attachmentName || undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={async (e) => {
                const { attachmentUrl, attachmentName } = notification;
                if (!attachmentUrl || !attachmentName) return;
                e.preventDefault();
                if (!(await saveAttachment(attachmentUrl, attachmentName))) {
                  window.open(attachmentUrl, "_blank", "noopener,noreferrer");
                }
              }}
              className="mt-5 flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 transition hover:border-brand hover:bg-brand-light/30"
            >
              <Paperclip size={16} className="shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-800">
                  {notification.attachmentName || "Attachment"}
                </span>
                {notification.attachmentSize ? (
                  <span className="text-xs text-gray-500">{formatBytes(notification.attachmentSize)}</span>
                ) : null}
              </span>
              <Download size={16} className="shrink-0 text-gray-400" />
            </a>
          )}

          {audienceLabel(notification) && (
            <p className="mt-5 flex items-center gap-1.5 border-t border-gray-100 pt-4 text-xs text-gray-500">
              {notification.audienceType &&
                (() => {
                  const Icon = AUDIENCE_ICON[notification.audienceType];
                  return <Icon size={13} />;
                })()}
              {audienceLabel(notification)}
            </p>
          )}
        </>
      )}
    </SidePanel>
  );
}
