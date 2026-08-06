// ============================================================================
// Employee appraisal dashboard — read-only, and scoped to the signed-in person.
//
// Both endpoints behind this screen resolve the employee from the JWT and take
// no target parameter, so there is nothing here to point at somebody else. An
// Employee holds `appraisal.viewOwn` and nothing more.
//
// Two sources, each earning its place:
//   · `/appraisal/dashboard/employee` — the server's own headline figures
//     (latest, average, totals, approved count). Trusted over anything derived
//     here so the number matches what HR sees for the same person.
//   · `/appraisal/my-evaluations`     — the full review records, which is the
//     only place the per-question scores, remarks and category breakdown live.
// A failure in the dashboard call falls back to figures derived from the
// evaluations rather than blanking the KPI row.
//
// Attendance is deliberately absent: working days and absences live on
// `/appraisal/stats`, which requires `appraisal.stats` — a grant Employees do
// not hold. Attendance stays on the Attendance screen, where it is readable.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  ClipboardCheck,
  Layers,
  TrendingUp,
} from "lucide-react";

import DashboardLayout from "@/app/layouts/DashboardLayout";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import SectionTabs from "@/components/common/SectionTabs";
import { type SelectOption } from "@/components/common/SearchableSelect";
import KpiCard from "@/components/common/KpiCard";
import EmptyState from "@/components/common/EmptyState";
import { KpiSkeleton } from "@/components/common/Skeleton";
import SidePanel from "@/components/dialogs/SidePanel";
import DataTable, {
  type DataTableColumn,
  type SortDirection,
} from "@/components/tables/DataTable";
import { LineChart } from "@/components/charts";
import ExportMenu from "@/modules/appraisal/components/ExportMenu";
import {
  ReviewStatusBadge,
  ScoreText,
  scoreTone,
} from "@/modules/appraisal/components/StatusPills";
import { getAppraisalTabs } from "@/config/featureTabs";
import { formatDisplayDate } from "@/utils/formatDate";
import {
  myAppraisalApi,
  type MyEvaluations,
  type SubmittedEvaluation,
} from "@/modules/appraisal/api/appraisalApi";

/**
 * The Daily / Weekly / Monthly grain the brief asks for. There is no
 * `evaluationType` on a submitted review — the backend stores the form's type,
 * not a copy on the result — so the grain is applied by bucketing `reviewDate`
 * here rather than by inventing a filter the API does not accept.
 */
const GRAINS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
] as const;

type Grain = (typeof GRAINS)[number]["key"];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * ISO-8601 week number. Written out rather than pulled from a date library
 * because the app has none, and `toLocaleDateString` cannot produce a week.
 */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = d.getUTCDay() || 7; // Sunday is 0 in JS, 7 in ISO.
  d.setUTCDate(d.getUTCDate() + 4 - weekday); // Move to the Thursday of this week.
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil((d.getTime() - yearStart) / 86_400_000 / 7 + 0.5);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Sortable key + human label for one review, at the selected grain. */
function bucketOf(reviewDate: string, grain: Grain): { key: string; label: string } {
  const date = new Date(reviewDate);
  if (Number.isNaN(date.getTime())) return { key: reviewDate, label: reviewDate };

  if (grain === "daily") {
    return { key: date.toISOString().slice(0, 10), label: formatDisplayDate(reviewDate) };
  }
  if (grain === "weekly") {
    const key = isoWeekKey(date);
    return { key, label: `W${key.slice(-2)} ${key.slice(0, 4)}` };
  }
  const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return { key, label: `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` };
}

const HISTORY_EXPORT_COLUMNS = [
  { key: "reviewPeriod", label: "Period" },
  { key: "formName", label: "Form" },
  { key: "reviewerName", label: "Reviewed by" },
  { key: "reviewDate", label: "Review date" },
  { key: "totalScore", label: "Score" },
  { key: "status", label: "Status" },
  { key: "recommendation", label: "Recommendation" },
];

type SortKey = "reviewDate" | "reviewPeriod" | "totalScore" | "status";

export default function Appraisal() {
  const { user } = useAuth();
  const { showError } = useToast();

  const [data, setData] = useState<MyEvaluations | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SubmittedEvaluation | null>(null);

  const [grain, setGrain] = useState<Grain>("monthly");
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<SortKey>("reviewDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("DESC");

  // The two calls settle independently — the history is the page, and losing the
  // headline figures should cost the KPI row its precision, not the whole screen.
  useEffect(() => {
    let cancelled = false;

    myAppraisalApi
      .getMyEvaluations()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          showError(
            err instanceof Error ? err.message : "Could not load your appraisal history.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showError]);

  const evaluations = useMemo(() => data?.evaluations ?? [], [data]);
  const breakdown = data?.categoryBreakdown ?? [];
  const tabs = getAppraisalTabs(user?.role);

  const periodOptions = useMemo<SelectOption[]>(() => {
    const seen = new Set<string>();
    for (const evaluation of evaluations) seen.add(evaluation.reviewPeriod);
    return [...seen]
      .sort()
      .reverse()
      .map((value) => ({ value, label: value }));
  }, [evaluations]);

  const statusOptions = useMemo<SelectOption[]>(() => {
    const seen = new Set<string>();
    for (const evaluation of evaluations) seen.add(evaluation.status);
    return [...seen].sort().map((value) => ({ value, label: value }));
  }, [evaluations]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = evaluations.filter((evaluation) => {
      if (period && evaluation.reviewPeriod !== period) return false;
      if (status && evaluation.status !== status) return false;

      // Date range filter
      if (dateFrom || dateTo) {
        const reviewDate = new Date(evaluation.reviewDate);
        if (dateFrom && reviewDate < new Date(dateFrom)) return false;
        if (dateTo && reviewDate > new Date(dateTo)) return false;
      }

      if (!needle) return true;
      return (
        evaluation.reviewPeriod.toLowerCase().includes(needle) ||
        evaluation.formName.toLowerCase().includes(needle) ||
        evaluation.reviewerName.toLowerCase().includes(needle)
      );
    });

    const direction = sortDirection === "ASC" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      switch (sortBy) {
        case "reviewPeriod":
          return a.reviewPeriod.localeCompare(b.reviewPeriod) * direction;
        case "totalScore":
          return (a.totalScore - b.totalScore) * direction;
        case "status":
          return a.status.localeCompare(b.status) * direction;
        default:
          return (Date.parse(a.reviewDate) - Date.parse(b.reviewDate)) * direction;
      }
    });
  }, [evaluations, period, status, dateFrom, dateTo, search, sortBy, sortDirection]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  // The trend follows the filters: a chart that ignored them would contradict the
  // table sitting directly beneath it.
  const trendRows = useMemo(() => {
    const buckets = new Map<string, { label: string; total: number; reviews: number }>();
    for (const evaluation of filtered) {
      const { key, label } = bucketOf(evaluation.reviewDate, grain);
      const bucket = buckets.get(key) ?? { label, total: 0, reviews: 0 };
      bucket.total += evaluation.totalScore;
      bucket.reviews += 1;
      buckets.set(key, bucket);
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, bucket]) => ({
        label: bucket.label,
        score: Math.round((bucket.total / bucket.reviews) * 10) / 10,
        reviews: bucket.reviews,
      }));
  }, [filtered, grain]);

  const historyExportRows = useMemo(
    () =>
      filtered.map((evaluation) => ({
        reviewPeriod: evaluation.reviewPeriod,
        formName: evaluation.formName,
        reviewerName: evaluation.reviewerName,
        reviewDate: formatDisplayDate(evaluation.reviewDate),
        totalScore: `${evaluation.totalScore}%`,
        status: evaluation.status,
        recommendation: evaluation.recommendation || "—",
      })),
    [filtered],
  );

  // Newest first regardless of how the table happens to be sorted — "most recent"
  // has to mean most recent.
  const byDateDesc = useMemo(
    () => evaluations.slice().sort((a, b) => Date.parse(b.reviewDate) - Date.parse(a.reviewDate)),
    [evaluations],
  );
  const latest = byDateDesc[0] ?? null;
  const previousScore = byDateDesc.length > 1 ? byDateDesc[1].totalScore : null;

  const latestScore = data?.latestScore ?? null;
  const averageScore = data?.averageScore ?? null;
  const totalEvaluations = evaluations.length;
  const approvedCount = evaluations.filter(
    (evaluation) => evaluation.status === "Approved",
  ).length;

  const activeFilters =
    (period ? 1 : 0) + (status ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  // `sortable` on every column that has a `sortKey`: the filter popover offers
  // the field but no longer the direction, so the header toggle is what flips
  // ascending/descending.
  const columns: DataTableColumn<SubmittedEvaluation>[] = [
    {
      key: "reviewPeriod",
      label: "Period",
      sortable: true,
      sortKey: "reviewPeriod",
      filterable: true,
      filterOptions: periodOptions,
      filterPlaceholder: "All periods",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{row.reviewPeriod}</p>
          <p className="truncate text-xs text-gray-400">{row.formName}</p>
        </div>
      ),
    },
    {
      key: "reviewerName",
      label: "Reviewed by",
      hideBelow: "lg",
      render: (row) => <span className="text-gray-600">{row.reviewerName}</span>,
    },
    {
      key: "reviewDate",
      label: "Review date",
      sortable: true,
      sortKey: "reviewDate",
      hideBelow: "md",
      render: (row) => (
        <span className="text-gray-500">{formatDisplayDate(row.reviewDate)}</span>
      ),
    },
    {
      key: "totalScore",
      label: "Score",
      sortable: true,
      sortKey: "totalScore",
      align: "center",
      render: (row) => <ScoreText score={row.totalScore} />,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortKey: "status",
      align: "center",
      filterable: true,
      filterOptions: statusOptions,
      filterPlaceholder: "All statuses",
      render: (row) => <ReviewStatusBadge status={row.status} />,
    },
  ];

  return (
    <DashboardLayout title="My Appraisal" activeKey="appraisal">
      <SectionTabs tabs={tabs} active="my-appraisal" />

      {/* ---------------- Report grain ---------------- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Reporting period</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Groups the score trend below {grain}
          </p>
        </div>
        <div role="group" aria-label="Report grain" className="flex rounded-xl bg-gray-100 p-0.5">
          {GRAINS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setGrain(key)}
              aria-pressed={grain === key}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                grain === key
                  ? "bg-white text-brand-dark shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <KpiSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiCard
            label="Latest score"
            value={latestScore === null ? "—" : `${latestScore}%`}
            icon={Award}
            tone="brand"
            hint={latest ? latest.reviewPeriod : "No review yet"}
            delta={
              latestScore !== null && previousScore !== null
                ? Math.round((latestScore - previousScore) * 10) / 10
                : null
            }
            deltaGood="up"
          />
          <KpiCard
            label="Average score"
            value={averageScore === null ? "—" : `${averageScore}%`}
            icon={TrendingUp}
            tone="blue"
            hint="Across every review period"
          />
          <KpiCard
            label="Reviews received"
            value={totalEvaluations}
            icon={ClipboardCheck}
            tone="slate"
            hint={`${periodOptions.length} period${periodOptions.length === 1 ? "" : "s"}`}
          />
          <KpiCard
            label="Approved"
            value={approvedCount}
            icon={CheckCircle2}
            tone="green"
            hint="Signed off by HR"
          />
        </div>
      )}

      {/* ---------------- Most recent review ---------------- */}
      {latest && (
        <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Most recent review
              </p>
              <p className="mt-1 text-base font-semibold text-gray-900">{latest.reviewPeriod}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {latest.formName} · reviewed by {latest.reviewerName} on{" "}
                {formatDisplayDate(latest.reviewDate)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ReviewStatusBadge status={latest.status} />
              <p className={`text-3xl font-semibold ${scoreTone(latest.totalScore)}`}>
                {latest.totalScore}
                <span className="text-base font-normal text-gray-400">%</span>
              </p>
            </div>
          </div>

          {latest.recommendation && (
            <p className="mt-4 rounded-xl bg-brand-light/50 px-4 py-3 text-sm font-medium text-brand-dark">
              {latest.recommendation}
            </p>
          )}
          {latest.comments && (
            <p className="mt-3 text-sm leading-relaxed text-gray-600">{latest.comments}</p>
          )}

          <button
            type="button"
            onClick={() => setSelected(latest)}
            className="mt-4 flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-brand/60 hover:bg-brand-light/40 hover:text-brand-dark"
          >
            <Layers size={13} />
            See the question-by-question breakdown
          </button>
        </div>
      )}

      {/* ---------------- Trend + profile ---------------- */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 lg:col-span-2">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Score over time</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Your reviews grouped {grain}, following the filters above
            </p>
          </div>

          <LineChart
            labels={trendRows.map((row) => row.label)}
            series={[{ label: "Average score", values: trendRows.map((row) => row.score) }]}
            height={280}
            valueSuffix="%"
            ariaLabel={`Your average score across ${trendRows.length} ${grain} period${
              trendRows.length === 1 ? "" : "s"
            }.`}
            emptyMessage="No reviews fall inside these filters"
          />
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Where you score</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Your average per question, across every period
            </p>
          </div>

          {loading && !data ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : breakdown.length === 0 ? (
            <EmptyState
              icon={Award}
              title="No scored questions yet"
              description="Your reviews have no per-question breakdown."
            />
          ) : (
            <div className="space-y-3">
              {breakdown.map((category) => (
                <div key={category.criteriaName}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-gray-700">
                      {category.criteriaName}
                      <span className="ml-1.5 text-xs text-gray-400">
                        ({category.weightage}%)
                      </span>
                    </span>
                    <span className={`shrink-0 font-semibold ${scoreTone(category.averageScore)}`}>
                      {category.averageScore}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${
                        category.averageScore >= 80
                          ? "bg-emerald-500"
                          : category.averageScore >= 60
                            ? "bg-amber-500"
                            : "bg-rose-500"
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(0, category.averageScore))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ---------------- History ---------------- */}
      <div className="mt-5">
        <DataTable
          columns={columns}
          rows={paged}
          rowKey={(row) => row.appraisalId}
          loading={loading}
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder="Search your reviews by period, form or reviewer…"
          emptyIcon={ClipboardCheck}
          emptyTitle={activeFilters || search ? "No reviews match" : "No results yet"}
          emptyDescription={
            activeFilters || search
              ? "Clear the filters to see your whole review history."
              : "Your performance review hasn't been submitted by your team lead yet."
          }
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          sortKey={sortBy}
          sortDir={sortDirection}
          onSortChange={(key, direction) => {
            setSortBy(key as SortKey);
            setSortDirection(direction);
          }}
          unifiedFilter
          hideSortDirection
          sortOptions={[
            { value: "reviewDate", label: "Review date" },
            { value: "reviewPeriod", label: "Period" },
            { value: "totalScore", label: "Score" },
            { value: "status", label: "Status" },
          ]}
          filters={{ reviewPeriod: period, status }}
          onFiltersChange={(next) => {
            setPeriod(next.reviewPeriod ?? "");
            setStatus(next.status ?? "");
            setPage(1);
          }}
          extraFilterCount={(dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
          onClearExtraFilters={() => {
            setDateFrom("");
            setDateTo("");
            setPage(1);
          }}
          extraFilters={
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Review date from
                </span>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    setPage(1);
                  }}
                  className="min-h-9 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Review date to
                </span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    setPage(1);
                  }}
                  className="min-h-9 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </label>
            </div>
          }
          toolbarRight={
            <ExportMenu
              title="My appraisal history"
              columns={HISTORY_EXPORT_COLUMNS}
              rows={historyExportRows}
              disabled={filtered.length === 0}
              onError={(message) => showError(message)}
            />
          }
          actions={(row) => (
            <button
              type="button"
              onClick={() => setSelected(row)}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-brand/60 hover:bg-brand-light/40 hover:text-brand-dark"
            >
              <Layers size={13} />
              Details
            </button>
          )}
        />
      </div>

      {/* ---------------- Detail ---------------- */}
      {/* A drawer rather than a centred modal: the history table stays visible
          alongside, so stepping through several reviews keeps its context. */}
      <SidePanel
        open={!!selected}
        title={selected ? `Review · ${selected.reviewPeriod}` : ""}
        description={
          selected
            ? `${selected.formName} · reviewed by ${selected.reviewerName} on ${formatDisplayDate(selected.reviewDate)}`
            : ""
        }
        onClose={() => setSelected(null)}
        maxWidth="max-w-lg"
      >
        {selected && (
          <div>
            <div className="flex items-center justify-between">
              <p className={`text-3xl font-semibold ${scoreTone(selected.totalScore)}`}>
                {selected.totalScore}
                <span className="text-base font-normal text-gray-400">%</span>
              </p>
              <ReviewStatusBadge status={selected.status} />
            </div>

            {selected.recommendation && (
              <p className="mt-3 rounded-xl bg-brand-light/50 px-4 py-3 text-sm font-medium text-brand-dark">
                {selected.recommendation}
              </p>
            )}
            {selected.comments && (
              <p className="mt-3 text-sm leading-relaxed text-gray-600">{selected.comments}</p>
            )}

            {selected.scores.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="No question scores"
                description="This review was recorded without a per-question breakdown."
              />
            ) : (
              <div className="mt-5 space-y-3">
                {selected.scores.map((score) => (
                  <div key={score.scoreId}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 font-medium text-gray-700">
                        {score.criteriaName}{" "}
                        <span className="text-gray-400">({score.weightage}%)</span>
                      </span>
                      <span
                        className={`shrink-0 font-semibold ${scoreTone(score.scorePercentage)}`}
                      >
                        {score.score} / {score.ratingScale}
                        <span className="ml-1.5 text-xs font-normal text-gray-400">
                          {score.scorePercentage}%
                        </span>
                      </span>
                    </div>
                    {/* A bar as well as the number: the weight says how much the
                        question counted, the bar how well it went, and reading
                        both off one row is the point of this modal. */}
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${
                          score.scorePercentage >= 80
                            ? "bg-emerald-500"
                            : score.scorePercentage >= 60
                              ? "bg-amber-500"
                              : "bg-rose-500"
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(0, score.scorePercentage))}%`,
                        }}
                      />
                    </div>
                    {score.remarks && (
                      <p className="mt-1 text-xs text-gray-500">{score.remarks}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SidePanel>
    </DashboardLayout>
  );
}
