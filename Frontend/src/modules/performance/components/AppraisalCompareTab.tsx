import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Filter, GitCompare, Loader2, LayoutGrid, Table2 } from "lucide-react";

import EmptyState from "@/components/common/EmptyState";
import MultiSelect from "@/components/common/MultiSelect";
import { type SelectOption } from "@/components/common/SearchableSelect";
import { useAuth } from "@/app/providers/AuthContext";
import { employeeService } from "@/modules/employees/api/employeeService";
import { fullName, type Employee } from "@/modules/employees/types/employee.types";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";
import AppraisalFilterBar from "./AppraisalFilterBar";
import CompareResultView, { type CompareLayout } from "@/modules/appraisal/components/CompareResultView";
import {
  appraisalStatsApi,
  type AppraisalStatsFilters,
  type CompareResult,
} from "@/modules/appraisal/api/appraisalApi";

/** The server rejects fewer than 2 and more than 6; mirror both bounds here. */
const MIN_COMPARE = 2;
const MAX_COMPARE = 6;

/**
 * Side-by-side comparison of 2–6 employees.
 *
 * Selection is department-scoped, matching the standalone Compare page: pick one
 * or more departments, then pick people from within them. The bounds are
 * enforced in the picker as well as on the server — an unbounded list is an
 * accidental full-table scan, and a 400 after choosing a seventh person is a
 * worse experience than a control that stops accepting more.
 *
 * `employeeService` (not the mock-backed employeeApi) is used throughout so the
 * viewer's own scope applies to every fetch: a Team Lead only ever loads their
 * own team members, which is exactly the "Team Leads compare only their team"
 * rule. The backend `compare` endpoint enforces the same scope again.
 *
 * Preselected ids arrive from the results table, which already carries
 * `employeeId` per row for exactly this handoff.
 */
export default function AppraisalCompareTab({
  onError,
  initialEmployeeIds,
}: {
  onError: (err: unknown, fallback: string) => void;
  initialEmployeeIds?: string[];
}) {
  const { hasPermission } = useAuth();
  const canExport = hasPermission("appraisal.export");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(false);

  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  const [filters, setFilters] = useState<AppraisalStatsFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [layout, setLayout] = useState<CompareLayout>("cards");

  const activeFilterCount = Object.values(filters).filter((v) => v !== undefined && v !== "").length;

  // Load the department list once.
  useEffect(() => {
    let cancelled = false;
    departmentsApi
      .listAll()
      .then((res) => {
        if (!cancelled) setDepartments(res.data.filter((d) => d.status === "active"));
      })
      .catch((err) => {
        if (!cancelled) onError(err, "Could not load departments.");
      })
      .finally(() => {
        if (!cancelled) setLoadingDepts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  // Resolve ids handed over from the results table: pull each employee, seed the
  // department picker with their departments (so they appear in the scoped
  // employee list), and preselect them. Runs once per handoff.
  useEffect(() => {
    if (!initialEmployeeIds?.length) return;
    let cancelled = false;
    Promise.all(
      initialEmployeeIds.slice(0, MAX_COMPARE).map((id) =>
        employeeService.get(id).catch(() => null),
      ),
    ).then((resolved) => {
      if (cancelled) return;
      const found = resolved.filter((e): e is Employee => Boolean(e));
      const deptIds = [
        ...new Set(found.map((e) => e.department?.department_id).filter(Boolean) as string[]),
      ];
      if (deptIds.length > 0) setSelectedDepts(deptIds);
      setSelectedEmpIds(initialEmployeeIds.slice(0, MAX_COMPARE));
    });
    return () => {
      cancelled = true;
    };
  }, [initialEmployeeIds]);

  // Load employees whenever the selected departments change — one scoped fetch
  // per department, run in parallel, merged and deduped by id.
  useEffect(() => {
    if (selectedDepts.length === 0) {
      setEmployees([]);
      setSelectedEmpIds([]);
      return;
    }
    let cancelled = false;
    setLoadingEmps(true);
    Promise.all(
      selectedDepts.map((deptId) =>
        employeeService.list({ department_id: deptId, status: true, limit: 100 }),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        const byId = new Map<string, Employee>();
        for (const res of results) {
          for (const emp of res.data) byId.set(emp.user_id, emp);
        }
        const merged = [...byId.values()];
        setEmployees(merged);
        // Keep selections still visible under the new department set; drop the
        // rest rather than clearing everything the user picked.
        const visible = new Set(merged.map((e) => e.user_id));
        setSelectedEmpIds((prev) => prev.filter((id) => visible.has(id)));
      })
      .catch((err) => {
        if (!cancelled) onError(err, "Could not load employees.");
      })
      .finally(() => {
        if (!cancelled) setLoadingEmps(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDepts, onError]);

  const departmentOptions = useMemo<SelectOption[]>(
    () =>
      departments.map((dept) => ({
        value: dept.departmentId,
        label: dept.name,
        hint: dept.description || undefined,
      })),
    [departments],
  );

  const employeeOptions = useMemo<SelectOption[]>(
    () =>
      employees.map((emp) => ({
        value: emp.user_id,
        label: fullName(emp) || emp.employee_code,
        hint: `${emp.employee_code}${emp.designation?.title ? ` · ${emp.designation.title}` : ""}`,
      })),
    [employees],
  );

  const load = useCallback(() => {
    if (selectedEmpIds.length < MIN_COMPARE) {
      setResult(null);
      return;
    }
    setLoading(true);
    const { employeeId: _employeeId, status: _status, ...rest } = filters;
    appraisalStatsApi
      .compare(selectedEmpIds, rest)
      .then(setResult)
      .catch((err) => onError(err, "Could not compare the selected employees."))
      .finally(() => setLoading(false));
    // `selectedEmpIds` joined to a stable primitive so the effect keys off the
    // contents, not a fresh array reference on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpIds.join(","), filters, onError]);

  useEffect(load, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { employeeId: _employeeId, status: _status, ...rest } = filters;
      await appraisalStatsApi.exportCompareExcel(selectedEmpIds, rest);
    } catch (err) {
      onError(err, "Could not export the comparison.");
    } finally {
      setExporting(false);
    }
  };

  const canCompare = selectedEmpIds.length >= MIN_COMPARE;

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <GitCompare size={15} className="text-gray-400" />
            Employee Selection
            <span className="text-xs font-normal text-gray-400">
              {selectedEmpIds.length}/{MAX_COMPARE} — pick at least {MIN_COMPARE}
            </span>
          </h4>

          <div className="flex items-center gap-2">
            {/* Filters — icon-only */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                title="Filters"
                aria-label="Filters"
                aria-expanded={filtersOpen}
                className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                  filtersOpen || activeFilterCount > 0
                    ? "border-brand/60 bg-brand-light/20 text-brand-dark"
                    : "border-gray-200 text-gray-600 hover:border-brand/60 hover:bg-gray-50 hover:text-brand-dark"
                }`}
              >
                <Filter size={16} />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-gray-900">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {filtersOpen && (
                <>
                  {/* Click-catcher to dismiss on outside click. */}
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setFiltersOpen(false)}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                  <div className="absolute right-0 z-40 mt-2 w-[min(90vw,34rem)] rounded-2xl border border-gray-100 bg-white p-4 shadow-xl">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <Filter size={15} className="text-gray-400" />
                        Filters
                      </span>
                    </div>
                    <AppraisalFilterBar
                      value={filters}
                      onChange={setFilters}
                      showStatus={false}
                      variant="bare"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Export — icon-only. */}
            {canExport && canCompare && (
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || loading}
                title="Export to Excel"
                aria-label="Export to Excel"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:border-brand/60 hover:text-brand-dark disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <MultiSelect
            label="Departments"
            placeholder={loadingDepts ? "Loading departments…" : "Select one or more departments"}
            searchPlaceholder="Search departments…"
            options={departmentOptions}
            value={selectedDepts}
            onChange={setSelectedDepts}
            disabled={loadingDepts}
            emptyMessage="No departments available."
          />

          <MultiSelect
            label="Employees"
            placeholder={
              selectedDepts.length === 0
                ? "Select departments first"
                : loadingEmps
                  ? "Loading employees…"
                  : "Select employees to compare"
            }
            searchPlaceholder="Search by name or code…"
            options={employeeOptions}
            value={selectedEmpIds}
            onChange={setSelectedEmpIds}
            disabled={selectedDepts.length === 0 || loadingEmps}
            min={MIN_COMPARE}
            max={MAX_COMPARE}
            emptyMessage="No employees found in the selected departments."
          />
        </div>

        {/* Layout toggle — positioned below the selectors */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">View:</span>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setLayout("cards")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                layout === "cards"
                  ? "bg-brand text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              aria-pressed={layout === "cards"}
              title="Card layout with charts"
            >
              <LayoutGrid size={14} />
              Cards
            </button>
            <button
              type="button"
              onClick={() => setLayout("table")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                layout === "table"
                  ? "bg-brand text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              aria-pressed={layout === "table"}
              title="Compact comparison table"
            >
              <Table2 size={14} />
              Table
            </button>
          </div>
        </div>
      </div>

      {!canCompare ? (
        <EmptyState
          icon={GitCompare}
          title="Pick employees to compare"
          description={`Choose one or more departments, then select between ${MIN_COMPARE} and ${MAX_COMPARE} employees to see their scores side by side.`}
        />
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      ) : !result ? null : (
        <CompareResultView result={result} layout={layout} />
      )}
    </div>
  );
}
