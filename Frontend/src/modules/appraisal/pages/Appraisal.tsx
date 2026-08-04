import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck, AlertCircle, TrendingUp, PieChart, X, Eye, Award, SlidersHorizontal,
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import Modal from "@/components/dialogs/Modal";
import DataTable, {
  type DataTableColumn,
  type SortDirection,
} from "@/components/tables/DataTable";
import { BarChart, LineChart } from "@/components/charts";
import { formatDisplayDate } from "@/utils/formatDate";
import {
  myAppraisalApi,
  type EvaluationScore,
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

/**
 * What to show on the right of a criterion row.
 *
 * Only a rating answer came from a point on a scale, so only a rating answer
 * can be put back onto one — the backend returns `score: 0` for every other
 * type rather than inventing a number the reviewer never gave. Printing
 * "0 / 5" against a Yes/No question the reviewer answered "Yes" reads as a
 * zero, which is the opposite of what happened.
 */
function answerLabel(score: EvaluationScore): string {
  if (score.questionType === "rating") return `${score.score} / ${score.ratingScale}`;
  if (score.selectedOptionText) return score.selectedOptionText;
  if (score.questionType === "text_feedback") return "Written feedback";
  return "—";
}

/** Written feedback carries no weight, so it has no percentage to chart. */
function isScored(score: EvaluationScore) {
  return score.questionType !== "text_feedback";
}

/*
 * `GET /appraisal/my-evaluations` returns this employee's complete history in
 * one response — it is bounded by their own review count, not by a page size —
 * so everything below narrows it in the browser. Refetching per filter change
 * would issue the same query and throw away rows client-side anyway.
 *
 * Two narrowing surfaces, deliberately not the same thing:
 *   - the Scope bar (date range, type, status) narrows the *whole page*, so the
 *     cards, the charts and the table all describe one selection;
 *   - the table's own search, sort and paging narrow only the table.
 *
 * The summary figures are recomputed from the scoped set rather than read off
 * `latestScore` / `averageScore`, which the server computes across everything:
 * showing an all-time average above a filtered list would be quietly wrong.
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

/*
 * Sorting is local because the whole history is already in memory. DataTable
 * deliberately renders `rows` verbatim and never slices, so this screen owns
 * both the ordering and the page window.
 */
type SortField = "reviewDate" | "reviewPeriod" | "totalScore" | "evaluationType" | "status";

function compare(a: SubmittedEvaluation, b: SubmittedEvaluation, field: SortField) {
  if (field === "totalScore") return a.totalScore - b.totalScore;
  return String(a[field] ?? "").localeCompare(String(b[field] ?? ""));
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60";

export default function Appraisal() {
  const [data, setData] = useState<MyEvaluations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubmittedEvaluation | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("reviewDate");
  const [sortDir, setSortDir] = useState<SortDirection>("DESC");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  // The server returns newest first; "latest" must stay the newest review no
  // matter how the table below is sorted, so it is taken before any reordering.
  const latest = evaluations[0];

  const latestScore = latest ? latest.totalScore : null;
  const averageScore = evaluations.length
    ? round2(evaluations.reduce((sum, e) => sum + e.totalScore, 0) / evaluations.length)
    : null;
  const bestScore = evaluations.length
    ? Math.max(...evaluations.map((e) => e.totalScore))
    : null;

  // The server's `trend` is oldest→newest across everything; rebuilding it from
  // the scoped list keeps the chart and the table telling the same story.
  const trend = useMemo(
    () => [...evaluations].reverse().map((e) => ({ period: e.reviewPeriod, score: e.totalScore })),
    [evaluations],
  );

  // Category breakdown likewise: mean normalised score per criterion, over the
  // rows actually on screen. Written-feedback questions are left out — they are
  // stored at 0% by definition, so charting them would show a criterion the
  // employee "failed" when nothing was ever scored.
  const breakdown = useMemo(() => {
    const byCriteria = new Map<string, { total: number; count: number; weightage: number }>();
    for (const evaluation of evaluations) {
      for (const score of evaluation.scores) {
        if (!isScored(score)) continue;
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

  // ---------------- Table: search, sort, page ----------------
  const searched = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return evaluations;
    return evaluations.filter((e) =>
      [e.reviewPeriod, e.formName, e.reviewerName, e.evaluationType, e.status]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [evaluations, search]);

  const sorted = useMemo(() => {
    const factor = sortDir === "ASC" ? 1 : -1;
    return [...searched].sort((a, b) => compare(a, b, sortField) * factor);
  }, [searched, sortField, sortDir]);

  // Clamping rather than resetting: narrowing the scope while on page 4 should
  // land on the last page that still has rows, not silently show an empty table.
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sorted, currentPage, pageSize],
  );

  const columns: DataTableColumn<SubmittedEvaluation>[] = [
    {
      key: "reviewPeriod",
      label: "Period",
      sortable: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{row.reviewPeriod}</p>
          <p className="truncate text-xs text-gray-400">{row.formName}</p>
        </div>
      ),
    },
    {
      key: "evaluationType",
      label: "Type",
      sortable: true,
      hideBelow: "lg",
      render: (row) => (
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
          {row.evaluationType || "—"}
        </span>
      ),
    },
    {
      key: "reviewer",
      label: "Reviewed by",
      hideBelow: "md",
      sortable: true,
      sortKey: "reviewDate",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-gray-700">{row.reviewerName}</p>
          <p className="text-xs text-gray-400">{formatDisplayDate(row.reviewDate)}</p>
        </div>
      ),
    },
    {
      key: "totalScore",
      label: "Score",
      sortable: true,
      render: (row) => (
        <div className="min-w-[110px]">
          <span className={`text-sm font-semibold ${scoreTone(row.totalScore)}`}>
            {row.totalScore}%
          </span>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${barTone(row.totalScore)}`}
              style={{ width: `${Math.min(100, row.totalScore)}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <DashboardLayout title="My Appraisal" activeKey="appraisal">
      <LoadingOverlay show={loading} label="Loading your appraisal results…" />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ---------------- Scope: narrows the entire page ---------------- */}
      {allEvaluations.length > 0 && (
        <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <SlidersHorizontal size={15} className="text-brand-dark" />
              Scope
            </p>
            {filtering && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-red-200 hover:text-red-600"
              >
                <X size={13} />
                Clear ({activeFilterCount})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                From
              </span>
              <input
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                To
              </span>
              <input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Evaluation type
              </span>
              <select
                value={filters.evaluationType}
                onChange={(e) => setFilters((p) => ({ ...p, evaluationType: e.target.value }))}
                className={inputClass}
              >
                <option value="">All types</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Status
              </span>
              <select
                value={filters.status}
                onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                className={inputClass}
              >
                <option value="">All statuses</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          {filtering && (
            <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-400">
              Showing {evaluations.length} of {allEvaluations.length} review
              {allEvaluations.length === 1 ? "" : "s"}. Every figure below is for this selection.
            </p>
          )}
        </div>
      )}

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
          description="No review matches the current scope."
          actionLabel="Clear filters"
          onAction={() => setFilters(EMPTY_FILTERS)}
        />
      ) : (
        latest && (
          <>
            {/* ---------------- Summary ---------------- */}
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs text-gray-500">Latest Score</p>
                <p className={`mt-1 text-3xl font-semibold ${scoreTone(latestScore ?? 0)}`}>
                  {latestScore ?? "—"}
                  <span className="text-base font-normal text-gray-400">%</span>
                </p>
                <p className="mt-1 truncate text-xs text-gray-400">{latest.reviewPeriod}</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs text-gray-500">
                  Average ({filtering ? "selection" : "all periods"})
                </p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">
                  {averageScore ?? "—"}
                  <span className="text-base font-normal text-gray-400">%</span>
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  across {evaluations.length} review{evaluations.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <p className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Award size={13} className="text-brand-dark" />
                  Best Score
                </p>
                <p className={`mt-1 text-3xl font-semibold ${scoreTone(bestScore ?? 0)}`}>
                  {bestScore ?? "—"}
                  <span className="text-base font-normal text-gray-400">%</span>
                </p>
                <p className="mt-1 text-xs text-gray-400">highest in this selection</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs text-gray-500">Reviews Completed</p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">{evaluations.length}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {allEvaluations.length} on record
                </p>
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
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-gray-700">
                        {s.criteriaName}{" "}
                        <span className="text-gray-400">
                          {isScored(s) ? `(${s.weightage}%)` : "(unscored)"}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-right font-semibold ${
                          isScored(s) ? scoreTone(s.scorePercentage) : "text-gray-500"
                        }`}
                      >
                        {answerLabel(s)}
                        {isScored(s) && (
                          <span className="ml-1.5 text-xs font-normal text-gray-400">
                            {s.scorePercentage}%
                          </span>
                        )}
                      </span>
                    </div>
                    {isScored(s) && (
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full ${barTone(s.scorePercentage)}`}
                          style={{ width: `${Math.min(100, s.scorePercentage)}%` }}
                        />
                      </div>
                    )}
                    {s.remarks && <p className="mt-1 text-xs text-gray-500">{s.remarks}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* ---------------- Charts ---------------- */}
            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
              {trend.length > 1 && (
                <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
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

              {breakdown.length > 0 && (
                <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
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
            </div>

            {/* ---------------- History ---------------- */}
            <div className="mt-6">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Review History</h2>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Every review in the current scope. Open one to read its full breakdown.
                  </p>
                </div>
              </div>
              <DataTable<SubmittedEvaluation>
                columns={columns}
                rows={pageRows}
                rowKey={(row) => row.appraisalId}
                search={search}
                onSearchChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                searchPlaceholder="Period, form or reviewer…"
                emptyIcon={ClipboardCheck}
                emptyTitle="No reviews to show"
                emptyDescription="Nothing matches the current scope and search."
                page={currentPage}
                pageSize={pageSize}
                total={sorted.length}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                sortKey={sortField}
                sortDir={sortDir}
                onSortChange={(key, dir) => {
                  setSortField(key as SortField);
                  setSortDir(dir);
                  setPage(1);
                }}
                actions={(row) => (
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark"
                  >
                    <Eye size={14} />
                    View
                  </button>
                )}
              />
            </div>
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
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-gray-600">
                      {s.criteriaName}{" "}
                      <span className="text-gray-400">
                        {isScored(s) ? `(${s.weightage}%)` : "(unscored)"}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-right font-semibold ${
                        isScored(s) ? scoreTone(s.scorePercentage) : "text-gray-500"
                      }`}
                    >
                      {answerLabel(s)}
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
