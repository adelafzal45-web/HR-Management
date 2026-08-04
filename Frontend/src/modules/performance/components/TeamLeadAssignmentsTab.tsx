import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import FilterPanel, {
  type FilterValues,
} from "@/modules/performance/components/FilterPanel";
import { employeeService } from "@/modules/employees/api/employeeService";
import { fullName, type Employee } from "@/modules/employees/types/employee.types";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";
import {
  teamLeadAssignmentsApi,
  type TeamLeadAssignment,
  type TeamLeadAssignmentMode,
} from "@/modules/appraisal/api/appraisalApi";

/** Server-side bound on a MEMBERS list; mirrored so the picker stops before a 400. */
const MAX_MEMBERS = 200;

function MemberPicker({
  selected,
  onChange,
  departmentId,
}: {
  selected: Employee[];
  onChange: (next: Employee[]) => void;
  departmentId?: string;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Employee[]>([]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      employeeService
        .list({ search: term, limit: 10, status: true, department_id: departmentId })
        .then((res) => {
          if (!cancelled) setOptions(res.data);
        })
        // A failed lookup costs the dropdown, not the dialog — the already
        // chosen members are still submittable.
        .catch(() => {
          if (!cancelled) setOptions([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, departmentId]);

  const add = (emp: Employee) => {
    if (selected.length >= MAX_MEMBERS) return;
    if (selected.some((e) => e.user_id === emp.user_id)) return;
    onChange([...selected, emp]);
    setSearch("");
    setOptions([]);
  };

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {selected.map((emp) => (
            <span
              key={emp.user_id}
              className="flex items-center gap-1.5 rounded-full bg-brand-light px-3 py-1.5 text-sm font-medium text-brand-dark"
            >
              {fullName(emp)}
              <button
                type="button"
                onClick={() => onChange(selected.filter((e) => e.user_id !== emp.user_id))}
                aria-label={`Remove ${fullName(emp)}`}
                className="rounded-full p-0.5 transition hover:bg-brand/30"
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees to add…"
          className="w-full rounded-lg bg-gray-100 py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
        />
        {options.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-gray-200">
            {options.map((emp) => (
              <li key={emp.user_id}>
                <button
                  type="button"
                  onClick={() => add(emp)}
                  disabled={selected.some((e) => e.user_id === emp.user_id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-brand-light/40 disabled:opacity-40"
                >
                  <span className="font-medium text-gray-900">{fullName(emp)}</span>
                  <span className="font-mono text-xs text-gray-400">{emp.employee_code}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-1.5 text-xs text-gray-400">
        {selected.length}/{MAX_MEMBERS} selected
      </p>
    </div>
  );
}

/**
 * Team Lead roster grants — HR only.
 *
 * DEPARTMENT mode is the historical behaviour (the lead sees their whole
 * department) and is what every existing lead was backfilled with, so nobody's
 * visible roster changed on deploy. MEMBERS mode narrows a lead to an explicit
 * list, and is enforced on reading the roster *and* on submitting an evaluation
 * — scoping only the roster would hide an employee from the list while the
 * submit endpoint still accepted them.
 */
export default function TeamLeadAssignmentsTab({
  onError,
  onNotice,
}: {
  onError: (err: unknown, fallback: string) => void;
  onNotice: (message: string) => void;
}) {
  const [assignments, setAssignments] = useState<TeamLeadAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  /*
   * The assignment list is unpaged, so filtering happens client-side here rather
   * than as a request — there is no second page for a server filter to reach.
   */
  const [filters, setFilters] = useState<FilterValues>({});

  const [creating, setCreating] = useState(false);
  const [teamLeadId, setTeamLeadId] = useState("");
  const [mode, setMode] = useState<TeamLeadAssignmentMode>("DEPARTMENT");
  const [departmentId, setDepartmentId] = useState("");
  const [members, setMembers] = useState<Employee[]>([]);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<TeamLeadAssignment | null>(null);
  const [editMembers, setEditMembers] = useState<Employee[]>([]);
  const [pendingDelete, setPendingDelete] = useState<TeamLeadAssignment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    teamLeadAssignmentsApi
      .list()
      .then(setAssignments)
      .catch((err) => onError(err, "Could not load team lead assignments."))
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(load, [load]);

  const visibleAssignments = useMemo(() => {
    const needle = filters.search?.trim().toLowerCase();
    return assignments.filter((a) => {
      if (filters.status && a.mode !== filters.status) return false;
      if (filters.departmentId && a.departmentId !== filters.departmentId) return false;
      if (!needle) return true;
      // Members are searched too, so "who evaluates Dana?" is answerable from
      // this screen rather than by opening each card in turn.
      return (
        a.teamLeadName.toLowerCase().includes(needle) ||
        a.teamLeadEmail.toLowerCase().includes(needle) ||
        (a.departmentName?.toLowerCase().includes(needle) ?? false) ||
        a.members.some(
          (m) =>
            m.name.toLowerCase().includes(needle) ||
            m.employeeCode.toLowerCase().includes(needle),
        )
      );
    });
  }, [assignments, filters]);

  useEffect(() => {
    employeeService
      .teamLeads()
      .then(setLeads)
      .catch(() => setLeads([]));
    departmentsApi
      .list({ pageSize: 200 })
      .then((res) => setDepartments(res.data))
      .catch(() => setDepartments([]));
  }, []);

  const resetForm = () => {
    setTeamLeadId("");
    setMode("DEPARTMENT");
    setDepartmentId("");
    setMembers([]);
  };

  const create = async () => {
    setSaving(true);
    try {
      // departmentId XOR memberIds — the service rejects the wrong companion
      // field rather than ignoring it, so only send the one the mode uses.
      await teamLeadAssignmentsApi.create({
        teamLeadId,
        mode,
        departmentId: mode === "DEPARTMENT" ? departmentId : undefined,
        memberIds: mode === "MEMBERS" ? members.map((m) => m.user_id) : undefined,
      });
      onNotice("Assignment created.");
      setCreating(false);
      resetForm();
      load();
    } catch (err) {
      onError(err, "Could not create the assignment.");
    } finally {
      setSaving(false);
    }
  };

  const saveMembers = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await teamLeadAssignmentsApi.replaceMembers(
        editing.assignmentId,
        editMembers.map((m) => m.user_id),
      );
      onNotice("Members updated.");
      setEditing(null);
      load();
    } catch (err) {
      onError(err, "Could not update the members.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const result = await teamLeadAssignmentsApi.remove(pendingDelete.assignmentId);
      onNotice(result.message);
      setPendingDelete(null);
      load();
    } catch (err) {
      onError(err, "Could not remove the assignment.");
    } finally {
      setDeleting(false);
    }
  };

  /*
   * Editing members means re-picking them, and the assignment only carries the
   * lightweight member shape. Map it onto the Employee shape the picker speaks
   * rather than refetching every member individually.
   */
  const openEditor = (assignment: TeamLeadAssignment) => {
    setEditMembers(
      assignment.members.map(
        (m) =>
          ({
            user_id: m.employeeId,
            employee_code: m.employeeCode,
            first_name: m.name,
            last_name: "",
            email: m.email,
          }) as Employee,
      ),
    );
    setEditing(assignment);
  };

  const canSubmit =
    Boolean(teamLeadId) &&
    (mode === "DEPARTMENT" ? Boolean(departmentId) : members.length > 0);

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500">
        Controls which employees each Team Lead can see and evaluate.
      </p>

      <div className="mb-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <FilterPanel
          config={{
            search: true,
            searchPlaceholder: "Search by lead, email, department, member or code…",
            statusOptions: [
              { value: "DEPARTMENT", label: "Entire Department" },
              { value: "MEMBERS", label: "Assigned Team Members Only" },
            ],
            department: true,
          }}
          values={filters}
          onChange={setFilters}
          departments={departments}
          toolbarRight={
            <button
              type="button"
              onClick={() => {
                resetForm();
                setCreating(true);
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-dark px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
            >
              <Plus size={15} />
              New Assignment
            </button>
          }
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No assignments yet"
          description="Give a Team Lead their entire department, or narrow them to assigned team members only."
        />
      ) : visibleAssignments.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No assignments match these filters"
          description="Clear or widen the filters to see the rest of the assignments."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visibleAssignments.map((a) => (
            <div
              key={a.assignmentId}
              className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{a.teamLeadName}</p>
                  <p className="truncate text-xs text-gray-400">{a.teamLeadEmail}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {a.mode === "MEMBERS" && (
                    <button
                      type="button"
                      onClick={() => openEditor(a)}
                      aria-label="Edit members"
                      className="rounded-lg p-2 text-gray-400 transition hover:bg-brand-light/40 hover:text-brand-dark"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingDelete(a)}
                    aria-label="Remove assignment"
                    className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    a.mode === "DEPARTMENT"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-brand-light text-brand-dark"
                  }`}
                >
                  {a.mode === "DEPARTMENT" ? <Building2 size={12} /> : <Users size={12} />}
                  {a.mode === "DEPARTMENT" ? "Entire Department" : "Assigned Members Only"}
                </span>
                {a.mode === "DEPARTMENT" ? (
                  <span className="text-sm text-gray-600">{a.departmentName ?? "—"}</span>
                ) : (
                  <span className="text-sm text-gray-600">
                    {a.memberCount ?? a.members.length} member
                    {(a.memberCount ?? a.members.length) === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {a.mode === "MEMBERS" && a.members.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {a.members.slice(0, 6).map((m) => (
                    <span
                      key={m.employeeId}
                      className="rounded-full bg-gray-50 px-2.5 py-1 text-xs text-gray-600"
                    >
                      {m.name}
                    </span>
                  ))}
                  {a.members.length > 6 && (
                    <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs text-gray-400">
                      +{a.members.length - 6} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        title="New Assignment"
        description="Pick a Team Lead, then choose whether their evaluation scope is the entire department or assigned team members only."
        onClose={() => setCreating(false)}
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-900">Team Lead</span>
            <select
              value={teamLeadId}
              onChange={(e) => setTeamLeadId(e.target.value)}
              className="w-full rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
            >
              <option value="">Select a team lead…</option>
              {leads.map((lead) => (
                <option key={lead.user_id} value={lead.user_id}>
                  {fullName(lead)} ({lead.employee_code})
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-gray-900">
              Evaluation scope
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  [
                    "DEPARTMENT",
                    "Entire Department",
                    "Everyone active in the chosen department. One per lead.",
                    Building2,
                  ],
                  [
                    "MEMBERS",
                    "Assigned Team Members Only",
                    "Only the employees you list, regardless of department.",
                    Users,
                  ],
                ] as const
              ).map(([value, label, hint, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`rounded-xl border p-3 text-left transition ${
                    mode === value
                      ? "border-brand bg-brand-light/40"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <Icon size={14} className="text-gray-400" />
                    {label}
                    {mode === value && <Check size={14} className="ml-auto text-brand-dark" />}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          {mode === "DEPARTMENT" ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-900">Department</span>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
              >
                <option value="">Select a department…</option>
                {departments.map((d) => (
                  <option key={d.departmentId} value={d.departmentId}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-900">Members</span>
              <MemberPicker selected={members} onChange={setMembers} />
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={create}
              disabled={!canSubmit || saving}
              className="rounded-lg bg-gradient-to-r from-brand to-brand-dark px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Create assignment"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(editing)}
        title="Edit Members"
        description={
          editing
            ? `${editing.teamLeadName} will be able to see and evaluate exactly these employees.`
            : undefined
        }
        onClose={() => setEditing(null)}
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <MemberPicker selected={editMembers} onChange={setEditMembers} />
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveMembers}
              disabled={editMembers.length === 0 || saving}
              title={
                editMembers.length === 0
                  ? "A members-mode assignment needs at least one employee — remove the assignment instead."
                  : undefined
              }
              className="rounded-lg bg-gradient-to-r from-brand to-brand-dark px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save members"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove this assignment?"
        description={
          pendingDelete
            ? `${pendingDelete.teamLeadName} will lose access to these employees and can no longer evaluate them.`
            : undefined
        }
        confirmLabel="Remove"
        tone="danger"
        icon={<Trash2 size={18} />}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
