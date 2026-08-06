import { useEffect, useState } from "react";
import { FileText } from "lucide-react";

import Modal from "@/components/dialogs/Modal";
import StatusBadge from "@/components/common/StatusBadge";
import { formatDisplayDate } from "@/utils/formatDate";
import {
  appraisalStatsApi,
  type SubmittedEvaluation,
} from "@/modules/appraisal/api/appraisalApi";

/**
 * Read-only viewer for one submitted review.
 *
 * The Results tab lists reviews as aggregate rows; this fetches the full record
 * behind a row — every per-question score, the option chosen, its remarks, plus
 * the reviewer's overall comments and recommendation. It never mutates: approve
 * / reject / reopen live in ReviewApprovalDialog, reached from the Workflow
 * column, so this stays a pure "what was submitted" view.
 *
 * "Draft" is shown as "Pending" to match the table's own relabelling.
 */
export default function ReviewFormDialog({
  reviewId,
  employeeName,
  onClose,
  onError,
}: {
  reviewId: string;
  employeeName: string;
  onClose: () => void;
  onError: (err: unknown, fallback: string) => void;
}) {
  const [detail, setDetail] = useState<SubmittedEvaluation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    appraisalStatsApi
      .getReviewDetail(reviewId)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err) => {
        if (!cancelled) onError(err, "Could not load the submitted form.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reviewId, onError]);

  const displayStatus =
    detail?.status === "Draft" ? "Pending" : detail?.status ?? "";

  return (
    <Modal
      open
      title={`Submitted Form · ${employeeName}`}
      description={
        detail
          ? `${detail.formName} · ${detail.reviewPeriod} · reviewed by ${detail.reviewerName}`
          : undefined
      }
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {loading ? (
        <div className="space-y-3">
          <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : !detail ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <FileText size={28} className="text-gray-300" />
          <p className="text-sm text-gray-500">This form could not be loaded.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-light px-4 py-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-brand-dark">
                Total Score
              </p>
              <p className="text-3xl font-semibold text-gray-900">
                {detail.totalScore}%
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={displayStatus} />
              <span className="text-xs text-gray-500">
                {formatDisplayDate(detail.reviewDate)}
              </span>
            </div>
          </div>

          {detail.scores.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
              No answers were recorded for this review yet.
            </p>
          ) : (
            <div className="space-y-2">
              {detail.scores.map((s) => (
                <div
                  key={s.scoreId}
                  className="rounded-xl border border-gray-100 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {s.criteriaName}
                    </p>
                    <p className="text-sm text-gray-700">
                      {s.selectedOptionText ? (
                        <span className="font-medium">{s.selectedOptionText}</span>
                      ) : (
                        <>
                          {s.score}/{s.ratingScale}
                        </>
                      )}
                      <span className="ml-2 text-xs text-gray-400">
                        weight {s.weightage}%
                      </span>
                    </p>
                  </div>
                  {s.remarks && (
                    <p className="mt-1.5 text-sm text-gray-500">{s.remarks}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {detail.comments && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Comments
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-700">
                {detail.comments}
              </p>
            </div>
          )}
          {detail.recommendation && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Recommendation
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-700">
                {detail.recommendation}
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
