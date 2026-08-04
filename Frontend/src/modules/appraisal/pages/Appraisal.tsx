import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, ChevronRight, AlertCircle, TrendingUp, PieChart, X } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import Modal from "@/components/dialogs/Modal";
import { BarChart, LineChart } from "@/components/charts";
import AppraisalNotificationsPanel from "@/modules/appraisal/components/AppraisalNotificationsPanel";
import { formatDisplayDate } from "@/utils/formatDate";
import {
  myAppraisalApi,
  type MyEvaluations,
  type SubmittedEvaluation,
} from "@/modules/appraisal/api/appraisalApi";

// Every score on this screen is a weighted percentage (0–100), matching the
// backend convention: score / ratingScale * 100, then a weight-weighted mean.
function scoreTone(percentage: number) {
  if (percentage >= 80) return "text-emerald-600";
  if (percentage >= 60) return "text-amber-600";
  return "text-rose-600";
}

function barTone(percentage: number) {
  if (percentage >= 80) return "bg-emerald-500";
  if (percentage >= 60) return "bg-amber-500";
  return "bg-rose-500";
}

/*
 * `GET /appraisal/my-evaluations` returns this employee's complete history in
 * one response — it is bounded by their own review count, not by a page size —
 * so the filters below narrow it in the browser. Refetching per filter change
 * would issue the same query and throw away rows client-side anyway.
 *
 * The summary figures are recomputed from the filtered set rather than read off
 * `latestScore` / `averageScore`, which the server computes across everything:
 * showing an org-wide average above a filtered list would be quietly wrong.
 */
type Filters = {
  from: string;
  to: string;
  evaluationType: string;
  status: string;
};

const EMPTY_FILTERS: Filters = { from: "", to: "", evaluationType: "", status: "" };

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export default function Appraisal() {
  const [data, setData] = useState<MyEvaluations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubmittedEvaluation | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  useEffect(() => {
    let active = true;
    myAppraisalApi
      .getMyEvaluations()
      .then((res) => active && setData(res))
      .catch(
        (err) =>
          active &&
          setError(err instanceof Error ? err.message : "Could not load your appraisal history."),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const allEvaluations = useMemo(() => data?.evaluations ?? [], [data]);

  const typeOptions = useMemo(
    () => [...new Set(allEvaluations.map((e) => e.evaluationType).filter(Boolean))].sort(),
    [allEvaluations],
  );
  const statusOptions = useMemo(
    () => [...new Set(allEvaluations.map((e) => e.status).filter(Boolean))].sort(),
    [allEvaluations],
  );

  const evaluations = useMemo(
    () =>
      allEvaluations.filter((e) => {
        // reviewDate is an ISO date string, so a lexical compare against the
        // date-input values is correct and avoids a timezone round-trip.
        if (filters.from && e.reviewDate.slice(0, 10) < filters.from) return false;
        if (filters.to && e.reviewDate.slice(0, 10) > filters.to) return false;
        if (filters.evaluationType && e.evaluationType !== filters.evaluationType) return false;
        if (filters.status && e.status !== filters.status) return false;
        return true;
      }),
    [allEvaluations, filters],
  );

  const activeFilterCount =
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.evaluationType ? 1 : 0) +
    (filters.status ? 1 : 0);
  const filtering = activeFilterCount > 0;

  const latest = evaluations[0];

  const latestScore = latest ? latest.totalScore : null;
  const averageScore = evaluations.length
    ? round2(evaluations.reduce((sum, e) => sum + e.totalScore, 0) / evaluations.length)
    : null;

  // The server's `trend` is oldest→newest across everything; rebuilding it from
  // the filtered list keeps the chart and the list telling the same story.
  const trend = useMemo(
    () => [...evaluations].reverse().map((e) => ({ period: e.reviewPeriod, score: e.totalScore })),
    [evaluations],
  );

  // Category breakdown likewise: mean normalised score per criterion, over the
  // rows actually on screen.
  const breakdown = useMemo(() => {
    const byCriteria = new Map<string, { total: number; count: number; weightage: number }>();
    for (const evaluation of evaluations) {
      for (const score of evaluation.scores) {
        const key = score.criteriaName || "Uncategorised";
        const bucket = byCriteria.get(key) ?? { total: 0, count: 0, weightage: score.weightage };
        bucket.total += score.scorePercentage;
        bucket.count += 1;
        bucket.weightage = score.weightage;
        byCriteria.set(key, bucket);
      }
    }
    return [...byCriteria.entries()].map(([criteriaName, b]) => ({
      criteriaName,
      averageScore: round2(b.total / b.count),
      weightage: b.weightage,
    }));
  }, [evaluations]);

  return (
    <DashboardLayout title="My Appraisal" activeKey="appraisal">
      <LoadingOverlay show={loading} label="Loading your appraisal results…" />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ---------------- Filters ---------------- */}
      {allEvaluations.length > 0 && (
        <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[140px]">
              <span className="mb-1.5 block text-xs font-medium text-gray-500">From</span>
              <input
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
                className="w-full rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
              />
            </label>
            <label className="min-w-[140px]">
              <span className="mb-1.5 block text-xs font-medium text-gray-500">To</span>
              <input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
                className="w-full rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
              />
            </label>
            <label className="min-w-[150px]">
              <span className="mb-1.5 block text-xs font-medium text-gray-500">Evaluation Type</span>
              <select
                value={filters.evaluationType}
                onChange={(e) => setFilters((p) => ({ ...p, evaluationType: e.target.value }))}
                className="w-full rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
              >
                <option value="">All types</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="min-w-[150px]">
              <span className="mb-1.5 block text-xs font-medium text-gray-500">Status</span>
              <select
                value={filters.status}
                onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                className="w-full rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
              >
                <option value="">All statuses</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            {filtering && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <X size={14} />
                Clear ({activeFilterCount})
              </button>
            )}
          </div>
          {filtering && (
            <p className="mt-2.5 text-xs text-gray-400">
              Showing {evaluations.length} of {allEvaluations.length} review
              {allEvaluations.length === 1 ? "" : "s"}. Scores below are for this selection.
            </p>
          )}
        </div>
      )}

      <div className="mb-5">
        <AppraisalNotificationsPanel compact />
      </div>

      {!loading && allEvaluations.length === 0 && !error ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No results yet"
          description="Your performance review hasn't been submitted by your team lead yet."
        />
      ) : !loading && !latest ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No matching reviews"
          description="No review matches the current filters."
          actionLabel="Clear filters"
          onAction={() => setFilters(EMPTY_FILTERS)}
        />
      ) : (
        latest && (
          <>
            {/* ---------------- Summary ---------------- */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs text-gray-500">Latest Score</p>
                <p className={`mt-1 text-3xl font-semibold ${scoreTone(latestScore ?? 0)}`}>
                  {latestScore ?? "—"}
                  <span className="text-base font-normal text-gray-400">%</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs text-gray-500">
                  Average ({filtering ? "selection" : "all periods"})
                </p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">
                  {averageScore ?? "—"}
                  <span className="text-base font-normal text-gray-400">%</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs text-gray-500">Reviews Completed</p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">{evaluations.length}</p>
              </div>
            </div>

            {/* ---------------- Latest review detail ---------------- */}
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    Most recent review · {latest.reviewPeriod}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {latest.formName}
                    {latest.evaluationType && ` · ${latest.evaluationType}`} · reviewed by{" "}
                    {latest.reviewerName} on {formatDisplayDate(latest.reviewDate)}
                  </p>
                </div>
                <StatusBadge status={latest.status} />
              </div>

              {latest.comments && (
                <p className="mt-4 text-sm leading-relaxed text-gray-600">{latest.comments}</p>
              )}
              {latest.recommendation && (
                <p className="mt-3 rounded-xl bg-brand-light/50 px-4 py-3 text-sm font-medium text-brand-dark">
                  {latest.recommendation}
                </p>
              )}

              <div className="mt-6 space-y-3">
                {latest.scores.map((s) => (
                  <div key={s.scoreId}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">
                        {s.criteriaName} <span className="text-gray-400">({s.weightage}%)</span>
                      </span>
                      <span className={`font-semibold ${scoreTone(s.scorePercentage)}`}>
                        {s.score} / {s.ratingScale}
                        <span className="ml-1.5 text-xs font-normal text-gray-400">
                          {s.scorePercentage}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${barTone(s.scorePercentage)}`}
                        style={{ width: `${Math.min(100, s.scorePercentage)}%` }}
                      />
                    </div>
                    {s.remarks && <p className="mt-1 text-xs text-gray-500">{s.remarks}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* ---------------- Trend across periods ---------------- */}
            {trend.length > 1 && (
              <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                  <TrendingUp size={16} className="text-brand-dark" /> Performance Trend
                </h2>
                <p className="mb-4 mt-1 text-xs text-gray-400">
                  Oldest to newest across the selected periods.
                </p>
                <LineChart
                  labels={trend.map((t) => t.period)}
                  series={[{ label: "Score", values: trend.map((t) => t.score) }]}
                  valueSuffix="%"
                  showLegend={false}
                  emptyMessage="Not enough reviews to draw a trend yet."
                />
              </div>
            )}

            {/* ---------------- Category-wise breakdown ---------------- */}
            {breakdown.length > 0 && (
              <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                  <PieChart size={16} className="text-brand-dark" /> Category-wise Results
                </h2>
                <p className="mb-4 mt-1 text-xs text-gray-400">
                  Your average per question across the selected reviews.
                </p>
                <BarChart
                  labels={breakdown.map((c) => c.criteriaName)}
                  series={[
                    { label: "Average score", values: breakdown.map((c) => c.averageScore) },
                  ]}
                  valueSuffix="%"
                  showLegend={false}
                  showValues
                  emptyMessage="No scored questions in this selection."
                />
                <div className="mt-5 space-y-3 border-t border-gray-100 pt-4">
                  {breakdown.map((c) => (
                    <div key={c.criteriaName}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">
                          {c.criteriaName} <span className="text-gray-400">({c.weightage}%)</span>
                        </span>
                        <span className={`font-semibold ${scoreTone(c.averageScore)}`}>
                          {c.averageScore}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full ${barTone(c.averageScore)}`}
                          style={{ width: `${Math.min(100, c.averageScore)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ---------------- History ---------------- */}
            {evaluations.length > 1 && (
              <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <h2 className="text-base font-semibold text-gray-900">Review History</h2>
                <div className="mt-4 divide-y divide-gray-50">
                  {evaluations.slice(1).map((r) => (
                    <button
                      key={r.appraisalId}
                      type="button"
                      onClick={() => setSelected(r)}
                      className="flex w-full items-center justify-between gap-4 py-3.5 text-left hover:bg-gray-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.reviewPeriod}</p>
                        <p className="text-xs text-gray-400">
                          {r.formName}
                          {r.evaluationType && ` · ${r.evaluationType}`} · reviewed{" "}
                          {formatDisplayDate(r.reviewDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={r.status} />
                        <span className={`text-sm font-semibold ${scoreTone(r.totalScore)}`}>
                          {r.totalScore}%
                        </span>
                        <ChevronRight size={16} className="text-gray-300" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      )}

      <Modal
        open={!!selected}
        title={selected ? `Review · ${selected.reviewPeriod}` : ""}
        description={
          selected
            ? `${selected.formName} · reviewed by ${selected.reviewerName} on ${formatDisplayDate(selected.reviewDate)}`
            : ""
        }
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div>
            <p className={`text-3xl font-semibold ${scoreTone(selected.totalScore)}`}>
              {selected.totalScore}
              <span className="text-base font-normal text-gray-400">%</span>
            </p>
            {selected.comments && (
              <p className="mt-3 text-sm leading-relaxed text-gray-600">{selected.comments}</p>
            )}
            {selected.recommendation && (
              <p className="mt-3 rounded-xl bg-brand-light/50 px-4 py-3 text-sm font-medium text-brand-dark">
                {selected.recommendation}
              </p>
            )}
            <div className="mt-5 space-y-2.5">
              {selected.scores.map((s) => (
                <div key={s.scoreId}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      {s.criteriaName} <span className="text-gray-400">({s.weightage}%)</span>
                    </span>
                    <span className={`font-semibold ${scoreTone(s.scorePercentage)}`}>
                      {s.score} / {s.ratingScale}
                    </span>
                  </div>
                  {s.remarks && <p className="mt-0.5 text-xs text-gray-500">{s.remarks}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
