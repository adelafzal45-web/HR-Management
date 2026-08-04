import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, AlertCircle } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackButton from "@/components/common/BackButton";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import { PrimaryButton } from "@/components/forms/FormField";
import { useAuth } from "@/app/providers/AuthContext";
import {
  teamAppraisalApi,
  type EvaluationForm,
  type SubmittedEvaluation,
} from "@/modules/appraisal/api/appraisalApi";

function currentReviewPeriod() {
  const now = new Date();
  const half = now.getMonth() < 6 ? "H1" : "H2";
  return half === "H1" ? `Jan – Jun ${now.getFullYear()}` : `Jul – Dec ${now.getFullYear()}`;
}

export default function EvaluateEmployee() {
  const navigate = useNavigate();
  const { employeeId } = useParams<{ employeeId: string }>();
  const { hasPermission } = useAuth();
  const canSubmit = hasPermission("appraisal.create");

  const [form, setForm] = useState<EvaluationForm | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [comments, setComments] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedEvaluation | null>(null);

  useEffect(() => {
    if (!employeeId) return;
    teamAppraisalApi
      .getEvaluationForm(employeeId)
      .then((data) => {
        setForm(data);
        const initialScores: Record<string, number> = {};
        const initialRemarks: Record<string, string> = {};
        if (data.existing) {
          data.existing.scores.forEach((s) => {
            initialScores[s.questionId] = s.score;
            if (s.remarks) initialRemarks[s.questionId] = s.remarks;
          });
          setComments(data.existing.comments);
          setRecommendation(data.existing.recommendation);
        } else {
          // Start each question at the midpoint of its own configured scale.
          data.questions.forEach((q) => {
            initialScores[q.questionId] = Math.ceil(q.ratingScale / 2);
          });
        }
        setScores(initialScores);
        setRemarks(initialRemarks);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Could not load the evaluation form."),
      )
      .finally(() => setLoading(false));
  }, [employeeId]);

  const activeQuestions = useMemo(
    () => (form?.questions ?? []).filter((q) => q.isActive),
    [form],
  );

  // Mirrors the backend: each answer becomes score/scale*100, then a
  // weight-weighted mean across questions.
  const weightedTotal = useMemo(() => {
    if (activeQuestions.length === 0) return 0;
    const totalWeight = activeQuestions.reduce((sum, q) => sum + q.weightage, 0);
    if (totalWeight === 0) return 0;
    const weighted = activeQuestions.reduce((sum, q) => {
      const raw = scores[q.questionId] ?? 0;
      return sum + (raw / q.ratingScale) * 100 * q.weightage;
    }, 0);
    return Math.round((weighted / totalWeight) * 10) / 10;
  }, [activeQuestions, scores]);

  const allScored =
    activeQuestions.length > 0 && activeQuestions.every((q) => scores[q.questionId] != null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!employeeId) return;
    if (!allScored) {
      setError("Please score every question before submitting.");
      return;
    }
    if (!comments.trim() || !recommendation.trim()) {
      setError("Please add comments and a recommendation.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await teamAppraisalApi.submitEvaluation(employeeId, {
        reviewPeriod: currentReviewPeriod(),
        comments: comments.trim(),
        recommendation: recommendation.trim(),
        scores: activeQuestions.map((q) => ({
          questionId: q.questionId,
          score: scores[q.questionId],
          remarks: remarks[q.questionId]?.trim() || undefined,
        })),
      });
      setSubmitted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit the evaluation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout title="Evaluate Employee" activeKey="team-members">
      <LoadingOverlay show={loading} label="Loading evaluation form…" />

      <BackButton fallback="/team" label="Back to My Team" className="mb-4" />

      {loadError ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
            <AlertCircle size={26} />
          </span>
          <p className="mt-3 text-sm font-semibold text-gray-900">Evaluation unavailable</p>
          <p className="mt-1 text-sm text-gray-500">{loadError}</p>
        </div>
      ) : !loading && !form ? null : submitted ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-gray-100">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={26} />
          </span>
          <p className="text-lg font-semibold text-gray-900">Evaluation submitted</p>
          <p className="max-w-sm text-sm text-gray-500">
            {submitted.employeeName}'s weighted appraisal score is{" "}
            <strong className="text-gray-900">{submitted.totalScore}%</strong>.
          </p>
          <button
            type="button"
            onClick={() => navigate("/team")}
            className="mt-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-6 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            Back to My Team
          </button>
        </div>
      ) : (
        form && (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-base font-semibold text-gray-900">{form.employeeName}</h2>
              <p className="text-sm text-gray-500">
                {form.formName} · {form.evaluationType} · {currentReviewPeriod()}
              </p>
              {form.existing && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  An evaluation already exists for this cycle — submitting again will overwrite it.
                </p>
              )}
              {!canSubmit && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  You don't have permission to submit evaluations. This form is read-only for you.
                </p>
              )}

              <div className="mt-5 space-y-4">
                {activeQuestions.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    This form has no active questions. Ask HR to configure it before evaluating.
                  </p>
                ) : (
                  activeQuestions.map((q) => {
                    const value = scores[q.questionId] ?? Math.ceil(q.ratingScale / 2);
                    return (
                      <div key={q.questionId} className="rounded-xl border border-gray-100 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-gray-900">{q.questionText}</p>
                          <span className="shrink-0 text-xs text-gray-400">{q.weightage}% weight</span>
                        </div>

                        <div className="mt-3 flex items-center gap-3">
                          <input
                            type="range"
                            min={1}
                            max={q.ratingScale}
                            step={1}
                            value={value}
                            disabled={!canSubmit}
                            onChange={(e) =>
                              setScores((cur) => ({ ...cur, [q.questionId]: Number(e.target.value) }))
                            }
                            aria-label={`Rating for ${q.questionText}`}
                            className="h-2 flex-1 cursor-pointer accent-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <span className="w-14 shrink-0 text-right text-sm font-semibold text-gray-900">
                            {value} / {q.ratingScale}
                          </span>
                        </div>

                        {(q.minLabel || q.maxLabel) && (
                          <div className="mt-1 flex justify-between text-xs text-gray-400">
                            <span>{q.minLabel ?? "1"}</span>
                            <span>{q.maxLabel ?? q.ratingScale}</span>
                          </div>
                        )}

                        <input
                          type="text"
                          value={remarks[q.questionId] ?? ""}
                          disabled={!canSubmit}
                          onChange={(e) =>
                            setRemarks((cur) => ({ ...cur, [q.questionId]: e.target.value }))
                          }
                          placeholder="Optional comment on this question"
                          className="mt-3 w-full rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:opacity-50"
                        />
                      </div>
                    );
                  })
                )}
              </div>

              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Comments</span>
                <textarea
                  value={comments}
                  disabled={!canSubmit}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                  placeholder="Summarize overall performance for this period"
                  className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:opacity-50"
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Recommendation</span>
                <input
                  type="text"
                  value={recommendation}
                  disabled={!canSubmit}
                  onChange={(e) => setRecommendation(e.target.value)}
                  placeholder="e.g. Recommended for a performance increment"
                  className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:opacity-50"
                />
              </label>

              {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
            </div>

            <div className="h-fit rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm font-medium text-gray-500">Weighted Score (live)</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-brand-dark">
                {weightedTotal}
                <span className="text-base font-normal text-gray-400">%</span>
              </p>
              <p className="mt-2 text-xs text-gray-400">
                {allScored ? "All questions scored." : "Score every question to finalize."}
              </p>

              <div className="mt-5">
                <PrimaryButton
                  type="submit"
                  loading={submitting}
                  disabled={activeQuestions.length === 0 || !canSubmit}
                >
                  Submit Evaluation
                </PrimaryButton>
              </div>
            </div>
          </form>
        )
      )}
    </DashboardLayout>
  );
}
