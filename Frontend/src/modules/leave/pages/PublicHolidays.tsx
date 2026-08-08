import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Plus, Pencil, Trash2 } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import SectionTabs from "@/components/common/SectionTabs";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useAuth } from "@/app/providers/AuthContext";
import { getLeaveTabs } from "@/config/featureTabs";
import { holidaysApi, type Holiday, type HolidayPayload } from "@/modules/leave/api/holidaysApi";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";

type FormState = {
  name: string;
  holidayDate: string;
  description: string;
  departmentId: string;
  isRecurring: boolean;
};

const EMPTY_FORM: FormState = { name: "", holidayDate: "", description: "", departmentId: "", isRecurring: false };

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function PublicHolidaysPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const { user } = useAuth();
  const tabs = getLeaveTabs(user?.role);

  const [rows, setRows] = useState<Holiday[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [departmentFilter, setDepartmentFilter] = useState("");

  const [departments, setDepartments] = useState<Department[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    holidaysApi
      .list({ search, page, pageSize, year, departmentId: departmentFilter || undefined })
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .catch(() => toast.showError("Couldn't load holidays."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, pageSize, year, departmentFilter]);

  useEffect(() => setPage(1), [search, pageSize, year, departmentFilter]);

  useEffect(() => {
    departmentsApi.listAll().then((res) => setDepartments(res.data)).catch(() => undefined);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, holidayDate: `${year}-01-01` });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (holiday: Holiday) => {
    setEditing(holiday);
    setForm({
      name: holiday.name,
      holidayDate: holiday.holidayDate,
      description: holiday.description,
      departmentId: holiday.departmentId ?? "",
      isRecurring: holiday.isRecurring,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Holiday name is required.");
      return;
    }
    if (!form.holidayDate) {
      setFormError("Holiday date is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload: HolidayPayload = {
      name: form.name.trim(),
      holidayDate: form.holidayDate,
      description: form.description.trim() || undefined,
      departmentId: form.departmentId || null,
      isRecurring: form.isRecurring,
    };
    try {
      if (editing) {
        await holidaysApi.update(editing.holidayId, payload);
        toast.showSuccess("Holiday updated.");
      } else {
        await holidaysApi.create(payload);
        toast.showSuccess("Holiday created.");
      }
      setModalOpen(false);
      load();
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
      await holidaysApi.remove(deleteTarget.holidayId);
      toast.showSuccess("Holiday deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete holiday.");
    } finally {
      setDeleting(false);
    }
  };

  const columnFilters = useMemo(() => ({ scope: departmentFilter }), [departmentFilter]);
  const scopeOptions = useMemo(
    () => departments.map((d) => ({ value: d.departmentId, label: d.name })),
    [departments],
  );

  const columns: DataTableColumn<Holiday>[] = [
    {
      key: "name",
      label: "Holiday",
      render: (h) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{h.name}</p>
          {h.description && <p className="truncate text-xs text-gray-400">{h.description}</p>}
        </div>
      ),
    },
    { key: "date", label: "Date", render: (h) => formatDate(h.holidayDate) },
    {
      key: "scope",
      label: "Scope",
      hideBelow: "md",
      render: (h) =>
        h.departmentId ? (
          <span className="text-gray-700">{h.departmentName}</span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-brand-light/60 px-2.5 py-0.5 text-xs font-medium text-brand-dark">
            Company-wide
          </span>
        ),
      filterable: true,
      filterOptions: scopeOptions,
      filterPlaceholder: "All departments",
    },
    {
      key: "recurring",
      label: "Recurring",
      align: "center",
      hideBelow: "lg",
      render: (h) =>
        h.isRecurring ? (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            Yearly
          </span>
        ) : (
          <span className="text-gray-400">One-off</span>
        ),
    },
  ];

  return (
    <DashboardLayout title="Public Holidays" activeKey="leave">
      <BackendStatusBanner status={status} />
      <SectionTabs tabs={tabs} active="public-holidays" />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(h) => h.holidayId}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search holidays…"
        emptyIcon={CalendarDays}
        emptyTitle="No holidays yet"
        emptyDescription="Add your organization's public holidays so they're excluded from leave and shown on the planner."
        page={page}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50]}
        total={total}
        onPageChange={setPage}
        unifiedFilter
        filters={columnFilters}
        onFiltersChange={(next) => setDepartmentFilter(next.scope ?? "")}
        extraFilterCount={year !== CURRENT_YEAR ? 1 : 0}
        onClearExtraFilters={() => setYear(CURRENT_YEAR)}
        extraFilters={
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Year</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        }
        toolbarRight={
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            <Plus size={16} /> Add Holiday
          </button>
        }
        actions={(h) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => openEdit(h)}
              aria-label={`Edit ${h.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(h)}
              aria-label={`Delete ${h.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Holiday" : "Add Holiday"}
        description={editing ? "Update this holiday's details." : "Add a public holiday to the calendar."}
      >
        <form onSubmit={handleSubmit}>
          <FormField
            label="Holiday Name"
            placeholder="e.g. New Year's Day"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <FormField
            label="Date"
            type="date"
            value={form.holidayDate}
            onChange={(e) => setForm((f) => ({ ...f, holidayDate: e.target.value }))}
            required
          />
          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Scope</span>
            <select
              value={form.departmentId}
              onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
              className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
            >
              <option value="">Company-wide (all departments)</option>
              {departments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional notes about this holiday"
              rows={2}
              className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>
          <label className="mb-5 flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.isRecurring}
              onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
            />
            <span className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">Recurs yearly</span>
              <span className="mt-0.5 block text-xs text-gray-400">
                Applies on the same month and day every year — enter it once.
              </span>
            </span>
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
                {editing ? "Save Changes" : "Create Holiday"}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This holiday will no longer be excluded from leave calculations. This action cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}

