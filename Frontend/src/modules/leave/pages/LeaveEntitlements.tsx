import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Users,
  UserRound,
  Building2,
  IdCard,
  Search,
  X,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import SectionTabs from "@/components/common/SectionTabs";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useAuth } from "@/app/providers/AuthContext";
import { getLeaveTabs } from "@/config/featureTabs";
import {
  leaveEntitlementAssignmentApi,
  type EntitlementMode,
  type EntitlementTarget,
  type BalancePreviewRow,
} from "@/modules/leave/api/leaveEntitlementAssignmentApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import {
  departmentsApi,
  designationsApi,
  leaveTypesApi,
  type Department,
  type Designation,
  type LeaveType,
} from "@/modules/settings/api/settingsApi";

// The four ways a group can be selected. Exactly one is active at a time; the
// backend's EntitlementTargetDto enforces the same "exactly one selection"
// rule, so the UI mirrors it as a single radio group rather than four
// independent inputs that could disagree.
type TargetKind = "single" | "multiple" | "department" | "designation";

const TARGET_KINDS: { key: TargetKind; label: string; icon: typeof Users }[] = [
  { key: "single", label: "Single Employee", icon: UserRound },
  { key: "multiple", label: "Multiple Employees", icon: Users },
  { key: "department", label: "Department", icon: Building2 },
  { key: "designation", label: "Designation", icon: IdCard },
];

const MODES: { key: EntitlementMode; label: string; hint: string }[] = [
  { key: "set", label: "Add / Set", hint: "Set the yearly entitlement to this many days." },
  { key: "increase", label: "Increase", hint: "Add these days on top of the current entitlement." },
  { key: "deduct", label: "Deduct", hint: "Subtract these days from the current entitlement." },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60";

function fullName(e: Employee): string {
  return `${e.firstName} ${e.lastName}`.trim() || e.employeeCode || "Unnamed";
}

/** Projected new allocation for a preview row under the chosen mode/days. */
function projectAllocation(row: BalancePreviewRow, mode: EntitlementMode, days: number, allowNegative: boolean): number {
  const raw =
    mode === "set" ? days : mode === "increase" ? row.currentAllocated + days : row.currentAllocated - days;
  return allowNegative ? raw : Math.max(0, raw);
}

export default function LeaveEntitlementsPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const { user } = useAuth();
  const tabs = getLeaveTabs(user?.role);

  // ---- Reference data ----------------------------------------------------
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // ---- Target selection --------------------------------------------------
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [targetKind, setTargetKind] = useState<TargetKind>("single");
  const [singleUserId, setSingleUserId] = useState("");
  const [multiUserIds, setMultiUserIds] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [excludeUserIds, setExcludeUserIds] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");

  // ---- Assignment parameters --------------------------------------------
  const [mode, setMode] = useState<EntitlementMode>("set");
  const [days, setDays] = useState<string>("14");
  const [allowNegative, setAllowNegative] = useState(false);
  const [note, setNote] = useState("");

  // ---- Preview / result state -------------------------------------------
  const [preview, setPreview] = useState<BalancePreviewRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    leaveTypesApi
      .listAll()
      .then((list) => {
        setLeaveTypes(list);
        if (list.length > 0) setLeaveTypeId((cur) => cur || list[0].leaveTypeId);
      })
      .catch(() => toast.showError("Couldn't load leave types."));
    departmentsApi.listAll().then((res) => setDepartments(res.data)).catch(() => undefined);
    designationsApi.list({ pageSize: 1000 }).then((res) => setDesignations(res.data)).catch(() => undefined);
    employeesApi.list({ pageSize: 1000 }).then((res) => setEmployees(res.data)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any change to the target definition invalidates a stale preview so the
  // numbers on screen always match the current selection.
  const invalidatePreview = () => setPreview(null);

  const filteredEmployees = useMemo(() => {
    const needle = employeeSearch.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((e) =>
      [fullName(e), e.employeeCode, e.departmentName, e.designationName].join(" ").toLowerCase().includes(needle),
    );
  }, [employees, employeeSearch]);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.employeeId, e])), [employees]);

  const buildTarget = (): EntitlementTarget | null => {
    const exclude = excludeUserIds.length > 0 ? excludeUserIds : undefined;
    switch (targetKind) {
      case "single":
        return singleUserId ? { userId: singleUserId } : null;
      case "multiple":
        return multiUserIds.length > 0 ? { userIds: multiUserIds, excludeUserIds: exclude } : null;
      case "department":
        return departmentId ? { departmentId, excludeUserIds: exclude } : null;
      case "designation":
        return designationId ? { designationId, excludeUserIds: exclude } : null;
      default:
        return null;
    }
  };

  const targetReady = buildTarget() !== null && !!leaveTypeId;
  const numericDays = Number(days);
  const daysValid = Number.isFinite(numericDays) && numericDays >= 0;

  const toggleMulti = (id: string) => {
    invalidatePreview();
    setMultiUserIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const toggleExclude = (id: string) => {
    invalidatePreview();
    setExcludeUserIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const handlePreview = async () => {
    const target = buildTarget();
    if (!target || !leaveTypeId) {
      setError("Choose a leave type and a target group first.");
      return;
    }
    setError(null);
    setPreviewing(true);
    try {
      const rows = await leaveEntitlementAssignmentApi.preview({ leaveTypeId, year, target });
      setPreview(rows);
      if (rows.length === 0) setError("No employees matched this target.");
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Couldn't load the balance preview.");
    } finally {
      setPreviewing(false);
    }
  };

  const handleAssign = async () => {
    const target = buildTarget();
    if (!target || !leaveTypeId) {
      setError("Choose a leave type and a target group first.");
      return;
    }
    if (!daysValid) {
      setError("Enter a valid number of days (0 or more).");
      return;
    }
    setError(null);
    setAssigning(true);
    try {
      const result = await leaveEntitlementAssignmentApi.assign({
        leaveTypeId,
        year,
        target,
        mode,
        days: numericDays,
        allowNegative,
        note: note.trim() || undefined,
      });
      toast.showSuccess(
        `Entitlement ${mode === "set" ? "set" : mode === "increase" ? "increased" : "deducted"} for ${result.processed} employee${result.processed === 1 ? "" : "s"}.`,
      );
      // Refresh the preview so the table reflects the just-applied change.
      const rows = await leaveEntitlementAssignmentApi.preview({ leaveTypeId, year, target });
      setPreview(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't assign the entitlement.");
    } finally {
      setAssigning(false);
    }
  };

  const selectedLeaveType = leaveTypes.find((lt) => lt.leaveTypeId === leaveTypeId);

  return (
    <DashboardLayout title="Leave Entitlements" activeKey="leave">
      <BackendStatusBanner status={status} />
      <SectionTabs tabs={tabs} active="entitlements" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        {/* ---- Left: define the entitlement ---- */}
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light/60 text-brand-dark">
              <CalendarClock size={18} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Define entitlement</h2>
              <p className="text-xs text-gray-400">Pick a leave type, year and who it applies to.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Leave Type</span>
              <select
                value={leaveTypeId}
                onChange={(e) => {
                  setLeaveTypeId(e.target.value);
                  invalidatePreview();
                }}
                className={selectCls}
              >
                <option value="">Select…</option>
                {leaveTypes.map((lt) => (
                  <option key={lt.leaveTypeId} value={lt.leaveTypeId}>
                    {lt.leaveTypeName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Year</span>
              <select
                value={year}
                onChange={(e) => {
                  setYear(Number(e.target.value));
                  invalidatePreview();
                }}
                className={selectCls}
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Target kind */}
          <div className="mt-5">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">Apply to</span>
            <div className="grid grid-cols-2 gap-2">
              {TARGET_KINDS.map((t) => {
                const Icon = t.icon;
                const active = targetKind === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setTargetKind(t.key);
                      invalidatePreview();
                    }}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "border-brand bg-brand-light/40 text-brand-dark"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <Icon size={16} /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target-specific selectors */}
          <div className="mt-4">
            {targetKind === "single" && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Employee</span>
                <select
                  value={singleUserId}
                  onChange={(e) => {
                    setSingleUserId(e.target.value);
                    invalidatePreview();
                  }}
                  className={selectCls}
                >
                  <option value="">Select an employee…</option>
                  {employees.map((e) => (
                    <option key={e.employeeId} value={e.employeeId}>
                      {fullName(e)} · {e.employeeCode}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {targetKind === "department" && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Department</span>
                <select
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value);
                    invalidatePreview();
                  }}
                  className={selectCls}
                >
                  <option value="">Select a department…</option>
                  {departments.map((d) => (
                    <option key={d.departmentId} value={d.departmentId}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {targetKind === "designation" && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Designation
                </span>
                <select
                  value={designationId}
                  onChange={(e) => {
                    setDesignationId(e.target.value);
                    invalidatePreview();
                  }}
                  className={selectCls}
                >
                  <option value="">Select a designation…</option>
                  {designations.map((d) => (
                    <option key={d.designationId} value={d.designationId}>
                      {d.name}
                      {d.departmentName ? ` · ${d.departmentName}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {targetKind === "multiple" && (
              <div>
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Employees ({multiUserIds.length} selected)
                </span>
                <div className="relative mb-2">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    placeholder="Search employees…"
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand/60"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-100">
                  {filteredEmployees.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-gray-400">No employees match.</p>
                  ) : (
                    filteredEmployees.map((e) => (
                      <label
                        key={e.employeeId}
                        className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2 last:border-0 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={multiUserIds.includes(e.employeeId)}
                          onChange={() => toggleMulti(e.employeeId)}
                          className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-gray-800">{fullName(e)}</span>
                          <span className="block truncate text-xs text-gray-400">
                            {e.employeeCode} · {e.departmentName}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Exclude list — only meaningful for group targets */}
          {(targetKind === "department" || targetKind === "designation" || targetKind === "multiple") && (
            <div className="mt-4">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Exclude ({excludeUserIds.length})
              </span>
              {excludeUserIds.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {excludeUserIds.map((id) => {
                    const e = employeeById.get(id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600"
                      >
                        {e ? fullName(e) : id}
                        <button type="button" onClick={() => toggleExclude(id)} aria-label="Remove exclusion">
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <details className="rounded-lg border border-gray-100">
                <summary className="cursor-pointer px-3 py-2 text-sm text-gray-500 hover:text-gray-700">
                  Choose employees to exclude
                </summary>
                <div className="max-h-44 overflow-y-auto border-t border-gray-100">
                  {employees.map((e) => (
                    <label
                      key={e.employeeId}
                      className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2 last:border-0 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={excludeUserIds.includes(e.employeeId)}
                        onChange={() => toggleExclude(e.employeeId)}
                        className="h-4 w-4 rounded border-gray-300 text-rose-500 focus:ring-rose-400"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                        {fullName(e)} · {e.employeeCode}
                      </span>
                    </label>
                  ))}
                </div>
              </details>
            </div>
          )}

          <button
            type="button"
            onClick={handlePreview}
            disabled={!targetReady || previewing}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-brand bg-brand-light/30 py-2.5 text-sm font-semibold text-brand-dark transition hover:bg-brand-light/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} className={previewing ? "animate-spin" : ""} />
            {previewing ? "Loading balances…" : "Preview current balances"}
          </button>
        </section>

        {/* ---- Right: preview + assign ---- */}
        <section className="flex flex-col gap-6">
          {/* Assignment controls */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Sparkles size={18} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Assign entitlement</h2>
                <p className="text-xs text-gray-400">{MODES.find((m) => m.key === mode)?.hint}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => {
                const active = mode === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMode(m.key)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "border-brand bg-brand-light/40 text-brand-dark"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Days</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className={selectCls}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Note (optional)
                </span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason recorded in the leave history"
                  className={selectCls}
                />
              </label>
            </div>

            {mode === "deduct" && (
              <label className="mt-3 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={allowNegative}
                  onChange={(e) => setAllowNegative(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-rose-500 focus:ring-rose-400"
                />
                <span className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">Allow negative balance</span>
                  <span className="mt-0.5 block text-xs text-gray-400">
                    By default a deduction is capped so remaining never drops below zero.
                  </span>
                </span>
              </label>
            )}

            {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

            <div className="mt-4">
              <PrimaryButton type="button" onClick={handleAssign} loading={assigning} disabled={!targetReady || !daysValid}>
                {mode === "set" ? "Set Entitlement" : mode === "increase" ? "Increase Balance" : "Deduct Balance"}
                {preview ? ` · ${preview.length} employee${preview.length === 1 ? "" : "s"}` : ""}
              </PrimaryButton>
            </div>
          </div>

          {/* Preview table */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-gray-900">
                Balance preview
                {selectedLeaveType ? <span className="text-gray-400"> · {selectedLeaveType.leaveTypeName}</span> : ""}
              </h2>
              {preview && <span className="text-xs text-gray-400">{preview.length} employees</span>}
            </div>

            {!preview ? (
              <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                <Users size={32} className="mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No preview yet</p>
                <p className="mt-1 max-w-xs text-xs text-gray-400">
                  Define a target on the left and press “Preview current balances” to see each employee’s current,
                  used and remaining days before you assign.
                </p>
              </div>
            ) : preview.length === 0 ? (
              <p className="px-6 py-14 text-center text-sm text-gray-400">No employees matched this target.</p>
            ) : (
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Employee</th>
                      <th className="px-3 py-2.5 text-right font-medium">Current</th>
                      <th className="px-3 py-2.5 text-right font-medium">Used</th>
                      <th className="px-3 py-2.5 text-right font-medium">Remaining</th>
                      <th className="px-4 py-2.5 text-right font-medium">→ New</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((row) => {
                      const projected = daysValid
                        ? projectAllocation(row, mode, numericDays, allowNegative)
                        : row.currentAllocated;
                      const changed = projected !== row.currentAllocated;
                      return (
                        <tr key={row.userId} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-900">{row.name}</p>
                            <p className="text-xs text-gray-400">
                              {row.employeeCode}
                              {row.department ? ` · ${row.department}` : ""}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{row.currentAllocated}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{row.used}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{row.remaining}</td>
                          <td
                            className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                              changed ? "text-brand-dark" : "text-gray-400"
                            }`}
                          >
                            {projected}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
