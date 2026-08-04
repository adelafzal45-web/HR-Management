import { useEffect, useState } from "react";
import {
  CheckCircle2,
  History,
  RotateCcw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import Modal from "@/components/dialogs/Modal";
import StatusBadge from "@/components/common/StatusBadge";
import { formatDisplayDate } from "@/utils/formatDate";
import {
  appraisalWorkflowApi,
  type ReviewApproval,
  type ReviewApprovalAction,
} from "@/modules/appraisal/api/appraisalApi";

type WorkflowAction = "approve" | "reject" | "reopen";

const ACTION_META: Record<
  ReviewApprovalAction,
  { label: string; icon: typeof Send; tone: string }
> = {
  SUBMIT: { label: "Submitted", icon: Send, tone: "bg-gray-100 text-gray-600" },
  APPROVE: {
    label: "Approved",
    icon: CheckCircle2,
    tone: "bg-brand-light text-brand-dark",
  },
  REJECT: { label: "Rejected", icon: XCircle, tone: "bg-gray-800 text-white" },
  REOPEN: { label: "Reopened", icon: RotateCcw, tone: "bg-brand text-white" },
};

/*
 * Which actions a status accepts, mirroring the workflow service. Approve and
 * reject act on `Submitted` only; reopen acts on a decided review. Offering a
 * button the server will 409 is worse than not offering it, so the dialog
 * derives its buttons from the status rather than showing all three.
 */
function allowedActions(status: string): WorkflowAction[] {
  const normalized = status.toLowerCase();
  if (normalized === "submitted") return ["approve", "reject"];
  if (normalized === "approved" || normalized === "rejected") return ["reopen"];
  return [];
}

const ACTION_COPY: Record<
  WorkflowAction,
  { title: string; verb: string; hint: string; icon: typeof Send }
> = {
  approve: {
    title: "Approve",
    verb: "Approve",
    hint: "The reviewer is notified and the review is final unless HR reopens it.",
    icon: CheckCircle2,
  },
  reject: {
    title: "Reject",
    verb: "Reject",
    hint: "Say what needs to change — the comment is the only thing the reviewer sees.",
    icon: XCircle,
  },
  reopen: {
    title: "Reopen",
    verb: "Reopen",
    hint: "Returns the review to Draft and clears the lock so it can be redone.",
    icon: RotateCcw,
  },
};

/**
 * Approve / reject / reopen one review, with its full trail.
 *
 * The trail is append-only server-side, so this reads it back after every
 * action rather than patching a local copy — what is on screen is what the
 * database holds, including rows written by other HR users in the meantime.
 */
export default function ReviewApprovalDialog({
  reviewId,
  employeeName,
  reviewPeriod,
  status,
  canAct,
  onClose,
  onDone,
  onError,
}: {
  reviewId: string;
  employeeName: string;
  reviewPeriod: string;
  status: string;
  canAct: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (err: unknown, fallback: string) => void;
}) {
  const [trail, setTrail] = useState<ReviewApproval[]>([]);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<WorkflowAction | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    appraisalWorkflowApi
      .approvals(reviewId)
      .then((rows) => {
        if (!cancelled) setTrail(rows);
      })
      .catch((err) => {
        if (!cancelled) onError(err, "Could not load the approval history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reviewId, onError]);

  const run = async () => {
    if (!action) return;
    setSaving(true);
    try {
      const trimmed = comment.trim();
      const result =
        action === "approve"
          ? await appraisalWorkflowApi.approve(reviewId, trimmed || undefined)
          : action === "reject"
            ? await appraisalWorkflowApi.reject(reviewId, trimmed || undefined)
            : await appraisalWorkflowApi.reopen(reviewId, trimmed || undefined);
      setTrail(result.approvals);
      setCurrentStatus(result.status);
      setAction(null);
      setComment("");
      onDone(result.message);
    } catch (err) {
      onError(err, `Could not ${action} that review.`);
    } finally {
      setSaving(false);
    }
  };

  const available = canAct ? allowedActions(currentStatus) : [];

  return (
    <Modal
      open
      title="Review Workflow"
      description={`${employeeName} — ${reviewPeriod}`}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5">
          <ShieldCheck size={15} className="shrink-0 text-gray-400" />
          <span className="text-sm text-gray-600">Current status</span>
          <span className="ml-auto">
            <StatusBadge status={currentStatus} />
          </span>
        </div>

        {available.length > 0 && !action && (
          <div className="flex flex-wrap gap-2">
            {available.map((key) => {
              const meta = ACTION_COPY[key];
              const Icon = meta.icon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setAction(key);
                    setComment("");
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition ${
                    key === "approve"
                      ? "bg-gradient-to-r from-brand to-brand-dark text-gray-900 shadow-sm hover:brightness-95"
                      : "border border-gray-200 text-gray-600 hover:border-brand/60 hover:text-brand-dark"
                  }`}
                >
                  <Icon size={14} />
                  {meta.verb}
                </button>
              );
            })}
          </div>
        )}

        {action && (
          <div className="rounded-xl border border-gray-200 p-3.5">
            <p className="text-sm font-semibold text-gray-900">
              {ACTION_COPY[action].title} this review
            </p>
            <p className="mt-0.5 text-xs text-gray-500">{ACTION_COPY[action].hint}</p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Comment (optional)"
              className="mt-2.5 w-full resize-none rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
            <div className="mt-2.5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAction(null)}
                className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={run}
                disabled={saving}
                className="rounded-lg bg-gradient-to-r from-brand to-brand-dark px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:opacity-50"
              >
                {saving ? "Working…" : `Confirm ${ACTION_COPY[action].verb.toLowerCase()}`}
              </button>
            </div>
          </div>
        )}

        {available.length === 0 && !action && (
          <p className="text-sm text-gray-500">
            {canAct
              ? "No workflow action applies while the review is in this state."
              : "You can view this history but not act on it."}
          </p>
        )}

        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <History size={15} className="text-gray-400" />
            History
          </h4>
          {loading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : trail.length === 0 ? (
            <p className="text-sm text-gray-400">
              Nothing recorded yet — the trail starts when the review is submitted.
            </p>
          ) : (
            <ol className="space-y-2">
              {trail.map((row) => {
                const meta = ACTION_META[row.action];
                const Icon = meta.icon;
                return (
                  <li
                    key={row.approvalId}
                    className="flex items-start gap-2.5 rounded-xl bg-gray-50/70 px-3 py-2.5"
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meta.tone}`}
                    >
                      <Icon size={13} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">
                        <span className="font-semibold">{meta.label}</span>
                        <span className="text-gray-500"> by {row.actorName}</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDisplayDate(row.createdAt)}
                      </p>
                      {row.comment && (
                        <p className="mt-1 whitespace-pre-line text-sm text-gray-600">
                          {row.comment}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  );
}
