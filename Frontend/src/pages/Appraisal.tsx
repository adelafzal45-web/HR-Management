import { useEffect, useState } from "react";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import BackendStatusBanner from "../components/BackendStatusBanner";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { useBackendStatus } from "../hooks/useBackendStatus";
import { appraisalApi, type AppraisalRecord } from "../lib/hrApi";

function scoreTone(score: number) {
  if (score >= 8) return "text-emerald-600";
  if (score >= 6) return "text-amber-600";
  return "text-rose-600";
}

export default function Appraisal() {
  const status = useBackendStatus();
  const [records, setRecords] = useState<AppraisalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AppraisalRecord | null>(null);

  useEffect(() => {
    let active = true;
    appraisalApi
      .getMyAppraisals()
      .then((data) => active && setRecords(data))
      .catch(() => active && setRecords([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const latest = records[0];

  return (
    <DashboardLayout title="Appraisal" activeKey="appraisal">
      <BackendStatusBanner status={status} />

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
      ) : !latest ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Results not available"
          description="Your performance appraisal hasn't been completed yet."
        />
      ) : (
        <>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Most recent review · {latest.reviewPeriod}</p>
                <p className={`mt-1 text-4xl font-semibold tracking-tight ${scoreTone(latest.totalScore)}`}>
                  {latest.totalScore.toFixed(1)}
                  <span className="text-lg font-normal text-gray-400"> / 10</span>
                </p>
              </div>
              <StatusBadge status={latest.status} />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-gray-600">{latest.comments}</p>
            <p className="mt-3 rounded-xl bg-brand-light/50 px-4 py-3 text-sm font-medium text-brand-dark">
              {latest.recommendation}
            </p>

            <div className="mt-6 space-y-3">
              {latest.scores.map((s) => (
                <div key={s.scoreId}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">
                      {s.criteriaName} <span className="text-gray-400">({s.weightage}%)</span>
                    </span>
                    <span className={`font-semibold ${scoreTone(s.score)}`}>{s.score.toFixed(1)}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand to-brand-dark"
                      style={{ width: `${(s.score / 10) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {records.length > 1 && (
            <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Past Reviews</h2>
              <div className="mt-4 divide-y divide-gray-50">
                {records.slice(1).map((r) => (
                  <button
                    key={r.appraisalId}
                    type="button"
                    onClick={() => setSelected(r)}
                    className="flex w-full items-center justify-between gap-4 py-3.5 text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{r.reviewPeriod}</p>
                      <p className="text-xs text-gray-400">Reviewed {r.reviewDate}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-semibold ${scoreTone(r.totalScore)}`}>
                        {r.totalScore.toFixed(1)}
                      </span>
                      <ChevronRight size={16} className="text-gray-300" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        open={!!selected}
        title={selected ? `Appraisal · ${selected.reviewPeriod}` : ""}
        description={selected ? `Reviewed on ${selected.reviewDate}` : ""}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div>
            <p className={`text-3xl font-semibold ${scoreTone(selected.totalScore)}`}>
              {selected.totalScore.toFixed(1)} <span className="text-base font-normal text-gray-400">/ 10</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">{selected.comments}</p>
            <p className="mt-3 rounded-xl bg-brand-light/50 px-4 py-3 text-sm font-medium text-brand-dark">
              {selected.recommendation}
            </p>
            <div className="mt-5 space-y-3">
              {selected.scores.map((s) => (
                <div key={s.scoreId} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {s.criteriaName} <span className="text-gray-400">({s.weightage}%)</span>
                  </span>
                  <span className={`font-semibold ${scoreTone(s.score)}`}>{s.score.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
