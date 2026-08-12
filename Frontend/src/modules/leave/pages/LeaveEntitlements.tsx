import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Users,
  UserRound,
  Building2,
  IdCard,
  Search,
  X,
  Check,
  ArrowLeft,
  ArrowRight,
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

/** A balance preview row tagged with which leave type it belongs to, since a
 *  bulk assignment can now span more than one leave type at once. */
type PreviewRow = BalancePreviewRow & { leaveTypeId: string; leaveTypeName: string };

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

// The whole page is one linear flow: pick what & when, pick who, pick the
// amount, then review real balances before touching anything. Each step
// shows only what's relevant to it, so nobody's staring at a dozen fields
// at once — and a step can't be reached until the one before it is valid.
type Step = 1 | 2 | 3 | 4;
const STEP_LABELS: Record<Step, string> = {
  1: "Leave type & year",
  2: "Who it applies to",
  3: "Amount",
  4: "Review & confirm",
};

export default function LeaveEntitlementsPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const { user } = useAuth();
  const tabs = getLeaveTabs(user?.role);

  const [step, setStep] = useState<Step>(1);

  // ---- Reference data ----------------------------------------------------
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // ---- Target selection --------------------------------------------------
  // Multiple leave types can be assigned in one pass — the API only accepts
  // one leave_type_id per call, so the page fans a single preview/assign
  // action out into one call per selected type and merges the results.
  const [leaveTypeIds, setLeaveTypeIds] = useState<string[]>([]);
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
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    leaveTypesApi
      .listAll()
      .then((list) => {
        setLeaveTypes(list);
        if (list.length > 0) setLeaveTypeIds((cur) => (cur.length > 0 ? cur : [list[0].leaveTypeId]));
      })
      .catch(() => toast.showError("Couldn't load leave types."));
    departmentsApi.listAll().then((res) => setDepartments(res.data)).catch(() => undefined);
    designationsApi.list({ pageSize: 1000 }).then((res) => setDesignations(res.data)).catch(() => undefined);
    employeesApi.list({ pageSize: 1000 }).then((res) => setEmployees(res.data)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any change to the target definition invalidates a stale preview so the
  // numbers on screen always match the current selection.
  const invalidatePreview = () => {
    setPreview(null);
    setAssigned(false);
  };

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

  const selectedLeaveTypes = leaveTypes.filter((lt) => leaveTypeIds.includes(lt.leaveTypeId));
  const target = buildTarget();
  const numericDays = Number(days);
  const daysValid = Number.isFinite(numericDays) && numericDays >= 0;

  const step1Valid = leaveTypeIds.length > 0;
  const step2Valid = target !== null;
  const step3Valid = daysValid;

  const toggleLeaveType = (id: string) => {
    invalidatePreview();
    setLeaveTypeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  // Once any employee already carries a balance for one of the selected
  // leave types, "Add / Set" would silently overwrite it — so once a
  // preview shows an existing balance, only Increase/Deduct stay available.
  const alreadySet = preview !== null && preview.some((row) => row.currentAllocated > 0);
  const availableModes = alreadySet ? MODES.filter((m) => m.key !== "set") : MODES;
  // Preview has one row per employee × leave type, so its length overcounts
  // people whenever more than one leave type is selected — count distinct
  // employees separately for anything shown to the user.
  const previewEmployeeCount = preview ? new Set(preview.map((row) => row.userId)).size : 0;

  useEffect(() => {
    if (alreadySet && mode === "set") setMode("increase");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadySet]);

  const targetSummary = (): string => {
    if (targetKind === "single") {
      const e = singleUserId ? employeeById.get(singleUserId) : undefined;
      return e ? fullName(e) : "No employee selected";
    }
    if (targetKind === "multiple") {
      return multiUserIds.length > 0 ? `${multiUserIds.length} employee${multiUserIds.length === 1 ? "" : "s"} selected` : "No employees selected";
    }
    if (targetKind === "department") {
      const d = departments.find((x) => x.departmentId === departmentId);
      return d ? d.name : "No department selected";
    }
    const d = designations.find((x) => x.designationId === designationId);
    return d ? d.name : "No designation selected";
  };

  const toggleMulti = (id: string) => {
    invalidatePreview();
    setMultiUserIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const toggleExclude = (id: string) => {
    invalidatePreview();
    setExcludeUserIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  // Fans one preview call out per selected leave type (the API takes a
  // single leave_type_id) and merges the rows, each tagged with the type it
  // came from, into one flat list.
  const fetchPreviewRows = async (): Promise<PreviewRow[]> => {
    if (!target || leaveTypeIds.length === 0) return [];
    const merged: PreviewRow[] = [];
    for (const id of leaveTypeIds) {
      const leaveTypeName = leaveTypes.find((lt) => lt.leaveTypeId === id)?.leaveTypeName ?? "Leave";
      const rows = await leaveEntitlementAssignmentApi.preview({ leaveTypeId: id, year, target });
      merged.push(...rows.map((row) => ({ ...row, leaveTypeId: id, leaveTypeName })));
    }
    return merged;
  };

  const runPreview = async () => {
    if (!target || leaveTypeIds.length === 0) return;
    setError(null);
    setPreviewing(true);
    try {
      const rows = await fetchPreviewRows();
      setPreview(rows);
      if (rows.length === 0) setError("No employees matched this target.");
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Couldn't load the balance preview.");
    } finally {
      setPreviewing(false);
    }
  };

  // Current balances need to be on screen as soon as the amount step opens
  // (so "already set" balances are visible before a number is even typed),
  // and the same numbers carry into the review step without a refetch.
  const goToStep = (next: Step) => {
    setStep(next);
    if ((next === 3 || next === 4) && !preview && !previewing) {
      void runPreview();
    }
  };

  const handleAssign = async () => {
    if (!target || leaveTypeIds.length === 0 || !daysValid) return;
    setError(null);
    setAssigning(true);
    try {
      for (const id of leaveTypeIds) {
        await leaveEntitlementAssignmentApi.assign({
          leaveTypeId: id,
          year,
          target,
          mode,
          days: numericDays,
          allowNegative,
          note: note.trim() || undefined,
        });
      }
      toast.showSuccess(
        `Entitlement ${mode === "set" ? "set" : mode === "increase" ? "increased" : "deducted"} for ${previewEmployeeCount} employee${previewEmployeeCount === 1 ? "" : "s"}${leaveTypeIds.length > 1 ? ` across ${leaveTypeIds.length} leave types` : ""}.`,
      );
      setAssigned(true);
      const rows = await fetchPreviewRows();
      setPreview(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't assign the entitlement.");
    } finally {
      setAssigning(false);
    }
  };

  const startOver = () => {
    setStep(1);
    setLeaveTypeIds(leaveTypes.length > 0 ? [leaveTypes[0].leaveTypeId] : []);
    setSingleUserId("");
    setMultiUserIds([]);
    setDepartmentId("");
    setDesignationId("");
    setExcludeUserIds([]);
    setEmployeeSearch("");
    setDays("14");
    setMode("set");
    setAllowNegative(false);
    setNote("");
    setPreview(null);
    setAssigned(false);
    setError(null);
  };

  return (
    <DashboardLayout title="Leave Entitlements" activeKey="leave">
      <BackendStatusBanner status={status} />
      <SectionTabs tabs={tabs} active="entitlements" />

      <div className="mx-auto max-w-3xl">
        {/* ---- Stepper ---- */}
        <ol className="mb-6 flex items-center gap-1.5 sm:gap-2">
          {([1, 2, 3, 4] as Step[]).map((s, idx) => {
            const done = step > s || (s === 4 && assigned);
            const active = step === s;
            return (
              <li key={s} className="flex flex-1 items-center gap-1.5 sm:gap-2">
                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                      done
                        ? "bg-brand text-gray-900"
                        : active
                          ? "bg-brand-dark text-white"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {done ? <Check size={15} /> : s}
                  </span>
                  <span
                    className={`hidden text-center text-[11px] font-medium leading-tight sm:block ${
                      active ? "text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {STEP_LABELS[s]}
                  </span>
                </div>
                {idx < 3 && <span className={`h-0.5 flex-1 rounded ${step > s ? "bg-brand" : "bg-gray-100"}`} />}
              </li>
            );
          })}
        </ol>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
          {/* ---- Step 1: leave type & year ---- */}
          {step === 1 && (
            <div>
              <div className="mb-5 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light/60 text-brand-dark">
                  <CalendarClock size={18} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Which leave type(s) and year?</h2>
                  <p className="text-xs text-gray-400">This sets the balance you're about to change.</p>
                </div>
              </div>

              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Leave Types ({leaveTypeIds.length} selected)
              </label>
              {leaveTypes.length === 0 ? (
                <p className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-400">
                  No leave types configured yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {leaveTypes.map((lt) => {
                    const checked = leaveTypeIds.includes(lt.leaveTypeId);
                    return (
                      <label
                        key={lt.leaveTypeId}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                          checked
                            ? "border-brand bg-brand-light/40 text-brand-dark"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLeaveType(lt.leaveTypeId)}
                          className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
                        />
                        {lt.leaveTypeName}
                      </label>
                    );
                  })}
                </div>
              )}

              <label className="mt-4 block max-w-xs">
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
          )}

          {/* ---- Step 2: who ---- */}
          {step === 2 && (
            <div>
              <div className="mb-5 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light/60 text-brand-dark">
                  <Users size={18} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Who does this apply to?</h2>
                  <p className="text-xs text-gray-400">Pick one way to select the group.</p>
                </div>
              </div>

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

              <div className="mt-4">
                {targetKind === "single" && (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                      Employee
                    </span>
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
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                      Department
                    </span>
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
                      <Search
                        size={14}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
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
            </div>
          )}

          {/* ---- Step 3: amount ---- */}
          {step === 3 && (
            <div>
              <div className="mb-5 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light/60 text-brand-dark">
                  <CalendarClock size={18} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">How many days?</h2>
                  <p className="text-xs text-gray-400">
                    {availableModes.find((m) => m.key === mode)?.hint ?? availableModes[0]?.hint}
                  </p>
                </div>
              </div>

              {alreadySet && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  A balance is already set for at least one of these employees, so "Add / Set" is hidden here —
                  use Increase or Deduct to change it instead.
                </p>
              )}

              <div className={`grid gap-2 ${availableModes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {availableModes.map((m) => {
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

              {/* ---- Current balance, so nobody has to jump to Review just to see it ---- */}
              <div className="mt-4 rounded-xl border border-gray-100">
                <div className="border-b border-gray-100 px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-gray-900">Current balance</h3>
                </div>
                {previewing && !preview ? (
                  <p className="px-6 py-8 text-center text-sm text-gray-400">Loading balances…</p>
                ) : !preview || preview.length === 0 ? (
                  <p className="px-6 py-8 text-center text-sm text-gray-400">No employees matched this target.</p>
                ) : (
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Employee</th>
                          {leaveTypeIds.length > 1 && (
                            <th className="px-3 py-2 text-left font-medium">Leave Type</th>
                          )}
                          <th className="px-3 py-2 text-right font-medium">Current</th>
                          <th className="px-4 py-2 text-right font-medium">→ New</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {preview.map((row) => {
                          const projected = daysValid
                            ? projectAllocation(row, mode, numericDays, allowNegative)
                            : row.currentAllocated;
                          const changed = projected !== row.currentAllocated;
                          return (
                            <tr key={`${row.leaveTypeId}-${row.userId}`} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-gray-800">{row.name}</td>
                              {leaveTypeIds.length > 1 && (
                                <td className="px-3 py-2 text-gray-500">{row.leaveTypeName}</td>
                              )}
                              <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                                {row.currentAllocated}
                              </td>
                              <td
                                className={`px-4 py-2 text-right font-semibold tabular-nums ${
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
            </div>
          )}

          {/* ---- Step 4: review & confirm ---- */}
          {step === 4 && (
            <div>
              <div className="mb-5 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light/60 text-brand-dark">
                  <Check size={18} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Review & confirm</h2>
                  <p className="text-xs text-gray-400">Check the numbers below before applying.</p>
                </div>
              </div>

              {/* Summary chips */}
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-gray-100 px-3 py-1.5 font-medium text-gray-600">
                  {selectedLeaveTypes.length > 0
                    ? selectedLeaveTypes.map((lt) => lt.leaveTypeName).join(", ")
                    : "—"}{" "}
                  · {year}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1.5 font-medium text-gray-600">
                  {targetSummary()}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1.5 font-medium text-gray-600">
                  {MODES.find((m) => m.key === mode)?.label} · {daysValid ? numericDays : "—"} day
                  {numericDays === 1 ? "" : "s"}
                </span>
              </div>

              {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

              <div className="rounded-xl border border-gray-100">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-gray-900">Balance preview</h3>
                  <button
                    type="button"
                    onClick={() => void runPreview()}
                    disabled={previewing}
                    className="flex items-center gap-1.5 text-xs font-medium text-brand-dark hover:underline disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={previewing ? "animate-spin" : ""} />
                    Refresh
                  </button>
                </div>

                {previewing && !preview ? (
                  <p className="px-6 py-14 text-center text-sm text-gray-400">Loading balances…</p>
                ) : !preview || preview.length === 0 ? (
                  <p className="px-6 py-14 text-center text-sm text-gray-400">No employees matched this target.</p>
                ) : (
                  <div className="max-h-80 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-medium">Employee</th>
                          {leaveTypeIds.length > 1 && (
                            <th className="px-3 py-2.5 text-left font-medium">Leave Type</th>
                          )}
                          <th className="px-3 py-2.5 text-right font-medium">Current</th>
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
                            <tr key={`${row.leaveTypeId}-${row.userId}`} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5">
                                <p className="font-medium text-gray-900">{row.name}</p>
                                <p className="text-xs text-gray-400">
                                  {row.employeeCode}
                                  {row.department ? ` · ${row.department}` : ""}
                                </p>
                              </td>
                              {leaveTypeIds.length > 1 && (
                                <td className="px-3 py-2.5 text-gray-500">{row.leaveTypeName}</td>
                              )}
                              <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                                {row.currentAllocated}
                              </td>
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

              {assigned ? (
                <div className="mt-5 flex flex-col items-center gap-3 rounded-xl bg-emerald-50 px-4 py-5 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Check size={20} />
                  </span>
                  <p className="text-sm font-medium text-emerald-700">Entitlement applied successfully.</p>
                  <button
                    type="button"
                    onClick={startOver}
                    className="rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    Start another assignment
                  </button>
                </div>
              ) : (
                <div className="mt-5">
                  <PrimaryButton
                    type="button"
                    onClick={handleAssign}
                    loading={assigning}
                    disabled={!step2Valid || !step3Valid || !preview || preview.length === 0}
                  >
                    {mode === "set" ? "Set Entitlement" : mode === "increase" ? "Increase Balance" : "Deduct Balance"}
                    {preview
                      ? ` · ${previewEmployeeCount} employee${previewEmployeeCount === 1 ? "" : "s"}${leaveTypeIds.length > 1 ? ` · ${leaveTypeIds.length} leave types` : ""}`
                      : ""}
                  </PrimaryButton>
                </div>
              )}
            </div>
          )}

          {/* ---- Nav ---- */}
          {!(step === 4 && assigned) && (
            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
                disabled={step === 1}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft size={15} /> Back
              </button>

              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => goToStep((step + 1) as Step)}
                  disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid) || (step === 3 && !step3Valid)}
                  className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next <ArrowRight size={15} />
                </button>
              ) : (
                <span className="text-xs text-gray-400">Step 4 of 4</span>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
