// ============================================================================
// The rendered output of `GET /appraisal/compare`.
//
// Split out of CompareStats because two screens now show the same comparison
// from different entry points: the Compare page, where employees are picked by
// department, and a Team Lead's roster, where they are ticked off the member
// cards. A side-by-side that ranks people must not rank them differently
// depending on which screen you opened it from, so there is one renderer.
//
// This component is presentational: the caller owns fetching, filters and
// export, and hands over a finished `CompareResult`.
// ============================================================================

import { useCallback, useMemo } from "react";
import {
  AlertCircle, Award, CalendarCheck, CheckCircle2, TrendingDown, TrendingUp,
} from "lucide-react";

import KpiCard from "@/components/common/KpiCard";
import { BarChart, LineChart } from "@/components/charts";
import { ScoreText } from "@/modules/appraisal/components/StatusPills";
import type { CompareEmployee, CompareResult } from "@/modules/appraisal/api/appraisalApi";

/** Podium colouring for the first three; everyone else gets neutral gray. */
const RANK_CLASS: Record<number, string> = {
  1: "bg-amber-100 text-amber-700",
  2: "bg-gray-200 text-gray-700",
  3: "bg-orange-100 text-orange-700",
};

export type CompareLayout = "cards" | "table";

export default function CompareResultView({
  result,
  /** One column on a narrow surface — the drawer on /team passes this. */
  dense = false,
  /**
   * "cards" (default) is the rich layout: bar chart, ranking, per-employee
   * cards. "table" is the compact side-by-side matrix — metrics down the rows,
   * employees across the columns — for reading exact figures at a glance.
   */
  layout = "cards",
}: {
  result: CompareResult;
  dense?: boolean;
  layout?: CompareLayout;
}) {
  /*
   * Rank comes from `ranking`, which the server sorts by score. The `employees`
   * array is in the order the ids were sent, so numbering the cards by their
   * index would hand a "#1" badge to whoever happened to be picked first.
   */
  const rankOf = useMemo(() => {
    const map = new Map<string, number>();
    result.ranking.forEach((entry) => map.set(entry.employeeId, entry.rank));
    return map;
  }, [result]);

  const groupAverage = useMemo(() => {
    const scored = result.employees.filter((emp) => emp.reviewCount > 0);
    if (scored.length === 0) return null;
    return scored.reduce((sum, emp) => sum + emp.averageScore, 0) / scored.length;
  }, [result]);

  const scoreSpread = useMemo(() => {
    if (result.ranking.length < 2) return null;
    return result.ranking[0].averageScore - result.ranking[result.ranking.length - 1].averageScore;
  }, [result]);

  // Share of forms that are no longer pending (i.e. anything past Draft) across
  // everyone in the comparison. `pendingCount` is the Draft tally, so this reads
  // straight off the per-employee totals without re-summing each status.
  const completionRate = useMemo(() => {
    const totals = result.employees.reduce(
      (acc, emp) => {
        acc.reviews += emp.reviewCount;
        acc.pending += emp.pendingCount;
        return acc;
      },
      { reviews: 0, pending: 0 },
    );
    if (totals.reviews === 0) return null;
    return ((totals.reviews - totals.pending) / totals.reviews) * 100;
  }, [result]);

  const lowest = result.ranking.length > 0 ? result.ranking[result.ranking.length - 1] : null;

  /** Bars scale against the leader so a tight cluster still reads as a gap. */
  const barWidth = useCallback(
    (score: number) => {
      const top = result.ranking[0]?.averageScore ?? 0;
      if (top <= 0) return 0;
      return Math.max((score / top) * 100, 2);
    },
    [result],
  );

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className={`grid gap-4 ${dense ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        <KpiCard
          label="Highest"
          value={result.ranking[0]?.name || "—"}
          icon={Award}
          tone="green"
          hint={
            result.ranking[0]
              ? `${result.ranking[0].averageScore.toFixed(1)}% average`
              : undefined
          }
        />
        <KpiCard
          label="Lowest"
          value={lowest?.name || "—"}
          icon={TrendingDown}
          tone="red"
          hint={
            lowest
              ? `${lowest.averageScore.toFixed(1)}% average`
              : undefined
          }
        />
        <KpiCard
          label="Average score"
          value={groupAverage !== null ? `${groupAverage.toFixed(1)}%` : "—"}
          icon={TrendingUp}
          tone="blue"
          hint={
            scoreSpread !== null
              ? `${scoreSpread.toFixed(1)} pt spread top to bottom`
              : "No scored reviews"
          }
        />
        <KpiCard
          label="Completion rate"
          value={completionRate !== null ? `${completionRate.toFixed(0)}%` : "—"}
          icon={CheckCircle2}
          hint="Forms submitted vs. still pending"
        />
      </div>

      {layout === "table" ? (
        <CompareMatrix result={result} rankOf={rankOf} groupAverage={groupAverage} />
      ) : (
      <>
      {/* Performance Comparison Chart */}
      {result.employees.length > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Performance comparison</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Average scores and attendance across compared employees
            </p>
          </div>
          <BarChart
            labels={result.employees.map((emp) => emp.name)}
            series={[
              {
                label: "Average Score",
                values: result.employees.map((emp) => emp.averageScore),
              },
              {
                label: "Attendance Rate",
                values: result.employees.map((emp) => emp.attendanceRate),
              },
            ]}
            height={dense ? 240 : 300}
            valueSuffix="%"
            showLegend
            ariaLabel={`Performance comparison for ${result.employees.length} employees`}
          />
        </section>
      )}

      {/* Ranking */}
      {result.ranking.length > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Award size={15} className="text-brand-dark" />
            Ranking
          </h3>
          <div className="space-y-2.5">
            {result.ranking.map((entry) => (
              <div key={entry.employeeId} className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    RANK_CLASS[entry.rank] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {entry.rank}
                </span>
                <span
                  className={`shrink-0 truncate text-sm font-medium text-gray-900 ${
                    dense ? "w-24" : "w-40"
                  }`}
                >
                  {entry.name}
                </span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-dark"
                    style={{ width: `${barWidth(entry.averageScore)}%` }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right text-sm">
                  <ScoreText score={Number(entry.averageScore.toFixed(1))} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Per-employee cards */}
      {result.employees.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
          <AlertCircle size={24} className="mx-auto mb-2 text-gray-400" />
          <p className="text-sm text-gray-500">
            No appraisal data found for the selected employees.
          </p>
        </div>
      ) : (
        <div className={`grid gap-4 ${dense ? "" : "lg:grid-cols-2"}`}>
          {result.employees.map((emp) => (
            <EmployeeCard
              key={emp.employeeId}
              employee={emp}
              rank={rankOf.get(emp.employeeId)}
              groupAverage={groupAverage}
            />
          ))}
        </div>
      )}

      {/* Trend */}
      {result.periods.length > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Performance trend</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Average score per review period. Gaps mean no review in that period.
            </p>
          </div>
          {/*
            The server returns the union of every period across the compared
            employees, so each series is re-indexed onto that shared axis. A
            period an employee has no review for becomes null, which the chart
            draws as a break rather than a line sloping through zero.
          */}
          <LineChart
            labels={result.periods}
            series={result.employees.map((emp) => {
              const byPeriod = new Map(emp.trend.map((t) => [t.period, t.averageScore]));
              return {
                label: emp.name,
                values: result.periods.map((period) => byPeriod.get(period) ?? null),
              };
            })}
            height={dense ? 240 : 320}
            valueSuffix="%"
            emptyMessage="No scored evaluations for these employees in this range."
            ariaLabel={`Performance trend for ${result.employees.length} employees across ${result.periods.length} periods.`}
          />
        </section>
      )}
      </>
      )}
    </div>
  );
}

function EmployeeCard({
  employee,
  rank,
  groupAverage,
}: {
  employee: CompareEmployee;
  rank: number | undefined;
  groupAverage: number | null;
}) {
  // Distance from the group mean is the one number a side-by-side card can give
  // that a lone profile page cannot, so it is stated rather than left to be
  // eyeballed across two columns.
  const delta =
    groupAverage !== null && employee.reviewCount > 0
      ? employee.averageScore - groupAverage
      : null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {rank !== undefined && (
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  RANK_CLASS[rank] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {rank}
              </span>
            )}
            <h4 className="truncate text-base font-semibold text-gray-900">{employee.name}</h4>
          </div>
          <p className="mt-1 truncate text-sm text-gray-500">
            {employee.employeeCode} · {employee.designation}
          </p>
          <p className="truncate text-xs text-gray-400">{employee.department}</p>
          <p className="truncate text-xs text-gray-400">
            Team Lead · {employee.teamLead || "—"}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold">
            <ScoreText score={employee.averageScore} />
          </div>
          <p className="text-xs text-gray-500">Average score</p>
          {delta !== null && Math.abs(delta) >= 0.05 && (
            <p
              className={`mt-1 flex items-center justify-end gap-0.5 text-xs font-semibold ${
                delta > 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(delta).toFixed(1)} vs. group
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-4">
        <StatItem label="Reviews" value={employee.reviewCount} />
        <StatItem label="Submitted" value={employee.submittedCount} />
        <StatItem label="Pending" value={employee.pendingCount} />
        <StatItem label="Approved" value={employee.approvedCount} />
      </div>

      <div className="mt-4 rounded-xl bg-gray-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <CalendarCheck size={12} className="text-gray-400" />
            Attendance
          </p>
          <span className="text-sm font-semibold text-gray-900">
            {employee.attendanceRate.toFixed(1)}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${Math.min(Math.max(employee.attendanceRate, 0), 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-600">
          <span className="font-semibold text-emerald-600">{employee.presentDays}</span> present ·{" "}
          <span className="font-semibold text-rose-600">{employee.absentDays}</span> absent
        </p>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

/**
 * Portrait-style comparison cards: each employee in a vertical card showing
 * all their metrics stacked. Matches the side-by-side layout from the screenshot.
 */
function CompareMatrix({
  result,
  rankOf,
  groupAverage,
}: {
  result: CompareResult;
  rankOf: Map<string, number>;
  groupAverage: number | null;
}) {
  if (result.employees.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
        <AlertCircle size={24} className="mx-auto mb-2 text-gray-400" />
        <p className="text-sm text-gray-500">
          No appraisal data found for the selected employees.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {result.employees.map((emp) => {
        const rank = rankOf.get(emp.employeeId);
        const delta =
          groupAverage !== null && emp.reviewCount > 0
            ? emp.averageScore - groupAverage
            : null;

        const bestPeriod =
          emp.trend.length > 0
            ? emp.trend.reduce((a, b) => (a.averageScore > b.averageScore ? a : b)).period
            : "—";
        const lowestPeriod =
          emp.trend.length > 0
            ? emp.trend.reduce((a, b) => (a.averageScore < b.averageScore ? a : b)).period
            : "—";

        return (
          <div
            key={emp.employeeId}
            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
          >
            {/* Header with name and score */}
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {rank !== undefined && (
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        RANK_CLASS[rank] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {rank}
                    </span>
                  )}
                  <h4 className="truncate text-base font-semibold text-gray-900">{emp.name}</h4>
                </div>
                <p className="mt-1 truncate text-xs text-gray-400">{emp.employeeCode}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-2xl font-bold">
                  <ScoreText score={emp.averageScore} />
                </div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">
                  {rank === 1 ? "TOP" : "AVG"}
                </p>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="space-y-2.5 text-sm">
              <MetricRow label="Department" value={emp.department} />
              <MetricRow label="Designation" value={emp.designation} />
              <MetricRow label="Team lead" value={emp.teamLead || "—"} />
              <MetricRow label="Submitted forms" value={emp.submittedCount} />
              <MetricRow label="Pending forms" value={emp.pendingCount} />
              <MetricRow label="Periods evaluated" value={emp.trend.length} />
              <MetricRow label="Best period" value={bestPeriod} />
              <MetricRow label="Lowest period" value={lowestPeriod} />
              <MetricRow
                label="Attendance"
                value={`${emp.attendanceRate.toFixed(1)}%`}
              />
              {delta !== null && Math.abs(delta) >= 0.05 && (
                <MetricRow
                  label="vs. Group"
                  value={`${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}
                  valueClass={delta > 0 ? "text-emerald-600" : "text-rose-600"}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricRow({
  label,
  value,
  valueClass = "text-gray-900",
}: {
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`truncate text-sm font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

