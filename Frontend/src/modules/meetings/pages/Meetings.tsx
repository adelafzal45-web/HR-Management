// Meeting Requests — schedule a meeting, invite people, notify them.
//
// One screen serving two audiences, chosen from the role rather than a query
// param (the same approach getLeaveTabs uses for the leave planner):
//
//   management (Team Lead / HR Manager / Administrator)
//     reads the org-wide GET /meetings, which is gated on `meeting.view`
//   everyone else
//     reads GET /meetings/me, which needs only a valid JWT
//
// The action gating mirrors the backend permission matrix exactly, so the UI
// never offers a button that would come back a 403: scheduling needs
// `meeting.create` (management), while editing/cancelling needs `meeting.manage`
// — which Team Leads deliberately do not hold, since it covers any meeting in
// the organisation, including ones they did not create.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Pencil, Plus, Ban } from "lucide-react";

import DashboardLayout from "@/app/layouts/DashboardLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import { PrimaryButton } from "@/components/forms/FormField";
import StatusBadge from "@/components/common/StatusBadge";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import MultiSelect from "@/components/common/MultiSelect";
import SearchableSelect, { type SelectOption } from "@/components/common/SearchableSelect";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useAuth } from "@/app/providers/AuthContext";
import { ROLES, type Role } from "@/constants/roles";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import {
  meetingsApi,
  type Meeting,
  type MeetingAudienceType,
  type MeetingStatus,
} from "../api/meetingsApi";

/** Roles that read the org-wide list and may schedule. */
const CAN_SCHEDULE: Role[] = [ROLES.TEAM_LEAD, ROLES.HR_MANAGER, ROLES.ADMINISTRATOR];

/** Roles holding `meeting.manage` — editing or cancelling anyone's meeting. */
const CAN_MANAGE: Role[] = [ROLES.HR_MANAGER, ROLES.ADMINISTRATOR];

type FormState = {
  title: string;
  /** `datetime-local` value — local wall time, converted to an instant on submit. */
  scheduledAt: string;
  location: string;
  agenda: string;
  audienceType: MeetingAudienceType;
  audienceDepartmentId: string;
  participantIds: string[];
  notifyEmail: boolean;
  notifyInApp: boolean;
};

const BLANK_FORM: FormState = {
  title: "",
  scheduledAt: "",
  location: "",
  agenda: "",
  audienceType: "Specific",
  audienceDepartmentId: "",
  participantIds: [],
  // Both channels on by default; the organizer turns either off per meeting.
  notifyEmail: true,
  notifyInApp: true,
};

const AUDIENCE_CHOICES: Array<{ value: MeetingAudienceType; label: string; hint: string }> = [
  { value: "Specific", label: "Specific people", hint: "Pick individual employees" },
  { value: "Department", label: "Whole department", hint: "Everyone active in one department" },
  { value: "All", label: "Everyone", hint: "All active employees" },
];

const STATUS_TABS: Array<MeetingStatus | ""> = ["", "Scheduled", "Completed", "Cancelled"];

/**
 * An ISO instant rendered for a `datetime-local` input, which only accepts
 * local wall time with no zone suffix. Built from the local getters rather than
 * by slicing toISOString(), which would silently shift the value by the offset.
 */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function formatWhen(iso: string): { date: string; time: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
  return {
    date: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

/** "All of Engineering" beats twelve chips for a department-wide invitation. */
function audienceLabel(meeting: Meeting): string {
  if (meeting.audienceType === "All") return "Everyone";
  if (meeting.audienceType === "Department") {
    return meeting.audienceDepartmentName
      ? `All of ${meeting.audienceDepartmentName}`
      : "One department";
  }
  return "Selected people";
}

export default function MeetingsPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const { user } = useAuth();

  const role = user?.role as Role | undefined;
  const canSchedule = !!role && CAN_SCHEDULE.includes(role);
  const canManage = !!role && CAN_MANAGE.includes(role);

  const [rows, setRows] = useState<Meeting[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | "">("Scheduled");
  const [departmentFilter, setDepartmentFilter] = useState("");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [cancelling, setCancelling] = useState<Meeting | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);

    // Employees have no org-wide read, so they go through the token-scoped
    // route. It returns a plain array, so filtering and paging happen here.
    const request = canSchedule
      ? meetingsApi.list({ search, page, pageSize, status: statusFilter || undefined, departmentId: departmentFilter })
      : meetingsApi.listMine().then((all) => {
          const term = search.trim().toLowerCase();
          const filtered = all.filter(
            (m) =>
              (!statusFilter || m.status === statusFilter) &&
              (!term ||
                m.title.toLowerCase().includes(term) ||
                m.location.toLowerCase().includes(term)),
          );
          const start = (page - 1) * pageSize;
          return { data: filtered.slice(start, start + pageSize), total: filtered.length };
        });

    request
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .catch(() => toast.showError("Couldn't load meetings."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, pageSize, statusFilter, departmentFilter, canSchedule]);

  useEffect(() => setPage(1), [search, pageSize, statusFilter, departmentFilter]);

  // Only an organizer needs the picker lists; skip both calls for employees.
  useEffect(() => {
    if (!canSchedule) return;
    departmentsApi.listAll().then((res) => setDepartments(res.data)).catch(() => undefined);
    employeesApi.list({ pageSize: 200 }).then((res) => setEmployees(res.data)).catch(() => undefined);
  }, [canSchedule]);

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

  // Shows "12 people will be invited" before the meeting is created, using the
  // departmentId filter employeesApi.list already supports — no extra endpoint.
  const departmentHeadcount = useMemo(() => {
    if (form.audienceType !== "Department" || !form.audienceDepartmentId) return null;
    return employees.filter((e) => e.departmentId === form.audienceDepartmentId).length;
  }, [employees, form.audienceType, form.audienceDepartmentId]);

  const openCreate = () => {
    setEditing(null);
    setForm(BLANK_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (meeting: Meeting) => {
    setEditing(meeting);
    setForm({
      title: meeting.title,
      scheduledAt: toLocalInput(meeting.scheduledAt),
      location: meeting.location,
      agenda: meeting.agenda,
      audienceType: meeting.audienceType,
      audienceDepartmentId: meeting.audienceDepartmentId ?? "",
      // Participant rows are snapshotted server-side; they come back only on the
      // detail response, so an edit that does not touch the audience leaves the
      // existing invitee list alone rather than resubmitting a partial one.
      participantIds: meeting.participants.map((p) => p.userId),
      notifyEmail: meeting.notifyEmail,
      notifyInApp: meeting.notifyInApp,
    });
    setFormError(null);
    setFormOpen(true);
  };

  // Validated here as well as server-side so the form reports its own problems
  // instead of relying on a 400 round-trip (same convention as LeaveRequests).
  const validate = (): string | null => {
    if (!form.title.trim()) return "Please give the meeting a title.";
    if (!form.scheduledAt) return "Please choose a date and time.";
    if (new Date(form.scheduledAt).getTime() <= Date.now())
      return "The meeting must be scheduled in the future.";
    if (form.audienceType === "Specific" && form.participantIds.length === 0)
      return "Please select at least one participant.";
    if (form.audienceType === "Department" && !form.audienceDepartmentId)
      return "Please choose a department.";
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        title: form.title.trim(),
        // The input gives local wall time; the column is timestamptz, so send a
        // real instant rather than a zoneless string.
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        location: form.location.trim(),
        agenda: form.agenda.trim(),
        audienceType: form.audienceType,
        audienceDepartmentId: form.audienceDepartmentId || null,
        participantIds: form.participantIds,
        notifyEmail: form.notifyEmail,
        notifyInApp: form.notifyInApp,
      };

      if (editing) {
        await meetingsApi.update(editing.meetingId, payload);
        toast.showSuccess("Meeting updated.");
      } else {
        await meetingsApi.create(payload);
        toast.showSuccess("Meeting scheduled and invitations sent.");
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save the meeting.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!cancelling) return;

    const reason = cancelReason.trim();
    if (!reason) {
      setCancelError("Please say why the meeting is being cancelled.");
      return;
    }

    setCancelBusy(true);
    setCancelError(null);
    try {
      await meetingsApi.cancel(cancelling.meetingId, reason);
      toast.showSuccess("Meeting cancelled and participants notified.");
      setCancelling(null);
      load();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Couldn't cancel the meeting.");
    } finally {
      setCancelBusy(false);
    }
  };

  const columns: DataTableColumn<Meeting>[] = [
    {
      key: "title",
      label: "Meeting",
      render: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{m.title}</p>
          <p className="truncate text-xs text-gray-400">
            {m.organizerName ? `Organized by ${m.organizerName}` : "—"}
          </p>
        </div>
      ),
    },
    {
      key: "when",
      label: "When",
      render: (m) => {
        const when = formatWhen(m.scheduledAt);
        return (
          <div className="min-w-0">
            <p className="whitespace-nowrap text-gray-900">{when.date}</p>
            <p className="text-xs text-gray-400">{when.time}</p>
          </div>
        );
      },
    },
    {
      key: "location",
      label: "Location / Link",
      hideBelow: "lg",
      render: (m) =>
        m.location ? (
          <span className="line-clamp-1 max-w-[220px] break-all">{m.location}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: "participants",
      label: "Participants",
      hideBelow: "md",
      render: (m) => (
        <div className="min-w-0">
          <p className="whitespace-nowrap text-gray-900">
            {m.participantCount} {m.participantCount === 1 ? "person" : "people"}
          </p>
          <p className="truncate text-xs text-gray-400">{audienceLabel(m)}</p>
        </div>
      ),
    },
    {
      key: "notify",
      label: "Notify",
      hideBelow: "xl",
      render: (m) => {
        const channels = [m.notifyEmail && "Email", m.notifyInApp && "In-app"].filter(Boolean);
        return channels.length ? (
          <span className="text-xs text-gray-500">{channels.join(" + ")}</span>
        ) : (
          <span className="text-xs text-gray-400">None</span>
        );
      },
    },
    { key: "status", label: "Status", render: (m) => <StatusBadge status={m.status} /> },
  ];

  return (
    <DashboardLayout title="Meetings" activeKey="meetings">
      <BackendStatusBanner status={status} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-full bg-gray-100 p-1 text-sm font-medium">
          {STATUS_TABS.map((t) => (
            <button
              key={t || "all"}
              type="button"
              onClick={() => setStatusFilter(t)}
              className={`min-h-9 rounded-full px-3.5 py-1.5 transition ${
                statusFilter === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
              }`}
            >
              {t || "All"}
            </button>
          ))}
        </div>

        {canSchedule && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            <Plus size={16} />
            Schedule Meeting
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(m) => m.meetingId}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by title or location…"
        emptyIcon={CalendarClock}
        emptyTitle={canSchedule ? "No meetings found" : "You have no meetings"}
        emptyDescription={
          canSchedule
            ? "Try adjusting your filters, or schedule a new meeting."
            : "Meetings you organize or are invited to will appear here."
        }
        page={page}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50]}
        total={total}
        onPageChange={setPage}
        toolbarRight={
          canSchedule ? (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
              aria-label="Filter by department"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
        actions={
          canManage
            ? (m) =>
                m.status === "Scheduled" ? (
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      aria-label={`Edit ${m.title}`}
                      className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCancelling(m);
                        setCancelReason("");
                        setCancelError(null);
                      }}
                      aria-label={`Cancel ${m.title}`}
                      className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Ban size={16} />
                    </button>
                  </div>
                ) : (
                  <span className="block text-right text-xs text-gray-400">
                    {m.status === "Cancelled" ? "Cancelled" : "Done"}
                  </span>
                )
            : undefined
        }
      />

      <Modal
        open={formOpen}
        title={editing ? "Edit meeting" : "Schedule a meeting"}
        description={
          editing
            ? "Participants are re-notified if the time, location, or invitee list changes."
            : "Invitations go out as soon as the meeting is created."
        }
        onClose={() => setFormOpen(false)}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmit}>
          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-gray-900">
              Meeting Title <span className="text-rose-600">*</span>
            </span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={200}
              required
              autoFocus
              placeholder="e.g. Quarterly Engineering Review"
              className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-gray-900">
              Meeting Date &amp; Time <span className="text-rose-600">*</span>
            </span>
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              required
              className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-gray-900">
              Location / Meeting Link
            </span>
            <input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              maxLength={255}
              placeholder="Room or meeting URL"
              className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>

          <div className="mb-4">
            <span className="mb-2 block text-sm font-medium text-gray-900">
              Participants <span className="text-rose-600">*</span>
            </span>

            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              {AUDIENCE_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, audienceType: choice.value }))}
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
                value={form.participantIds}
                onChange={(participantIds) => setForm((f) => ({ ...f, participantIds }))}
                placeholder="Select participants…"
                searchPlaceholder="Search employees…"
                emptyMessage="No employees match"
              />
            )}

            {form.audienceType === "Department" && (
              <>
                <SearchableSelect
                  options={departmentOptions}
                  value={form.audienceDepartmentId}
                  onChange={(audienceDepartmentId) =>
                    setForm((f) => ({ ...f, audienceDepartmentId }))
                  }
                  placeholder="Select a department…"
                  searchPlaceholder="Search departments…"
                  emptyMessage="No departments match"
                />
                {departmentHeadcount !== null && (
                  <p className="mt-2 text-xs text-gray-500">
                    {departmentHeadcount} active {departmentHeadcount === 1 ? "person" : "people"}{" "}
                    will be invited.
                  </p>
                )}
              </>
            )}

            {form.audienceType === "All" && (
              <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Every active employee will be invited.
              </p>
            )}
          </div>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-gray-900">Meeting Agenda</span>
            <textarea
              value={form.agenda}
              onChange={(e) => setForm((f) => ({ ...f, agenda: e.target.value }))}
              rows={3}
              placeholder="What will be covered?"
              className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>

          <fieldset className="mb-4 rounded-xl border border-gray-200 px-4 py-3">
            <legend className="px-1 text-sm font-medium text-gray-900">Notifications</legend>
            <label className="flex items-start gap-3 py-1.5">
              <input
                type="checkbox"
                checked={form.notifyInApp}
                onChange={(e) => setForm((f) => ({ ...f, notifyInApp: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-dark focus:ring-brand/60"
              />
              <span className="min-w-0">
                <span className="block text-sm text-gray-800">Send in-app notification</span>
                <span className="block text-xs text-gray-500">
                  Participants see this in their notification bell.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 py-1.5">
              <input
                type="checkbox"
                checked={form.notifyEmail}
                onChange={(e) => setForm((f) => ({ ...f, notifyEmail: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-dark focus:ring-brand/60"
              />
              <span className="min-w-0">
                <span className="block text-sm text-gray-800">Send professional email</span>
                <span className="block text-xs text-gray-500">
                  Queues a branded invitation with the agenda and joining details.
                </span>
              </span>
            </label>
          </fieldset>

          {formError && <p className="mb-4 text-sm text-rose-600">{formError}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="min-h-11 flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="flex-1">
              <PrimaryButton type="submit" loading={saving}>
                {editing ? "Save changes" : "Schedule meeting"}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!cancelling}
        title={cancelling ? `Cancel "${cancelling.title}"?` : "Cancel meeting"}
        description="Participants are notified with the reason you give below."
        onClose={() => setCancelling(null)}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCancel}>
          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-gray-900">
              Reason for cancelling <span className="text-rose-600">*</span>
            </span>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              required
              autoFocus
              placeholder="e.g. Postponed until the client confirms a date."
              className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>

          {cancelError && <p className="mb-4 text-sm text-rose-600">{cancelError}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCancelling(null)}
              className="min-h-11 flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Keep meeting
            </button>
            <div className="flex-1">
              <PrimaryButton type="submit" loading={cancelBusy}>
                Cancel meeting
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

    </DashboardLayout>
  );
}
