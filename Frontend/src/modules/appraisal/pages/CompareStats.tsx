// ============================================================================
// Compare Employees (HR / Admin) — department-scoped picker over the shared
// comparison view.
//
// This screen owns selection, fetching and export; `CompareResultView` owns
// everything below the picker and is shared with the Team Lead roster, so a
// comparison ranks identically from either entry point.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, Download, TrendingUp, Loader2 } from "lucide-react";

import DashboardLayout from "@/app/layouts/DashboardLayout";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import SectionTabs from "@/components/common/SectionTabs";
import EmptyState from "@/components/common/EmptyState";
import { type SelectOption } from "@/components/common/SearchableSelect";
import MultiSelect from "@/components/common/MultiSelect";
import { getAppraisalTabs } from "@/config/featureTabs";
import { appraisalStatsApi, type CompareResult } from "@/modules/appraisal/api/appraisalApi";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import CompareResultView from "@/modules/appraisal/components/CompareResultView";

const COMPARE_MIN = 2;
const COMPARE_MAX = 6;

export default function CompareStats() {
  const { user } = useAuth();
  const { showError, showSuccess } = useToast();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingEmps, setLoadingEmps] = useState(false);

  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [exporting, setExporting] = useState(false);

  // Load departments on mount
  useEffect(() => {
    let cancelled = false;
    departmentsApi
      .listAll()
      .then((result) => {
        if (cancelled) return;
        setDepartments(result.data.filter((d) => d.status === "active"));
      })
      .catch(() => {
        if (!cancelled) showError("Could not load departments.");
      })
      .finally(() => {
        if (!cancelled) setLoadingDepts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showError]);

  // Load employees when the selected departments change
  useEffect(() => {
    if (selectedDepts.length === 0) {
      setEmployees([]);
      setSelectedEmpIds([]);
      return;
    }

    let cancelled = false;
    setLoadingEmps(true);
    // One scoped fetch per department, run in parallel — the employees API takes
    // a single departmentId. The viewer's own scope still applies to each call,
    // so a Team Lead only ever gets their team members back.
    Promise.all(
      selectedDepts.map((deptId) =>
        employeesApi.list({ departmentId: deptId, status: "active", pageSize: 500 }),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        // Merge and dedupe by id (a person can surface under more than one scoped
        // fetch), preserving encounter order.
        const byId = new Map<string, Employee>();
        for (const result of results) {
          for (const emp of result.data) byId.set(emp.employeeId, emp);
        }
        const merged = [...byId.values()];
        setEmployees(merged);
        // Keep any selections that are still visible under the new department set;
        // drop the rest rather than clearing everything the user picked.
        const visible = new Set(merged.map((e) => e.employeeId));
        setSelectedEmpIds((prev) => prev.filter((id) => visible.has(id)));
      })
      .catch(() => {
        if (!cancelled) showError("Could not load employees.");
      })
      .finally(() => {
        if (!cancelled) setLoadingEmps(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDepts, showError]);

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
        value: emp.employeeId,
        label: `${emp.firstName} ${emp.lastName}`,
        hint: `${emp.employeeCode} · ${emp.designationName}`,
      })),
    [employees],
  );

  const runComparison = useCallback(async () => {
    if (selectedEmpIds.length < COMPARE_MIN || selectedEmpIds.length > COMPARE_MAX) {
      showError(`Select between ${COMPARE_MIN} and ${COMPARE_MAX} employees to compare.`);
      return;
    }

    setComparing(true);
    setCompareResult(null);

    try {
      const result = await appraisalStatsApi.compare(selectedEmpIds, {});
      setCompareResult(result);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setComparing(false);
    }
  }, [selectedEmpIds, showError]);

  const exportExcel = useCallback(async () => {
    if (!compareResult || selectedEmpIds.length < COMPARE_MIN) return;

    setExporting(true);
    try {
      await appraisalStatsApi.exportCompareExcel(selectedEmpIds, {});
      showSuccess("Comparison exported to Excel.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }, [compareResult, selectedEmpIds, showError, showSuccess]);

  const canCompare = selectedEmpIds.length >= COMPARE_MIN && selectedEmpIds.length <= COMPARE_MAX;

  return (
    <DashboardLayout title="Compare Employees" activeKey="appraisal">
      <SectionTabs tabs={getAppraisalTabs(user?.role)} active="compare" />

      <div className="space-y-6">
        {/* Selection Panel */}
        <div className="rounded-2xl bg-gradient-to-br from-white to-gray-50 p-6 shadow-sm ring-1 ring-gray-100">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <Users size={18} className="text-brand-dark" />
                Employee Selection
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Pick one or more departments, then select {COMPARE_MIN} to {COMPARE_MAX} employees to compare performance
              </p>
            </div>
            {selectedEmpIds.length > 0 && (
              <span className="rounded-full bg-brand-light px-3 py-1 text-sm font-semibold text-brand-dark">
                {selectedEmpIds.length} selected
              </span>
            )}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
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
              min={COMPARE_MIN}
              max={COMPARE_MAX}
              emptyMessage="No employees found in the selected departments."
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runComparison}
              disabled={!canCompare || comparing}
              className="flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-dark px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {comparing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Comparing…
                </>
              ) : (
                <>
                  <TrendingUp size={16} />
                  Compare Performance
                </>
              )}
            </button>

            {compareResult && (
              <button
                type="button"
                onClick={exportExcel}
                disabled={exporting}
                className="flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:border-brand/60 hover:bg-brand-light/40 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Exporting…
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    Export to Excel
                  </>
                )}
              </button>
            )}

            {!canCompare && selectedEmpIds.length > 0 && (
              <p className="text-sm text-amber-600">
                Select {selectedEmpIds.length < COMPARE_MIN ? `${COMPARE_MIN - selectedEmpIds.length} more` : `fewer`} employee{selectedEmpIds.length < COMPARE_MIN ? "s" : ""} to compare
              </p>
            )}
          </div>
        </div>

        {/* Results */}
        {!compareResult && !comparing && (
          <EmptyState
            icon={Users}
            title="Ready to Compare"
            description={`Pick one or more departments, select ${COMPARE_MIN} to ${COMPARE_MAX} employees, then hit Compare to see performance side by side.`}
          />
        )}

        {comparing && (
          <div className="flex items-center justify-center rounded-2xl bg-white p-12 shadow-sm ring-1 ring-gray-100">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="animate-spin text-brand" />
              <p className="text-sm text-gray-500">Loading comparison data…</p>
            </div>
          </div>
        )}

        {compareResult && <CompareResultView result={compareResult} />}
      </div>
    </DashboardLayout>
  );
}
