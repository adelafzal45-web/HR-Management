import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Minus,
  TrendingDown,
  TrendingUp,
  UserRound,
} from "lucide-react";

import { LineChart, ScoreGauge } from "@/components/charts";
import EmptyState from "@/components/common/EmptyState";
import SearchableSelect, {
  type SelectOption,
} from "@/components/common/SearchableSelect";
import { employeeService } from "@/modules/employees/api/employeeService";
import { fullName, type Employee } from "@/modules/employees/types/employee.types";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";
import {
  appraisalReportsApi,
  type MyEvaluations,
} from "@/modules/appraisal/api/appraisalApi";

function StatPill({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon?: typeof TrendingUp;
  tone?: "default" | "good" | "bad";
}) {
  const valueClass = {
    default: "text-gray-900",
    good: "text-green-600",
    bad: "text-red-600",
  }[tone];

  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className={`mt-0.5 flex items-center gap-1.5 text-lg font-semibold ${valueClass}`}>
        {Icon && <Icon size={16} className="shrink-0" />}
        {value}
      </p>
    </div>
  );
}

/**
 * Per-employee performance statistics.
 *
 * This is the "one person, in depth" view; the Analytics tab is the org-wide
 * one. It deliberately does not repeat the organisation-level totals that used
 * to live here — those were the same figures Analytics already charts, and
 * having them in two tabs meant neither answered "how is this employee doing".
 *
 * Selection is department-scoped so the employee list is never an unbounded
 * fetch, mirroring the Compare tab. `employeeService` applies the viewer's own
 * scope, so a Team Lead only ever lists their roster — and the evaluations
 * endpoint re-checks that scope server-side, so a hand-crafted id still 403s
 * rather than leaking a record.
 */
export default function AppraisalStatsTab({
  onError,
}: {
  onError: (err: unknown, fallback: string) => void;
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(false);

  const [deptId, setDeptId] = useState<string | null>(null);
  const [empId, setEmpId] = useState<string | null>(null);

  const [data, setData] = useState<MyEvaluations | null>(null);
  const [loading, setLoading] = useState(false);

  // Departments load once.
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

  // Employees follow the chosen department.
  useEffect(() => {
    if (!deptId) {
      setEmployees([]);
      setEmpId(null);
      return;
    }
    let cancelled = false;
    setLoadingEmps(true);
    employeeService
      .list({ department_id: deptId, status: true, limit: 100 })
      .then((res) => {
        if (cancelled) return;
        setEmployees(res.data);
        // Drop a selection that the new department does not contain, rather
        // than leaving a name on screen whose figures came from elsewhere.
        const visible = new Set(res.data.map((e) => e.user_id));
        setEmpId((prev) => (prev && visible.has(prev) ? prev : null));
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
  }, [deptId, onError]);

  const load = useCallback(() => {
    if (!empId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    appraisalReportsApi
      .getEmployeeEvaluations(empId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        // Clear first: a 403 or a fetch failure must not leave the previous
        // employee's scores on screen under the newly picked name.
        setData(null);
        onError(err, "Could not load this employee's statistics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [empId, onError]);

  useEffect(load, [load]);

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

  const selectedName = useMemo(() => {
    const emp = employees.find((e) => e.user_id === empId);
    return emp ? fullName(emp) || emp.employee_code : "";
  }, [employees, empId]);

  /** Latest period against the one before it, in percentage points. */
  const delta = useMemo(() => {
    const trend = data?.trend ?? [];
    if (trend.length < 2) return null;
    return (
      Math.round((trend[trend.length - 1].score - trend[trend.length - 2].score) * 100) / 100
    );
  }, [data]);

  const reviewCount = data?.evaluations.length ?? 0;
  const hasEvaluations = reviewCount > 0;

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <UserRound size={15} className="text-gray-400" />
          Employee Selection
        </h4>

        <div className="grid gap-4 md:grid-cols-2">
          <SearchableSelect
            label="Department"
            placeholder={loadingDepts ? "Loading departments…" : "Select a department"}
            searchPlaceholder="Search departments…"
            options={departmentOptions}
            value={deptId}
            onChange={(value) => setDeptId(value || null)}
            disabled={loadingDepts}
            clearable
            emptyMessage="No departments available."
          />

          <SearchableSelect
            label="Employee"
            placeholder={
              !deptId
                ? "Select a department first"
                : loadingEmps
                  ? "Loading employees…"
                  : "Select an employee"
            }
            searchPlaceholder="Search by name or code…"
            options={employeeOptions}
            value={empId}
            onChange={(value) => setEmpId(value || null)}
            disabled={!deptId || loadingEmps}
            clearable
            emptyMessage="No employees found in this department."
          />
        </div>
      </div>

      {!empId ? (
        <EmptyState
          icon={UserRound}
          title="Pick an employee"
          description="Choose a department, then an employee to see their average score, per-criteria breakdown and score trend."
        />
      ) : loading ? (
        <div className="space-y-4">
          <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="h-56 animate-pulse rounded-2xl bg-gray-100" />
            <div className="h-56 animate-pulse rounded-2xl bg-gray-100" />
          </div>
        </div>
      ) : !hasEvaluations ? (
        <EmptyState
          icon={BarChart3}
          title="No evaluations yet"
          description={`${selectedName || "This employee"} has no submitted reviews, so there are no figures to show.`}
        />
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-gray-900">
                {selectedName ? `${selectedName} · Overall` : "Overall"}
              </h4>
              <span className="text-xs text-gray-400">
                {reviewCount} submitted {reviewCount === 1 ? "review" : "reviews"}
              </span>
            </div>

            <div className="grid items-center gap-5 sm:grid-cols-[auto,1fr]">
              <div className="flex justify-center">
                <ScoreGauge
                  value={data?.averageScore ?? NaN}
                  label="average score"
                  ariaLabel={`Average score for ${selectedName || "the selected employee"}: ${
                    data?.averageScore ?? "none recorded"
                  }.`}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <StatPill
                  label="Latest score"
                  value={data?.latestScore === null || data?.latestScore === undefined
                    ? "—"
                    : `${data.latestScore}%`}
                />
                <StatPill
                  label="Average score"
                  value={data?.averageScore === null || data?.averageScore === undefined
                    ? "—"
                    : `${data.averageScore}%`}
                />
                <StatPill
                  label="Vs previous period"
                  value={
                    delta === null
                      ? "—"
                      : `${delta > 0 ? "+" : ""}${delta} pts`
                  }
                  icon={
                    delta === null || delta === 0
                      ? Minus
                      : delta > 0
                        ? TrendingUp
                        : TrendingDown
                  }
                  tone={delta === null || delta === 0 ? "default" : delta > 0 ? "good" : "bad"}
                />
                <StatPill label="Criteria tracked" value={String(data?.categoryBreakdown.length ?? 0)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <h4 className="mb-3 text-sm font-semibold text-gray-900">By Criteria</h4>
              {(data?.categoryBreakdown.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-500">
                  No per-question answers were recorded on these reviews.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {data!.categoryBreakdown.map((c) => (
                    <div key={c.criteriaName}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-gray-700">{c.criteriaName}</span>
                        <span className="shrink-0 font-medium text-gray-900">
                          {c.averageScore}%{" "}
                          <span className="text-xs font-normal text-gray-400">
                            weight {c.weightage}%
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${Math.min(Math.max(c.averageScore, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <h4 className="mb-3 text-sm font-semibold text-gray-900">Score Trend</h4>
              <LineChart
                labels={(data?.trend ?? []).map((t) => t.period)}
                series={[
                  {
                    label: "Score",
                    values: (data?.trend ?? []).map((t) => t.score),
                  },
                ]}
                valueSuffix="%"
                emptyMessage="No scored reviews yet."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
