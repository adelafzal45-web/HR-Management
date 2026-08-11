// Salary Structures (spec §3) and how they attach to people:
//   • the structure itself — a named, ordered bundle of components;
//   • scope-priority assignments (§12/§13) — company / job_category / department
//     / designation / employee, each with an optional BASIC override and an
//     effective window;
//   • per-employee component overrides (§12) — the narrowest scope.
//
// Structures list is a BARE ARRAY (client-side filter/paginate). The component
// builder edits a local draft and, on save, diffs it against the persisted
// structure — the same add/remove/update reconciliation the Roles screen uses
// for its permission join table — so editing an existing structure issues only
// the nested calls that actually changed.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Users2,
  SlidersHorizontal,
  X,
  GripVertical,
} from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import StatusBadge from "@/components/common/StatusBadge";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import {
  salaryStructuresApi,
  SCOPE_TYPES,
  type SalaryStructure,
  type StructureComponent,
  type StructureComponentPayload,
  type SalaryStructurePayload,
  type StructureAssignment,
  type AssignmentPayload,
  type EmployeeOverride,
  type EmployeeOverridePayload,
  type ScopeType,
} from "@/modules/payroll/api/salaryStructuresApi";
import {
  salaryComponentsApi,
  CALCULATION_TYPES,
  type SalaryComponent,
  type CalculationType,
} from "@/modules/payroll/api/salaryComponentsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import { departmentsApi, designationsApi, jobCategoriesApi } from "@/modules/settings/api/settingsApi";
import { money, humanize, shortDate } from "@/modules/payroll/utils/format";

const selectClass =
  "w-full rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60";

// ---------------------------------------------------------------------------
// Component builder draft — one row per component attached to the structure.
// `structure_component_id` is present only for rows that already exist on the
// server, which is how the save diff tells adds from updates.
// ---------------------------------------------------------------------------
type ComponentDraft = {
  key: string;
  component_id: string;
  structure_component_id?: string;
  override_calculation_type: CalculationType | "";
  override_amount: string;
  display_order: number;
};

let draftSeq = 0;
const draftKey = () => `d${++draftSeq}`;

function toDraft(sc: StructureComponent): ComponentDraft {
  return {
    key: draftKey(),
    component_id: sc.component_id,
    structure_component_id: sc.structure_component_id,
    override_calculation_type: sc.override_calculation_type ?? "",
    override_amount: sc.override_amount != null ? String(sc.override_amount) : "",
    display_order: sc.display_order,
  };
}

function draftToPayload(d: ComponentDraft, order: number): StructureComponentPayload {
  return {
    component_id: d.component_id,
    override_calculation_type: d.override_calculation_type || undefined,
    override_amount: d.override_amount !== "" ? Number(d.override_amount) : undefined,
    display_order: order,
  };
}

export default function SalaryStructuresPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [rows, setRows] = useState<SalaryStructure[]>([]);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Structure builder modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryStructure | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [draft, setDraft] = useState<ComponentDraft[]>([]);
  const [addComponentId, setAddComponentId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SalaryStructure | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Assignment + override managers (own modals below)
  const [assignFor, setAssignFor] = useState<SalaryStructure | null>(null);
  const [overridesOpen, setOverridesOpen] = useState(false);

  const componentsById = useMemo(
    () => new Map(components.map((c) => [c.component_id, c])),
    [components],
  );

  const load = () => {
    setLoading(true);
    salaryStructuresApi
      .list()
      .then(setRows)
      .catch(() => toast.showError("Couldn't load salary structures."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    salaryComponentsApi.list().then(setComponents).catch(() => setComponents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setPage(1), [search, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  useEffect(() => setTotal(filtered.length), [filtered]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setIsActive(true);
    setDraft([]);
    setAddComponentId("");
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (s: SalaryStructure) => {
    setEditing(s);
    setName(s.name);
    setDescription(s.description ?? "");
    setIsActive(s.is_active);
    setDraft([...s.components].sort((a, b) => a.display_order - b.display_order).map(toDraft));
    setAddComponentId("");
    setFormError(null);
    setModalOpen(true);
  };

  const addDraftComponent = () => {
    if (!addComponentId) return;
    if (draft.some((d) => d.component_id === addComponentId)) {
      toast.showWarning("That component is already in this structure.");
      return;
    }
    setDraft((prev) => [
      ...prev,
      {
        key: draftKey(),
        component_id: addComponentId,
        override_calculation_type: "",
        override_amount: "",
        display_order: prev.length,
      },
    ]);
    setAddComponentId("");
  };

  const removeDraftComponent = (key: string) =>
    setDraft((prev) => prev.filter((d) => d.key !== key));

  const patchDraft = (key: string, patch: Partial<ComponentDraft>) =>
    setDraft((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  // Reconcile the local draft with what's persisted: create/patch the structure
  // shell, then add new component rows, patch changed ones, delete removed ones.
  const persistEditComponents = async (structureId: string, original: StructureComponent[]) => {
    const originalById = new Map(original.map((c) => [c.structure_component_id, c]));
    const keptIds = new Set(
      draft.filter((d) => d.structure_component_id).map((d) => d.structure_component_id!),
    );

    const ops: Promise<unknown>[] = [];

    // Removed rows
    for (const c of original) {
      if (!keptIds.has(c.structure_component_id)) {
        ops.push(salaryStructuresApi.removeComponent(structureId, c.structure_component_id));
      }
    }
    // Added + updated rows
    draft.forEach((d, idx) => {
      const payload = draftToPayload(d, idx);
      if (!d.structure_component_id) {
        ops.push(salaryStructuresApi.addComponent(structureId, payload));
      } else {
        const prev = originalById.get(d.structure_component_id);
        const changed =
          !prev ||
          (prev.override_calculation_type ?? "") !== d.override_calculation_type ||
          (prev.override_amount != null ? String(prev.override_amount) : "") !== d.override_amount ||
          prev.display_order !== idx;
        if (changed) {
          ops.push(
            salaryStructuresApi.updateComponent(structureId, d.structure_component_id, payload),
          );
        }
      }
    });

    await Promise.all(ops);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setFormError("Structure name is required.");
    if (draft.length === 0) return setFormError("Add at least one component.");

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await salaryStructuresApi.update(editing.structure_id, {
          name: name.trim(),
          description: description.trim() || undefined,
          is_active: isActive,
        });
        await persistEditComponents(editing.structure_id, editing.components);
        toast.showSuccess("Structure updated.");
      } else {
        const payload: SalaryStructurePayload = {
          name: name.trim(),
          description: description.trim() || undefined,
          is_active: isActive,
          components: draft.map((d, idx) => draftToPayload(d, idx)),
        };
        await salaryStructuresApi.create(payload);
        toast.showSuccess("Structure created.");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await salaryStructuresApi.remove(deleteTarget.structure_id);
      toast.showSuccess("Structure deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete structure.");
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<SalaryStructure>[] = [
    {
      key: "name",
      label: "Structure",
      render: (s) => (
        <div className="min-w-0">
          <span className="block font-medium text-gray-900">{s.name}</span>
          {s.description && (
            <span className="block truncate text-xs text-gray-400">{s.description}</span>
          )}
        </div>
      ),
    },
    {
      key: "components",
      label: "Components",
      render: (s) => <span className="text-gray-600">{s.components?.length ?? 0}</span>,
      align: "center",
      hideBelow: "md",
    },
    {
      key: "status",
      label: "Status",
      render: (s) => <StatusBadge status={s.is_active ? "active" : "inactive"} />,
      align: "center",
    },
  ];

  return (
    <PayrollLayout activeTab="/payroll/structures">
      <BackendStatusBanner status={status} />

      <DataTable
        columns={columns}
        rows={paged}
        rowKey={(s) => s.structure_id}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search structures…"
        emptyIcon={Layers}
        emptyTitle="No salary structures yet"
        emptyDescription="Bundle components into a structure, then assign it to a company, department, designation, job category or individual."
        page={page}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50]}
        total={total}
        onPageChange={setPage}
        toolbarRight={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOverridesOpen(true)}
              className="flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:border-brand/60 hover:text-brand-dark"
            >
              <SlidersHorizontal size={15} /> Employee Overrides
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
            >
              <Plus size={16} /> New Structure
            </button>
          </div>
        }
        actions={(s) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setAssignFor(s)}
              className="flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-brand-dark transition hover:bg-brand-light"
            >
              <Users2 size={15} /> Assign
            </button>
            <button
              type="button"
              onClick={() => openEdit(s)}
              aria-label={`Edit ${s.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(s)}
              aria-label={`Delete ${s.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      />

      {/* Structure builder */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Structure" : "New Structure"}
        description="Name the structure and choose which components it includes."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit}>
          <FormField
            label="Name"
            placeholder="e.g. Standard Staff Structure"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional…"
              rows={2}
              className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>

          {/* Component builder */}
          <div className="mb-5">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Components</span>

            <div className="mb-3 flex gap-2">
              <select
                className={selectClass}
                value={addComponentId}
                onChange={(e) => setAddComponentId(e.target.value)}
              >
                <option value="">Add a component…</option>
                {components
                  .filter((c) => !draft.some((d) => d.component_id === c.component_id))
                  .map((c) => (
                    <option key={c.component_id} value={c.component_id}>
                      {c.name} ({c.code}) · {humanize(c.type)}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={addDraftComponent}
                disabled={!addComponentId}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-light px-3 text-sm font-semibold text-brand-dark transition hover:brightness-95 disabled:opacity-50"
              >
                <Plus size={15} /> Add
              </button>
            </div>

            {draft.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
                No components yet. Add earnings and deductions above.
              </p>
            ) : (
              <ul className="space-y-2">
                {draft.map((d) => {
                  const comp = componentsById.get(d.component_id);
                  return (
                    <li
                      key={d.key}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2.5"
                    >
                      <GripVertical size={15} className="shrink-0 text-gray-300" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-900">
                          {comp?.name ?? "Unknown component"}
                        </span>
                        <span className="block font-mono text-xs text-gray-400">
                          {comp?.code} · {comp ? humanize(comp.type) : ""}
                        </span>
                      </span>

                      {/* Optional per-structure override */}
                      <select
                        className="w-36 rounded-lg bg-white px-2 py-1.5 text-xs text-gray-700 outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-brand/60"
                        value={d.override_calculation_type}
                        onChange={(e) =>
                          patchDraft(d.key, {
                            override_calculation_type: e.target.value as CalculationType | "",
                          })
                        }
                      >
                        <option value="">Default calc</option>
                        {CALCULATION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {humanize(t)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Override amt"
                        value={d.override_amount}
                        onChange={(e) => patchDraft(d.key, { override_amount: e.target.value })}
                        className="w-28 rounded-lg bg-white px-2 py-1.5 text-xs text-gray-700 outline-none ring-1 ring-gray-200 placeholder:text-gray-300 focus:ring-2 focus:ring-brand/60"
                      />
                      <button
                        type="button"
                        onClick={() => removeDraftComponent(d.key)}
                        aria-label="Remove component"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <X size={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <label className="mb-5 flex items-center gap-2.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
            />
            Active
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
                {editing ? "Save Changes" : "Create Structure"}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone. Assignments referencing this structure will be affected."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {assignFor && (
        <AssignmentsModal structure={assignFor} onClose={() => setAssignFor(null)} />
      )}

      {overridesOpen && (
        <OverridesModal components={components} onClose={() => setOverridesOpen(false)} />
      )}
    </PayrollLayout>
  );
}

// ===========================================================================
// Assignments — attach a structure to a scope with priority + effective window
// ===========================================================================

const SCOPE_LABEL: Record<ScopeType, string> = {
  company: "Company (all employees)",
  job_category: "Job Category",
  department: "Department",
  designation: "Designation",
  employee: "Employee",
};

type ScopeOption = { id: string; label: string };

function AssignmentsModal({
  structure,
  onClose,
}: {
  structure: SalaryStructure;
  onClose: () => void;
}) {
  const toast = useToast();

  const [assignments, setAssignments] = useState<StructureAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Scope option sources, loaded once.
  const [departments, setDepartments] = useState<ScopeOption[]>([]);
  const [designations, setDesignations] = useState<ScopeOption[]>([]);
  const [jobCategories, setJobCategories] = useState<ScopeOption[]>([]);
  const [employees, setEmployees] = useState<ScopeOption[]>([]);

  const [scopeType, setScopeType] = useState<ScopeType>("company");
  const [scopeId, setScopeId] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadAssignments = () => {
    setLoading(true);
    salaryStructuresApi
      .listAssignments(structure.structure_id)
      .then(setAssignments)
      .catch(() => toast.showError("Couldn't load assignments."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAssignments();
    Promise.all([
      departmentsApi.listAll().then((r) => r.data).catch(() => []),
      designationsApi.list({ pageSize: 500 }).then((r) => r.data).catch(() => []),
      jobCategoriesApi.list({ pageSize: 500 }).then((r) => r.data).catch(() => []),
      employeesApi.list({ pageSize: 500 }).then((r) => r.data).catch(() => []),
    ]).then(([depts, desigs, cats, emps]) => {
      setDepartments(depts.map((d) => ({ id: d.departmentId, label: d.name })));
      setDesignations(desigs.map((d) => ({ id: d.designationId, label: d.name })));
      setJobCategories(cats.map((c) => ({ id: c.jobCategoryId, label: c.name })));
      setEmployees(
        emps.map((e: Employee) => ({
          id: e.employeeId,
          label: `${e.firstName} ${e.lastName}${e.employeeCode ? ` — ${e.employeeCode}` : ""}`,
        })),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure.structure_id]);

  const scopeOptions: ScopeOption[] = useMemo(() => {
    switch (scopeType) {
      case "department":
        return departments;
      case "designation":
        return designations;
      case "job_category":
        return jobCategories;
      case "employee":
        return employees;
      default:
        return [];
    }
  }, [scopeType, departments, designations, jobCategories, employees]);

  // Resolve a stored scope_id to a human label for the assignment list.
  const labelForScope = (a: StructureAssignment): string => {
    if (a.scope_type === "company") return "All employees";
    const source =
      a.scope_type === "department"
        ? departments
        : a.scope_type === "designation"
          ? designations
          : a.scope_type === "job_category"
            ? jobCategories
            : employees;
    return source.find((o) => o.id === a.scope_id)?.label ?? a.scope_id ?? "—";
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (scopeType !== "company" && !scopeId)
      return setError(`Select a ${SCOPE_LABEL[scopeType].toLowerCase()}.`);
    if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom)
      return setError("End date can't be before the start date.");

    const payload: AssignmentPayload = {
      structure_id: structure.structure_id,
      scope_type: scopeType,
      scope_id: scopeType === "company" ? undefined : scopeId,
      base_salary: baseSalary !== "" ? Number(baseSalary) : undefined,
      effective_from: effectiveFrom || undefined,
      effective_to: effectiveTo || undefined,
    };

    setSaving(true);
    setError(null);
    try {
      await salaryStructuresApi.createAssignment(payload);
      toast.showSuccess("Assignment added.");
      setScopeType("company");
      setScopeId("");
      setBaseSalary("");
      setEffectiveFrom("");
      setEffectiveTo("");
      loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add assignment.");
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (id: string) => {
    setRemovingId(id);
    try {
      await salaryStructuresApi.removeAssignment(id);
      toast.showSuccess("Assignment removed.");
      loadAssignments();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't remove assignment.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Assign "${structure.name}"`}
      description="Higher-specificity scopes win: employee → designation → department → job category → company."
      maxWidth="max-w-2xl"
    >
      <form onSubmit={submit} className="mb-6 rounded-xl bg-gray-50 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Scope</span>
            <select
              className={selectClass}
              value={scopeType}
              onChange={(e) => {
                setScopeType(e.target.value as ScopeType);
                setScopeId("");
              }}
            >
              {SCOPE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>

          {scopeType !== "company" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                {SCOPE_LABEL[scopeType]}
              </span>
              <select
                className={selectClass}
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
              >
                <option value="">Select…</option>
                {scopeOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              Base Salary <span className="font-normal text-gray-400">(optional)</span>
            </span>
            <input
              type="number"
              step="0.01"
              className={selectClass}
              placeholder="Overrides BASIC"
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">From</span>
              <input
                type="date"
                className={selectClass}
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">To</span>
              <input
                type="date"
                className={selectClass}
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
              />
            </label>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:opacity-50"
          >
            <Plus size={15} /> {saving ? "Adding…" : "Add Assignment"}
          </button>
        </div>
      </form>

      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Current Assignments
      </h4>
      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No assignments yet.</p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => (
            <li
              key={a.assignment_id}
              className="flex items-center gap-3 rounded-lg border border-gray-100 p-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">
                  {humanize(a.scope_type)}: {labelForScope(a)}
                </span>
                <span className="block text-xs text-gray-400">
                  {a.base_salary != null ? `Base ${money(a.base_salary)} · ` : ""}
                  {a.effective_from ? shortDate(a.effective_from) : "always"}
                  {a.effective_to ? ` – ${shortDate(a.effective_to)}` : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeAssignment(a.assignment_id)}
                disabled={removingId === a.assignment_id}
                aria-label="Remove assignment"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ===========================================================================
// Per-employee component overrides — the narrowest scope
// ===========================================================================

function OverridesModal({
  components,
  onClose,
}: {
  components: SalaryComponent[];
  onClose: () => void;
}) {
  const toast = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [userId, setUserId] = useState("");
  const [list, setList] = useState<EmployeeOverride[]>([]);
  const [loading, setLoading] = useState(false);

  const [componentId, setComponentId] = useState("");
  const [calcType, setCalcType] = useState<CalculationType | "">("");
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    employeesApi
      .list({ pageSize: 500 })
      .then((r) => setEmployees(r.data))
      .catch(() => setEmployees([]));
  }, []);

  const loadOverrides = (uid: string) => {
    if (!uid) {
      setList([]);
      return;
    }
    setLoading(true);
    salaryStructuresApi
      .listOverrides(uid)
      .then(setList)
      .catch(() => toast.showError("Couldn't load overrides."))
      .finally(() => setLoading(false));
  };

  const onEmployeeChange = (uid: string) => {
    setUserId(uid);
    setError(null);
    loadOverrides(uid);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return setError("Select an employee.");
    if (!componentId) return setError("Select a component.");
    if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom)
      return setError("End date can't be before the start date.");

    const payload: EmployeeOverridePayload = {
      user_id: userId,
      component_id: componentId,
      override_calculation_type: calcType || undefined,
      override_amount: amount !== "" ? Number(amount) : undefined,
      effective_from: effectiveFrom || undefined,
      effective_to: effectiveTo || undefined,
    };

    setSaving(true);
    setError(null);
    try {
      await salaryStructuresApi.createOverride(payload);
      toast.showSuccess("Override saved.");
      setComponentId("");
      setCalcType("");
      setAmount("");
      setEffectiveFrom("");
      setEffectiveTo("");
      loadOverrides(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save override.");
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async (id: string) => {
    setRemovingId(id);
    try {
      await salaryStructuresApi.removeOverride(id);
      toast.showSuccess("Override removed.");
      loadOverrides(userId);
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't remove override.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Employee Component Overrides"
      description="Override a single component's calculation or amount for one employee — the narrowest, highest-priority scope."
      maxWidth="max-w-2xl"
    >
      <label className="mb-5 block">
        <span className="mb-1.5 block text-sm font-medium text-gray-700">Employee</span>
        <select
          className={selectClass}
          value={userId}
          onChange={(e) => onEmployeeChange(e.target.value)}
        >
          <option value="">Select an employee…</option>
          {employees.map((e) => (
            <option key={e.employeeId} value={e.employeeId}>
              {e.firstName} {e.lastName}
              {e.employeeCode ? ` — ${e.employeeCode}` : ""}
            </option>
          ))}
        </select>
      </label>

      {userId && (
        <>
          <form onSubmit={submit} className="mb-6 rounded-xl bg-gray-50 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Component</span>
                <select
                  className={selectClass}
                  value={componentId}
                  onChange={(e) => setComponentId(e.target.value)}
                >
                  <option value="">Select a component…</option>
                  {components.map((c) => (
                    <option key={c.component_id} value={c.component_id}>
                      {c.name} ({c.code}) · {humanize(c.type)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Calculation <span className="font-normal text-gray-400">(optional)</span>
                </span>
                <select
                  className={selectClass}
                  value={calcType}
                  onChange={(e) => setCalcType(e.target.value as CalculationType | "")}
                >
                  <option value="">Keep default</option>
                  {CALCULATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Amount <span className="font-normal text-gray-400">(optional)</span>
                </span>
                <input
                  type="number"
                  step="0.01"
                  className={selectClass}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">From</span>
                <input
                  type="date"
                  className={selectClass}
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">To</span>
                <input
                  type="date"
                  className={selectClass}
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                />
              </label>
            </div>

            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:opacity-50"
              >
                <Plus size={15} /> {saving ? "Saving…" : "Add Override"}
              </button>
            </div>
          </form>

          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Current Overrides
          </h4>
          {loading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No overrides for this employee.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((o) => (
                <li
                  key={o.override_id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 p-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">
                      {o.component?.name ?? "Component"}
                    </span>
                    <span className="block text-xs text-gray-400">
                      {o.override_calculation_type ? `${humanize(o.override_calculation_type)} · ` : ""}
                      {o.override_amount != null ? `${money(o.override_amount)} · ` : ""}
                      {o.effective_from ? shortDate(o.effective_from) : "always"}
                      {o.effective_to ? ` – ${shortDate(o.effective_to)}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeOverride(o.override_id)}
                    disabled={removingId === o.override_id}
                    aria-label="Remove override"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
