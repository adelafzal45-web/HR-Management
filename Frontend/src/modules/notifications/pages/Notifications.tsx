import { useMemo, useState, type FormEvent } from "react";
import {
  Bell,
  CalendarX2,
  Wallet,
  ClipboardCheck,
  Fingerprint,
  Megaphone,
  Check,
  Pencil,
  Trash2,
  Send,
  Search,
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { PrimaryButton } from "@/components/forms/FormField";
import { useNotifications } from "@/app/providers/NotificationsContext";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import type { NotificationRecord, NotificationType } from "@/api/hrApi";

const TYPES: NotificationType[] = ["General", "Announcement", "Leave", "Payroll", "Attendance", "Appraisal"];

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

type FormState = { title: string; message: string; type: NotificationType };
const EMPTY_FORM: FormState = { title: "", message: "", type: "Announcement" };

export default function Notifications() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, sendNotification, updateNotification, deleteNotification } =
    useNotifications();
  const { user } = useAuth();
  const toast = useToast();

  const canManage = user?.role === "hr_manager" || user?.role === "administrator";

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<NotificationType | "All">("All");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<NotificationRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((n) => {
      const matchesType = typeFilter === "All" || n.type === typeFilter;
      const matchesSearch = !q || n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [notifications, search, typeFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (n: NotificationRecord) => {
    setEditing(n);
    setForm({ title: n.title, message: n.message, type: n.type });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      setFormError("Title and message are both required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateNotification(editing.notificationId, form);
        toast.showSuccess("Notification updated.");
      } else {
        await sendNotification(form);
        toast.showSuccess("Notification sent.", "Everyone in the company can now see it.");
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteNotification(deleteTarget.notificationId);
      toast.showSuccess("Notification deleted.");
      setDeleteTarget(null);
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete notification.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout title="Notifications" activeKey="notification">
      <div className="flex flex-col gap-3 xs:flex-row xs:items-center xs:justify-between">
        <p className="text-sm text-gray-500">
          {unreadCount > 0 ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}.` : "You're all caught up."}
        </p>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="flex min-h-11 items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <Check size={14} /> Mark all as read
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="flex min-h-11 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
            >
              <Send size={14} /> New Notification
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications…"
            className="w-full rounded-full bg-white py-2.5 pl-10 pr-4 text-sm text-gray-700 shadow-sm outline-none ring-1 ring-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-brand/50"
          />
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(["All", ...TYPES] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`min-h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold transition ${
                typeFilter === t ? "bg-gray-900 text-white" : "bg-white text-gray-500 ring-1 ring-gray-100 hover:bg-gray-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        {loading ? (
          <div className="space-y-px p-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={Bell}
              title={notifications.length === 0 ? "No notifications yet" : "No matching notifications"}
              description={
                notifications.length === 0
                  ? canManage
                    ? "Send your first company-wide notification using the button above."
                    : "We'll let you know when something needs your attention."
                  : "Try a different search term or filter."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((n) => {
              const Icon = ICON_BY_TYPE[n.type] ?? Bell;
              return (
                <li key={n.notificationId} className="group relative">
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
                    <span className="min-w-0 flex-1 pr-16">
                      <span className="flex items-center gap-2">
                        {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-dark" />}
                        <span className="truncate text-sm font-semibold text-gray-900">{n.title}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-gray-500">{n.message}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
                        <span>{formatDateTime(n.createdAt)}</span>
                        {n.createdByName && (
                          <>
                            <span aria-hidden>•</span>
                            <span>from {n.createdByName}</span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>

                  {canManage && (
                    <div className="absolute right-4 top-4 hidden items-center gap-1 group-hover:flex">
                      <button
                        type="button"
                        onClick={() => openEdit(n)}
                        aria-label={`Edit ${n.title}`}
                        className="flex min-h-9 min-w-9 items-center justify-center rounded-lg bg-white text-gray-400 shadow-sm ring-1 ring-gray-100 transition hover:text-gray-700"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(n)}
                        aria-label={`Delete ${n.title}`}
                        className="flex min-h-9 min-w-9 items-center justify-center rounded-lg bg-white text-gray-400 shadow-sm ring-1 ring-gray-100 transition hover:text-rose-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Notification" : "New Notification"}
        description={
          editing
            ? "Update this notification's details."
            : "This will be broadcast to everyone in the company — there's no individual recipient list."
        }
      >
        <form onSubmit={handleSubmit}>
          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Company Holiday"
              required
              className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>

          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Message</span>
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="What do you want to tell everyone?"
              rows={4}
              required
              className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>

          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Type</span>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as NotificationType }))}
              className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          {formError && <p className="mb-4 text-sm text-red-500">{formError}</p>}

          <div className="flex flex-col-reverse gap-2.5 xs:flex-row">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="flex-1">
              <PrimaryButton type="submit" loading={saving}>
                {editing ? "Save Changes" : "Send Notification"}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This notification will be removed for everyone. This action cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
