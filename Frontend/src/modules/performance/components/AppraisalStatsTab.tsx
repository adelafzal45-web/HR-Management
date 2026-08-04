import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  TrendingUp,
  UserMinus,
  UserX,
} from "lucide-react";

import { BarChart, DoughnutChart, LineChart } from "@/components/charts";
import EmptyState from "@/components/common/EmptyState";
import { useAuth } from "@/app/providers/AuthContext";
import AppraisalFilterBar from "./AppraisalFilterBar";
import {
  appraisalStatsApi,
  type AppraisalStats,
  type AppraisalStatsFilters,
} from "@/modules/appraisal/api/appraisalApi";

/** Fixed colours per status so a slice keeps its meaning between renders. */
const STATUS_COLORS: Record<string, string> = {
  Draft: "rgb(148 163 184)",
  Submitted: "rgb(96 165 250)",
  Approved: "rgb(52 211 153)",
  Rejected: "rgb(248 113 113)",
};

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof BarChart3;
  label: string;
  value: string | number;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    default: "bg-gray-100 text-gray-500",
    good: "bg-green-50 text-green-600",
    warn: "bg-amber-50 text-amber-600",
    bad: "bg-red-50 text-red-600",
  }[tone];

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-400">
            {label}
          </p>
          <p className="text-lg font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The statistics module.
 *
 * Every figure and every chart is driven by the same filter object that the
 * export button sends, so a downloaded spreadsheet always matches what is on
 * screen. Scope is applied server-side from the JWT — a Team Lead sees their
 * roster here without the frontend asking for it.
 */
export default function AppraisalStatsTab({
  onError,
}: {
  onError: (err: unknown, fallback: string) => void;
}) {
  const { hasPermission } = useAuth();
  const canExport = hasPermission("appraisal.export");

  const [filters, setFilters] = useState<AppraisalStatsFilters>({});
  const [stats, setStats] = useState<AppraisalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    appraisalStatsApi
      .getStats(filters)
      .then(setStats)
      .catch((err) => onError(err, "Could not load appraisal statistics."))
      .finally(() => setLoading(false));
  }, [filters, onError]);

  useEffect(load, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await appraisalStatsApi.exportStatsExcel(filters);
    } catch (err) {
      onError(err, "Could not export the statistics.");
    } finally {
      setExporting(false);
    }
  };

  const summary = stats?.summary;

  return (
    <div>
      <AppraisalFilterBar
        value={filters}
        onChange={setFilters}
        right={
          canExport ? (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || loading}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark disabled:opacity-50"
            >
              {exporting ? <Clock size={14} /> : <FileSpreadsheet size={14} />}
              {exporting ? "Exporting…" : "Excel"}
            </button>
          ) : null
        }
      />

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      ) : !summary ? (
        <EmptyState
          icon={BarChart3}
          title="No statistics yet"
          description="Once evaluations are submitted, the figures appear here."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard icon={CalendarDays} label="Working Days" value={summary.workingDays} />
            <SummaryCard
              icon={CheckCircle2}
              label="Submitted"
              value={summary.submittedForms}
              tone="good"
            />
            <SummaryCard icon={Clock} label="Pending" value={summary.pendingForms} tone="warn" />
            <SummaryCard
              icon={CheckCircle2}
              label="Approved"
              value={summary.approvedForms}
              tone="good"
            />
            <SummaryCard icon={AlertTriangle} label="Rejected" value={summary.rejectedForms} tone="bad" />
            <SummaryCard icon={UserX} label="Absents" value={summary.absents} tone="bad" />
            <SummaryCard icon={UserMinus} label="On Leave" value={summary.employeesOnLeave} />
            <SummaryCard
              icon={TrendingUp}
              label="Average Score"
              value={`${summary.averageScore}%`}
              tone="good"
            />
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">Score Trend</h4>
              <span className="text-xs text-gray-400">
                Gross {summary.grossScore} across {summary.scoredCount} scored
              </span>
            </div>
            <LineChart
              labels={(stats?.trend ?? []).map((t) => t.period)}
              series={[
                {
                  label: "Average score",
                  values: (stats?.trend ?? []).map((t) => t.averageScore),
                },
              ]}
              valueSuffix="%"
              emptyMessage="No scored evaluations in this range yet."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <h4 className="mb-3 text-sm font-semibold text-gray-900">Approval Status</h4>
              <DoughnutChart
                slices={(stats?.byStatus ?? []).map((s) => ({
                  label: s.status,
                  value: s.count,
                  color: STATUS_COLORS[s.status],
                }))}
                centreLabel="reviews"
                emptyMessage="No evaluations in this range yet."
              />
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <h4 className="mb-3 text-sm font-semibold text-gray-900">Average by Department</h4>
              <BarChart
                labels={(stats?.byDepartment ?? []).map((d) => d.department)}
                series={[
                  {
                    label: "Average score",
                    values: (stats?.byDepartment ?? []).map((d) => d.averageScore),
                  },
                ]}
                valueSuffix="%"
                showValues
                emptyMessage="No scored evaluations in this range yet."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
