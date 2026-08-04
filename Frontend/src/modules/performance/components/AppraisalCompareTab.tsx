import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  FileSpreadsheet,
  GitCompare,
  Medal,
  Search,
  Trophy,
  X,
} from "lucide-react";

import { BarChart, LineChart } from "@/components/charts";
import EmptyState from "@/components/common/EmptyState";
import { useAuth } from "@/app/providers/AuthContext";
import { employeeService } from "@/modules/employees/api/employeeService";
import { fullName, type Employee } from "@/modules/employees/types/employee.types";
import AppraisalFilterBar from "./AppraisalFilterBar";
import {
  appraisalStatsApi,
  type AppraisalStatsFilters,
  type CompareResult,
} from "@/modules/appraisal/api/appraisalApi";

/** The server rejects fewer than 2 and more than 6; mirror both bounds here. */
const MIN_COMPARE = 2;
const MAX_COMPARE = 6;

type Picked = { employeeId: string; label: string };

/**
 * Side-by-side comparison of 2–6 employees.
 *
 * The bounds are enforced in the picker as well as on the server: an unbounded
 * list is an accidental full-table scan, and finding that out via a 400 after
 * choosing a seventh person is a worse experience than a control that stops
 * accepting more.
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

  const [picked, setPicked] = useState<Picked[]>([]);
  const [filters, setFilters] = useState<AppraisalStatsFilters>({});
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Employee[]>([]);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Resolve ids handed over from the results table into labels, so the chips
  // read as names rather than uuids.
  useEffect(() => {
    if (!initialEmployeeIds?.length) return;
    let cancelled = false;
    Promise.all(
      initialEmployeeIds.slice(0, MAX_COMPARE).map((id) =>
        employeeService
          .get(id)
          .then((emp) => ({ employeeId: id, label: fullName(emp) || emp.employee_code }))
          // A name we cannot resolve still compares fine — the id is what the
          // API needs, so fall back to a short id rather than dropping the row.
          .catch(() => ({ employeeId: id, label: `${id.slice(0, 8)}…` })),
      ),
    ).then((resolved) => {
      if (!cancelled) setPicked(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [initialEmployeeIds]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      employeeService
        .list({ search: term, limit: 10, status: true })
        .then((res) => {
          if (!cancelled) setOptions(res.data);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const add = (emp: Employee) => {
    if (picked.length >= MAX_COMPARE) return;
    if (picked.some((p) => p.employeeId === emp.user_id)) return;
    setPicked((prev) => [
      ...prev,
      { employeeId: emp.user_id, label: fullName(emp) || emp.employee_code },
    ]);
    setSearch("");
    setOptions([]);
  };

  const remove = (employeeId: string) =>
    setPicked((prev) => prev.filter((p) => p.employeeId !== employeeId));

  const ids = picked.map((p) => p.employeeId);

  const load = useCallback(() => {
    if (ids.length < MIN_COMPARE) {
      setResult(null);
      return;
    }
    setLoading(true);
    const { employeeId: _employeeId, status: _status, ...rest } = filters;
    appraisalStatsApi
      .compare(ids, rest)
      .then(setResult)
      .catch((err) => onError(err, "Could not compare the selected employees."))
      .finally(() => setLoading(false));
    // `ids` is derived from `picked`; joining it keeps the dependency a stable
    // primitive instead of a fresh array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(","), filters, onError]);

  useEffect(load, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { employeeId: _employeeId, status: _status, ...rest } = filters;
      await appraisalStatsApi.exportCompareExcel(ids, rest);
    } catch (err) {
      onError(err, "Could not export the comparison.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <GitCompare size={15} className="text-gray-400" />
            Employees
            <span className="text-xs font-normal text-gray-400">
              {picked.length}/{MAX_COMPARE} — pick at least {MIN_COMPARE}
            </span>
          </h4>
          {canExport && ids.length >= MIN_COMPARE && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || loading}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark disabled:opacity-50"
            >
              {exporting ? <Clock size={14} /> : <FileSpreadsheet size={14} />}
              {exporting ? "Exporting…" : "Excel"}
            </button>
          )}
        </div>

        {picked.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {picked.map((p) => (
              <span
                key={p.employeeId}
                className="flex items-center gap-1.5 rounded-full bg-brand-light px-3 py-1.5 text-sm font-medium text-brand-dark"
              >
                {p.label}
                <button
                  type="button"
                  onClick={() => remove(p.employeeId)}
                  aria-label={`Remove ${p.label}`}
                  className="rounded-full p-0.5 transition hover:bg-brand/30"
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative max-w-md">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              picked.length >= MAX_COMPARE
                ? `Maximum of ${MAX_COMPARE} reached`
                : "Search employees by name or code…"
            }
            disabled={picked.length >= MAX_COMPARE}
            className="w-full rounded-lg bg-gray-100 py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:opacity-60"
          />
          {options.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-gray-200">
              {options.map((emp) => {
                const already = picked.some((p) => p.employeeId === emp.user_id);
                return (
                  <li key={emp.user_id}>
                    <button
                      type="button"
                      onClick={() => add(emp)}
                      disabled={already}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-brand-light/40 disabled:opacity-40"
                    >
                      <span className="font-medium text-gray-900">{fullName(emp)}</span>
                      <span className="font-mono text-xs text-gray-400">
                        {emp.employee_code}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {searching && search.trim().length >= 2 && options.length === 0 && (
            <p className="mt-1.5 text-xs text-gray-400">Searching…</p>
          )}
        </div>
      </div>

      <AppraisalFilterBar value={filters} onChange={setFilters} showStatus={false} />

      {ids.length < MIN_COMPARE ? (
        <EmptyState
          icon={GitCompare}
          title="Pick employees to compare"
          description={`Select between ${MIN_COMPARE} and ${MAX_COMPARE} employees above to see their scores side by side.`}
        />
      ) : loading ? (
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      ) : !result ? null : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Trophy size={15} className="text-gray-400" />
              Ranking
            </h4>
            <ol className="space-y-2">
              {result.ranking.map((r) => (
                <li
                  key={r.employeeId}
                  className="flex items-center justify-between gap-3 rounded-xl bg-gray-50/70 px-3 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        r.rank === 1
                          ? "bg-gradient-to-r from-brand to-brand-dark text-gray-900"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {r.rank === 1 ? <Medal size={14} /> : r.rank}
                    </span>
                    <span className="truncate font-medium text-gray-900">{r.name}</span>
                  </span>
                  <span className="shrink-0 text-sm text-gray-500">
                    avg{" "}
                    <span className="font-semibold text-gray-900">
                      {r.averageScore.toFixed(2)}%
                    </span>
                    <span className="ml-2 hidden sm:inline">
                      gross {r.grossScore.toFixed(2)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h4 className="mb-3 text-sm font-semibold text-gray-900">Average Score</h4>
            <BarChart
              labels={result.employees.map((e) => e.name)}
              series={[
                {
                  label: "Average score",
                  values: result.employees.map((e) => e.averageScore),
                },
                {
                  label: "Attendance rate",
                  values: result.employees.map((e) => e.attendanceRate),
                },
              ]}
              valueSuffix="%"
              showValues
              emptyMessage="No scored evaluations for these employees in this range."
            />
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h4 className="mb-3 text-sm font-semibold text-gray-900">Score Trend</h4>
            {/*
              The server returns a union of every period across the compared
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
                  values: result.periods.map((p) => byPeriod.get(p) ?? null),
                };
              })}
              valueSuffix="%"
              emptyMessage="No scored evaluations for these employees in this range."
            />
          </div>

          <div className="overflow-x-auto rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h4 className="mb-3 text-sm font-semibold text-gray-900">Breakdown</h4>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-2.5 pr-3">Employee</th>
                  <th className="py-2.5 pr-3">Department</th>
                  <th className="py-2.5 pr-3 text-right">Reviews</th>
                  <th className="py-2.5 pr-3 text-right">Submitted</th>
                  <th className="py-2.5 pr-3 text-right">Approved</th>
                  <th className="py-2.5 pr-3 text-right">Present</th>
                  <th className="py-2.5 pr-3 text-right">Absent</th>
                  <th className="py-2.5 pr-3 text-right">Avg</th>
                  <th className="py-2.5 text-right">Gross</th>
                </tr>
              </thead>
              <tbody>
                {result.employees.map((emp) => (
                  <tr key={emp.employeeId} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium text-gray-900">{emp.name}</span>
                      <span className="ml-2 font-mono text-xs text-gray-400">
                        {emp.employeeCode}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600">{emp.department || "—"}</td>
                    <td className="py-2.5 pr-3 text-right text-gray-600">{emp.reviewCount}</td>
                    <td className="py-2.5 pr-3 text-right text-gray-600">{emp.submittedCount}</td>
                    <td className="py-2.5 pr-3 text-right text-gray-600">{emp.approvedCount}</td>
                    <td className="py-2.5 pr-3 text-right text-gray-600">{emp.presentDays}</td>
                    <td className="py-2.5 pr-3 text-right text-gray-600">{emp.absentDays}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-gray-900">
                      {emp.averageScore.toFixed(2)}%
                    </td>
                    <td className="py-2.5 text-right text-gray-600">
                      {emp.grossScore.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
