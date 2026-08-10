import {
 useCallback,
 useEffect,
 useMemo,
 useRef,
 useState,
 type ChangeEvent,
 type FormEvent,
} from "react";
import {
 Bell,
 Check,
 Pencil,
 Trash2,
 Send,
 Search,
 Paperclip,
 X,
 Loader2,
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { PrimaryButton } from "@/components/forms/FormField";
import MultiSelect from "@/components/common/MultiSelect";
import SearchableSelect, { type SelectOption } from "@/components/common/SearchableSelect";
import { useNotifications } from "@/app/providers/NotificationsContext";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import { notificationApi } from "@/api/hrApi";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import NotificationDetailPanel from "@/modules/notifications/components/NotificationDetailPanel";
import {
 ICON_BY_TYPE,
 TONE_BY_TYPE,
 AUDIENCE_ICON,
 audienceLabel,
 formatBytes,
 formatDateTime,
 truncateMessage,
} from "@/modules/notifications/utils/notificationDisplay";
import type {
 NotificationRecord,
 NotificationType,
 NotificationAudienceType,
 NotificationAttachment,
} from "@/api/hrApi";

// The categories an author may pick. Must stay in step with
// AUTHORABLE_CATEGORIES in the backend entity — the server rejects anything
// outside its enum, and these strings are sent verbatim as `category`.
const TYPES: NotificationType[] = ["General", "Announcement", "Leave", "Payroll", "Attendance", "Appraisal"];

const AUDIENCE_CHOICES: Array<{ value: NotificationAudienceType; label: string; hint: string }> = [
 { value: "Specific", label: "Specific people", hint: "Pick individual employees" },
 { value: "Department", label: "Whole department", hint: "Everyone active in one department" },
 { value: "All", label: "Everyone", hint: "All active employees" },
];

/**
 * What the compose form will accept. Images and PDFs only, matching the
 * server's allow-list — an attachment is meant to be a document a recipient can
 * open, and anything else would be stored only to be refused on download.
 */
const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

/**
 * 5 MB, the same ceiling the server enforces.
 *
 * Checked here as well so an over-size file is rejected before it is uploaded,
 * rather than after the whole thing has crossed the wire to be refused.
 */
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * How long a message may be.
 *
 * This used to be 200, which silently truncated: `maxLength` on a textarea
 * refuses further input without saying so, so a pasted announcement was cut
 * mid-word and *that* clipped text was what got stored and sent. The column is
 * `text`, so 200 was never a storage constraint — just an accident. 2,000 is
 * roughly 300 words, enough for a real announcement, and the DTO enforces the
 * same number so the two ends agree.
 */
const MESSAGE_MAX_LENGTH = 2000;

// `type` starts blank rather than pre-picked: the field is required, and
// defaulting it to "Announcement" meant every notification sent without a
// thought about it was filed as an announcement. `audienceType` defaults to
// "Specific" so the safest option is the one already selected — an
// accidental submit reaches nobody rather than the whole company.
type FormState = {
 title: string;
 message: string;
 type: NotificationType | "";
 audienceType: NotificationAudienceType;
 audienceDepartmentId: string;
 recipientIds: string[];
 /** Already uploaded by the time it lands here — see `handleFileChange`. */
 attachment?: NotificationAttachment;
};

const EMPTY_FORM: FormState = {
 title: "",
 message: "",
 type: "",
 audienceType: "Specific",
 audienceDepartmentId: "",
 recipientIds: [],
 attachment: undefined,
};

type Tab = "inbox" | "sent";

export default function Notifications() {
 const { notifications, unreadCount, loading, markAsRead, markAllAsRead, sendNotification, updateNotification, deleteNotification } =
 useNotifications();
 const { user } = useAuth();
 const toast = useToast();

 const canManage = user?.role === "hr_manager" || user?.role === "administrator";

 const [tab, setTab] = useState<Tab>("inbox");
 const [search, setSearch] = useState("");
 const [typeFilter, setTypeFilter] = useState<NotificationType | "All">("All");

 // The Sent view is a different query from the bell: it is the sender's list
 // of composed notifications (one entry per send, with counts), while the
 // context holds only what was addressed to this user.
 const [sent, setSent] = useState<NotificationRecord[]>([]);
 const [sentLoading, setSentLoading] = useState(false);

 const [departments, setDepartments] = useState<Department[]>([]);
 const [employees, setEmployees] = useState<Employee[]>([]);

 const [modalOpen, setModalOpen] = useState(false);
 const [editing, setEditing] = useState<NotificationRecord | null>(null);
 const [form, setForm] = useState<FormState>(EMPTY_FORM);
 const [formError, setFormError] = useState<string | null>(null);
 const [typeError, setTypeError] = useState<string | null>(null);
 const [audienceError, setAudienceError] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);

 const [deleteTarget, setDeleteTarget] = useState<NotificationRecord | null>(null);
 const [deleting, setDeleting] = useState(false);

 // The row shows a capped preview; this holds the one whose full text is on screen.
 const [viewing, setViewing] = useState<NotificationRecord | null>(null);

 const [uploading, setUploading] = useState(false);
 const [attachmentError, setAttachmentError] = useState<string | null>(null);
 // Reset after every pick so choosing the same file twice — having removed it
 // in between — still fires `change`.
 const fileInputRef = useRef<HTMLInputElement | null>(null);

 /**
  * Opening a notification is what marks it read.
  *
  * Keeps the behaviour the row click already had rather than replacing it:
  * before there was a detail view, clicking the row was the only way to read a
  * long message, and it cleared the unread dot. It still does.
  */
 const openView = (n: NotificationRecord) => {
 setViewing(n);
 if (tab !== "sent" && !n.isRead) markAsRead(n.notificationId);
 };

 /**
  * Upload as soon as a file is picked, holding only the returned metadata.
  *
  * The alternative — keeping the `File` and sending it with the notification —
  * would mean the sender discovers a rejected file after choosing an audience
  * and pressing Send. Uploading first means a bad file costs one message and
  * the compose form is otherwise untouched.
  */
 const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (fileInputRef.current) fileInputRef.current.value = "";
 if (!file) return;

 setAttachmentError(null);

 if (file.size > MAX_ATTACHMENT_BYTES) {
 setAttachmentError(`That file is ${formatBytes(file.size)}. The limit is 5 MB.`);
 return;
 }

 setUploading(true);
 try {
 const attachment = await notificationApi.uploadAttachment(file);
 setForm((f) => ({ ...f, attachment }));
 } catch (err) {
 setAttachmentError(
 err instanceof Error ? err.message : "Couldn't upload that file. Please try again.",
 );
 } finally {
 setUploading(false);
 }
 };

 const loadSent = useCallback(() => {
 if (!canManage) return;
 setSentLoading(true);
 notificationApi
 .getAll()
 .then(setSent)
 .catch(() => toast.showError("Couldn't load sent notifications."))
 .finally(() => setSentLoading(false));
 }, [canManage, toast]);

 useEffect(() => {
 loadSent();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [canManage]);

 // Only a sender needs the picker lists; skip both calls for employees.
 useEffect(() => {
 if (!canManage) return;
 departmentsApi.listAll().then((res) => setDepartments(res.data)).catch(() => undefined);
 employeesApi.list({ pageSize: 200 }).then((res) => setEmployees(res.data)).catch(() => undefined);
 }, [canManage]);

 const employeeOptions = useMemo<SelectOption[]>(
 () =>
 employees.map((e) => ({
 value: e.employeeId,
 label: `${e.firstName} ${e.lastName}`.trim() || e.email,
 hint: e.departmentName && e.departmentName !== "—" ? e.departmentName : e.email,
 })),
 [employees],
 );

 const departmentOptions = useMemo<SelectOption[]>(
 () => departments.map((d) => ({ value: d.departmentId, label: d.name })),
 [departments],
 );

 // Shows "12 people will be notified" before sending, from the already-loaded
 // employee list — no extra endpoint. The server resolves the real audience,
 // so this is a preview, not the authority.
 const departmentHeadcount = useMemo(() => {
 if (form.audienceType !== "Department" || !form.audienceDepartmentId) return null;
 return employees.filter((e) => e.departmentId === form.audienceDepartmentId).length;
 }, [employees, form.audienceType, form.audienceDepartmentId]);

 const source = tab === "sent" ? sent : notifications;

 const filtered = useMemo(() => {
 const q = search.trim().toLowerCase();
 return source.filter((n) => {
 const matchesType = typeFilter === "All" || n.type === typeFilter;
 const matchesSearch = !q || n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q);
 return matchesType && matchesSearch;
 });
 }, [source, search, typeFilter]);

 const openCreate = () => {
 setEditing(null);
 setForm(EMPTY_FORM);
 setFormError(null);
 setTypeError(null);
 setAudienceError(null);
 setAttachmentError(null);
 setModalOpen(true);
 };

 const openEdit = (n: NotificationRecord) => {
 setEditing(n);
 setForm({
 title: n.title,
 message: n.message,
 type: n.type,
 // Audience is read-only when editing (the backend rejects re-targeting
 // after delivery), but seeding it keeps the summary line accurate.
 audienceType: n.audienceType ?? "All",
 audienceDepartmentId: n.audienceDepartmentId ?? "",
 recipientIds: [],
 // Editing corrects the wording of something already delivered. Swapping
 // the file out is not offered — the recipients who already opened it
 // would have read a different document from the ones who had not.
 attachment: undefined,
 });
 setFormError(null);
 setTypeError(null);
 setAudienceError(null);
 setAttachmentError(null);
 setModalOpen(true);
 };

 const handleSubmit = async (e: FormEvent) => {
 e.preventDefault();

 if (!form.type) {
 setTypeError("Choose a notification type.");
 return;
 }
 if (!form.title.trim() || !form.message.trim()) {
 setFormError("Title and message are both required.");
 return;
 }
 // Sending now would deliver the notification without the file the sender is
 // in the middle of attaching, and there is no way to add it afterwards.
 if (uploading) {
 setFormError("Wait for the attachment to finish uploading.");
 return;
 }

 // Mirrors the DTO's @ValidateIf rules so the sender gets a field-level
 // message instead of a 400 with no field attached.
 if (!editing) {
 if (form.audienceType === "Department" && !form.audienceDepartmentId) {
 setAudienceError("Choose a department.");
 return;
 }
 if (form.audienceType === "Specific" && form.recipientIds.length === 0) {
 setAudienceError("Select at least one employee.");
 return;
 }
 }

 setSaving(true);
 setFormError(null);

 try {
 if (editing) {
 await updateNotification(editing.notificationId, {
 title: form.title,
 message: form.message,
 type: form.type,
 });
 toast.showSuccess("Notification updated.", "Every recipient's copy was corrected.");
 } else {
 const created = await sendNotification({
 title: form.title,
 message: form.message,
 type: form.type,
 audienceType: form.audienceType,
 audienceDepartmentId: form.audienceDepartmentId || undefined,
 recipientIds: form.recipientIds,
 attachment: form.attachment,
 });

 // Report what it actually reached, from the server's count — not an
 // assumption about the audience.
 const count = created.recipientCount;
 toast.showSuccess(
 "Notification sent.",
 count != null
 ? `Delivered to ${count} ${count === 1 ? "person" : "people"}.`
 : undefined,
 );
 setTab("sent");
 }
 loadSent();
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
 toast.showSuccess("Notification deleted.", "Removed from every recipient's bell.");
 setDeleteTarget(null);
 loadSent();
 } catch (err) {
 toast.showError(err instanceof Error ? err.message : "Couldn't delete notification.");
 } finally {
 setDeleting(false);
 }
 };

 const listLoading = tab === "sent" ? sentLoading : loading;

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

 {canManage && (
 <div className="mt-4 flex gap-1 rounded-full bg-gray-100 p-1 sm:w-fit">
 {([
 { key: "inbox" as const, label: "Inbox" },
 { key: "sent" as const, label: "Sent" },
 ]).map((t) => (
 <button
 key={t.key}
 type="button"
 onClick={() => setTab(t.key)}
 aria-pressed={tab === t.key}
 className={`min-h-9 flex-1 rounded-full px-5 text-sm font-semibold transition sm:flex-none ${
 tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
 }`}
 >
 {t.label}
 </button>
 ))}
 </div>
 )}

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
 {listLoading ? (
 <div className="space-y-px p-4">
 {[...Array(4)].map((_, i) => (
 <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
 ))}
 </div>
 ) : filtered.length === 0 ? (
 <div className="p-2">
 <EmptyState
 icon={Bell}
 title={
 source.length === 0
 ? tab === "sent"
 ? "Nothing sent yet"
 : "No notifications yet"
 : "No matching notifications"
 }
 description={
 source.length > 0
 ? "Try a different search term or filter."
 : tab === "sent"
 ? "Use New Notification to send to everyone, a department, or specific employees."
 : "We'll let you know when something needs your attention."
 }
 />
 </div>
 ) : (
 <ul className="divide-y divide-gray-50">
 {filtered.map((n) => {
 const Icon = ICON_BY_TYPE[n.type] ?? Bell;
 const isSent = tab === "sent";
 const AudienceIcon = n.audienceType ? AUDIENCE_ICON[n.audienceType] : null;
 const summary = isSent ? audienceLabel(n) : "";

 // On Sent every row is an outgoing batch, so the unread
 // highlight (a property of *this* user's copy) is meaningless.
 const highlight = !isSent && !n.isRead;

 return (
 <li key={n.batchId ?? n.notificationId} className="group relative">
 <button
 type="button"
 onClick={() => openView(n)}
 className={`flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-gray-50 ${
 highlight ? "bg-brand-light/20" : ""
 }`}
 >
 <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_BY_TYPE[n.type]}`}>
 <Icon size={18} />
 </span>
 <span className="min-w-0 flex-1 pr-16">
 <span className="flex items-center gap-2">
 {highlight && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-dark" />}
 <span className="truncate text-sm font-semibold text-gray-900">{n.title}</span>
 {n.attachmentUrl && (
 <Paperclip size={13} className="shrink-0 text-gray-400" aria-label="Has an attachment" />
 )}
 </span>
 {/* Capped two ways, because either alone leaves a bad row. The
     character cap stops a wall of text being laid out at all; the
     line clamp then holds every row to the same height regardless
     of how the text happens to wrap. Without the clamp a
     200-character message still ran to three or four lines and
     pushed the rows around it apart. Full text is one click away,
     in the detail panel. */}
 <span className="mt-0.5 line-clamp-2 block break-words text-sm text-gray-500">
 {truncateMessage(n.message)}
 </span>
 <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
 <span>{formatDateTime(n.createdAt)}</span>
 {isSent
 ? summary && (
 <>
 <span aria-hidden>•</span>
 <span className="inline-flex items-center gap-1 font-medium text-gray-500">
 {AudienceIcon && <AudienceIcon size={12} />}
 {summary}
 </span>
 </>
 )
 : n.createdByName && (
 <>
 <span aria-hidden>•</span>
 <span>from {n.createdByName}</span>
 </>
 )}
 </span>
 </span>
 </button>

 {/* Edit and delete act on the whole batch, so they belong to
 the sender's view — not to one recipient's copy. */}
 {canManage && isSent && (
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
 ? "Changes apply to every recipient's copy. The audience can't be changed after sending."
 : "Choose who receives this — everyone, one department, or specific employees."
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
 maxLength={200}
 className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
 />
 </label>

 <label className="mb-5 block">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">Message</span>
 <textarea
 value={form.message}
 onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
 placeholder="What do you want to tell them?"
 rows={4}
 required
 maxLength={MESSAGE_MAX_LENGTH}
 className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
 />
 {/* Shown only as the cap comes into reach. A counter on an empty box is
     noise; a counter at 1,900 characters is the warning that stops a
     message being clipped mid-word the way the old silent 200 did. */}
 {form.message.length > MESSAGE_MAX_LENGTH - 200 && (
 <span className="mt-1 block text-right text-xs text-gray-400">
 {form.message.length} / {MESSAGE_MAX_LENGTH}
 </span>
 )}
 </label>

 <label className="mb-5 block">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">
 Type <span className="text-rose-500" aria-hidden="true">*</span>
 </span>
 <select
 value={form.type}
 onChange={(e) => {
 setForm((f) => ({ ...f, type: e.target.value as NotificationType | "" }));
 setTypeError(null);
 }}
 required
 aria-invalid={typeError ? true : undefined}
 aria-describedby={typeError ? "notification-type-error" : undefined}
 className={`w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 ${
 typeError ? "ring-2 ring-rose-400" : "focus:ring-brand/60"
 }`}
 >
 <option value="">Select a type</option>
 {TYPES.map((t) => (
 <option key={t} value={t}>
 {t}
 </option>
 ))}
 </select>
 {typeError && (
 <span id="notification-type-error" className="mt-1.5 block text-xs text-rose-500">
 {typeError}
 </span>
 )}
 </label>

 {/* Offered on send only. A delivered notification's file is not swappable:
     recipients who already opened it would have read a different document
     from the ones who had not. */}
 {!editing && (
 <div className="mb-5">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">
 Attachment <span className="font-normal text-gray-400">(optional)</span>
 </span>

 {form.attachment ? (
 <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
 <Paperclip size={16} className="shrink-0 text-gray-400" />
 <span className="min-w-0 flex-1">
 <span className="block truncate text-sm font-medium text-gray-800">
 {form.attachment.name}
 </span>
 {form.attachment.size > 0 && (
 <span className="text-xs text-gray-500">{formatBytes(form.attachment.size)}</span>
 )}
 </span>
 <button
 type="button"
 onClick={() => {
 setForm((f) => ({ ...f, attachment: undefined }));
 setAttachmentError(null);
 }}
 aria-label={`Remove ${form.attachment.name}`}
 className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-white hover:text-rose-600"
 >
 <X size={15} />
 </button>
 </div>
 ) : (
 <>
 <input
 ref={fileInputRef}
 type="file"
 accept={ATTACHMENT_ACCEPT}
 onChange={handleFileChange}
 className="sr-only"
 id="notification-attachment"
 />
 <label
 htmlFor="notification-attachment"
 className={`flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition hover:border-brand hover:bg-brand-light/30 ${
 uploading ? "pointer-events-none opacity-60" : ""
 }`}
 >
 {uploading ? (
 <>
 <Loader2 size={15} className="animate-spin" /> Uploading…
 </>
 ) : (
 <>
 <Paperclip size={15} /> Choose a PDF or image
 </>
 )}
 </label>
 <p className="mt-1.5 text-xs text-gray-400">PDF, PNG, JPG or WebP · up to 5 MB</p>
 </>
 )}

 {attachmentError && <p className="mt-2 text-xs text-rose-500">{attachmentError}</p>}
 </div>
 )}

 {editing ? (
 <div className="mb-5 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
 Sent to {audienceLabel(editing) || "its original audience"}. Delete and re-send to
 reach a different audience.
 </div>
 ) : (
 <div className="mb-5">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">
 Send to <span className="text-rose-500" aria-hidden="true">*</span>
 </span>

 <div className="mb-3 grid gap-2 sm:grid-cols-3">
 {AUDIENCE_CHOICES.map((choice) => (
 <button
 key={choice.value}
 type="button"
 onClick={() => {
 setForm((f) => ({ ...f, audienceType: choice.value }));
 setAudienceError(null);
 }}
 aria-pressed={form.audienceType === choice.value}
 className={`rounded-xl border px-3 py-2.5 text-left transition ${
 form.audienceType === choice.value
 ? "border-brand bg-brand-light"
 : "border-gray-200 bg-white hover:bg-gray-50"
 }`}
 >
 <span className="block text-sm font-medium text-gray-900">{choice.label}</span>
 <span className="mt-0.5 block text-xs text-gray-500">{choice.hint}</span>
 </button>
 ))}
 </div>

 {form.audienceType === "Specific" && (
 <MultiSelect
 options={employeeOptions}
 value={form.recipientIds}
 onChange={(recipientIds) => {
 setForm((f) => ({ ...f, recipientIds }));
 setAudienceError(null);
 }}
 placeholder="Select employees…"
 searchPlaceholder="Search employees…"
 emptyMessage="No employees match"
 />
 )}

 {form.audienceType === "Department" && (
 <>
 <SearchableSelect
 options={departmentOptions}
 value={form.audienceDepartmentId}
 onChange={(audienceDepartmentId) => {
 setForm((f) => ({ ...f, audienceDepartmentId }));
 setAudienceError(null);
 }}
 placeholder="Select a department…"
 searchPlaceholder="Search departments…"
 emptyMessage="No departments match"
 />
 {departmentHeadcount !== null && (
 <p className="mt-2 text-xs text-gray-500">
 {departmentHeadcount} active {departmentHeadcount === 1 ? "person" : "people"} will be
 notified.
 </p>
 )}
 </>
 )}

 {form.audienceType === "All" && (
 <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
 Every active employee will be notified.
 </p>
 )}

 {audienceError && <p className="mt-2 text-xs text-rose-500">{audienceError}</p>}
 </div>
 )}

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

 {/* A right-hand drawer, not a centred dialog: the reader is working
     through a list, and a drawer keeps that list in place beside the
     message instead of covering it. Shared with the header bell so a
     notification reads identically wherever it was opened from. */}
 <NotificationDetailPanel notification={viewing} onClose={() => setViewing(null)} />

 <ConfirmDialog
 open={!!deleteTarget}
 title={`Delete "${deleteTarget?.title}"?`}
 description={
 deleteTarget?.recipientCount != null
 ? `This will remove it from all ${deleteTarget.recipientCount} recipients' bells. This action cannot be undone.`
 : "This notification will be removed for everyone who received it. This action cannot be undone."
 }
 confirmLabel="Delete"
 tone="danger"
 loading={deleting}
 onConfirm={handleDelete}
 onCancel={() => setDeleteTarget(null)}
 />
 </DashboardLayout>
 );
}