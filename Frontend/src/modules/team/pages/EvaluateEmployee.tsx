import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, AlertCircle } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackButton from "@/components/common/BackButton";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import InfoTip from "@/components/common/InfoTip";
import { PrimaryButton } from "@/components/forms/FormField";
import { useAuth } from "@/app/providers/AuthContext";
import {
  teamAppraisalApi,
  type EvaluationForm,
  type FormQuestion,
  type SubmittedEvaluation,
} from "@/modules/appraisal/api/appraisalApi";

/**
 * One answer in progress. Which member is set is decided by the question's
 * type, mirroring the server's own branching in `resolveAnswer`:
 *
 *  - `rating`                                  → `score`, a point on its scale
 *  - `yes_no` / `multiple_choice` / `dropdown` → `optionId`
 *  - `text_feedback`                           → `remarks` only; unscored
 *
 * Both are optional because no question needs both, and neither is set until
 * the reviewer actually answers — an unanswered question must stay visibly
 * unanswered rather than defaulting to a score nobody chose.
 */
type Answer = { score?: number; optionId?: string; remarks?: string };

const OPTION_BASED = ["yes_no", "multiple_choice", "dropdown"] as const;

function isOptionBased(q: FormQuestion) {
  return (OPTION_BASED as readonly string[]).includes(q.questionType);
}

/** Does this question contribute to the weighted total. */
function isScored(q: FormQuestion) {
  return q.questionType !== "text_feedback";
}

/**
 * Has this question been answered at all.
 *
 * `text_feedback` counts as answered once it carries any text; it is the whole
 * answer for that type rather than optional commentary.
 */
function isAnswered(q: FormQuestion, answer: Answer | undefined) {
  if (!answer) return false;
  if (q.questionType === "text_feedback") return !!answer.remarks?.trim();
  if (isOptionBased(q)) return !!answer.optionId;
  return answer.score != null;
}

/**
 * This answer as a 0–100 percentage, matching `resolveAnswer` on the server.
 *
 * Option scores are normalised against the highest-scoring option on the same
 * question rather than read literally, so Yes = 10 / No = 0 and Yes = 1 / No = 0
 * both mean 100% / 0%. Taking them literally here would show the reviewer a
 * running total the server then disagrees with.
 */
function answerPercentage(q: FormQuestion, answer: Answer | undefined): number {
  if (!answer) return 0;
  if (isOptionBased(q)) {
    const chosen = q.options.find((o) => o.optionId === answer.optionId);
    if (!chosen) return 0;
    const max = Math.max(...q.options.map((o) => o.score));
    return max > 0 ? (chosen.score / max) * 100 : 0;
  }
  if (answer.score == null) return 0;
  return q.ratingScale > 0 ? (answer.score / q.ratingScale) * 100 : 0;
}

const TYPE_LABEL: Record<FormQuestion["questionType"], string> = {
  rating: "Rating",
  yes_no: "Yes / No",
  multiple_choice: "Multiple choice",
  dropdown: "Dropdown",
  text_feedback: "Written feedback",
};

export default function EvaluateEmployee() {
  const navigate = useNavigate();
  const { employeeId } = useParams<{ employeeId: string }>();
  const { hasPermission } = useAuth();
  const canSubmit = hasPermission("appraisal.create");

  const [form, setForm] = useState<EvaluationForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [comments, setComments] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedEvaluation | null>(null);

  const setAnswer = (questionId: string, patch: Answer) =>
    setAnswers((cur) => ({ ...cur, [questionId]: { ...cur[questionId], ...patch } }));

  useEffect(() => {
    if (!employeeId) return;
    teamAppraisalApi
      .getEvaluationForm(employeeId)
      .then((data) => {
        setForm(data);

        // Prefill only from a real prior answer for this same period. Nothing is
        // invented: a question the reviewer has not answered stays empty, so
        // "unanswered" and "deliberately scored at the midpoint" cannot be
        // confused with one another.
        const initial: Record<string, Answer> = {};
        if (data.existing) {
          const byId = new Map(data.questions.map((q) => [q.questionId, q]));
          data.existing.scores.forEach((s) => {
            const question = byId.get(s.questionId);
            initial[s.questionId] = {
              score: question && !isOptionBased(question) ? s.score : undefined,
              optionId: s.selectedOptionId ?? undefined,
              remarks: s.remarks ?? undefined,
            };
          });
          setComments(data.existing.comments);
          setRecommendation(data.existing.recommendation);
        }
        setAnswers(initial);
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

  // Mirrors the backend: each answer becomes a 0–100 percentage, then a
  // weight-weighted mean. `text_feedback` is excluded from both sides of the
  // fraction — it carries no weight and scoring it would dilute the total.
  const weightedTotal = useMemo(() => {
    const scored = activeQuestions.filter(isScored);
    const totalWeight = scored.reduce((sum, q) => sum + q.weightage, 0);
    if (totalWeight === 0) return 0;
    const weighted = scored.reduce(
      (sum, q) => sum + answerPercentage(q, answers[q.questionId]) * q.weightage,
      0,
    );
    return Math.round((weighted / totalWeight) * 10) / 10;
  }, [activeQuestions, answers]);

  // Only required questions block submission — the same rule `submitEvaluation`
  // enforces. Demanding every question would refuse forms HR deliberately made
  // optional.
  const unanswered = useMemo(
    () => activeQuestions.filter((q) => q.isRequired && !isAnswered(q, answers[q.questionId])),
    [activeQuestions, answers],
  );
  const answeredCount = activeQuestions.filter((q) =>
    isAnswered(q, answers[q.questionId]),
  ).length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!employeeId || !form) return;
    if (unanswered.length > 0) {
      setError(
        `Please answer: ${unanswered.map((q) => q.questionText).join(", ")}.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await teamAppraisalApi.submitEvaluation(employeeId, {
        // The server names the period; echoing it back is what lets this
        // submission fill the scheduler's Draft instead of creating a rival row.
        reviewPeriod: form.reviewPeriod,
        // Both are optional to the reviewer, but the server DTO types them as
        // plain strings — omitting them fails @IsString(), so send "" instead.
        comments: comments.trim(),
        recommendation: recommendation.trim(),
        // Skip questions left blank. An optional question with no answer must be
        // omitted, not sent as a zero the reviewer never gave.
        scores: activeQuestions
          .filter((q) => isAnswered(q, answers[q.questionId]))
          .map((q) => {
            const answer = answers[q.questionId];
            return {
              questionId: q.questionId,
              score: isOptionBased(q) || !isScored(q) ? undefined : answer.score,
              selectedOptionId: isOptionBased(q) ? answer.optionId : undefined,
              remarks: answer.remarks?.trim() || undefined,
            };
          }),
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
                {form.formName} · {form.evaluationType} · {form.reviewPeriod}
              </p>
              {form.existing && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  An evaluation already exists for this period — submitting again will overwrite it.
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
                    const answer = answers[q.questionId];
                    const answered = isAnswered(q, answer);
                    return (
                      <div
                        key={q.questionId}
                        className={`rounded-xl border p-4 ${
                          answered ? "border-gray-100" : "border-gray-200 bg-gray-50/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {q.questionText}
                              {q.isRequired && (
                                <span className="ml-1 text-rose-500" aria-label="Required">
                                  *
                                </span>
                              )}
                            </p>
                            {q.description && (
                              <p className="mt-0.5 text-xs text-gray-500">{q.description}</p>
                            )}
                          </div>
                          <span className="flex shrink-0 items-center gap-1.5 text-xs text-gray-400">
                            {isScored(q) ? `${q.weightage}% weight` : "Unscored"}
                            <InfoTip
                              side="left"
                              label={`How "${q.questionText}" is scored`}
                              text={
                                isScored(q)
                                  ? `${TYPE_LABEL[q.questionType]}. Your answer becomes a percentage, and this question contributes ${q.weightage}% of the final score.`
                                  : `${TYPE_LABEL[q.questionType]}. Written feedback carries no weight — it is recorded alongside the scores but does not move the total.`
                              }
                            />
                          </span>
                        </div>

                        {/* One input per type, matching what the server will accept
                            for this question. */}
                        {q.questionType === "rating" && (
                          <>
                            <div className="mt-3 flex items-center gap-3">
                              <input
                                type="range"
                                min={1}
                                max={q.ratingScale}
                                step={1}
                                value={answer?.score ?? Math.ceil(q.ratingScale / 2)}
                                disabled={!canSubmit}
                                onChange={(e) =>
                                  setAnswer(q.questionId, { score: Number(e.target.value) })
                                }
                                aria-label={`Rating for ${q.questionText}`}
                                className="h-2 flex-1 cursor-pointer accent-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                              />
                              <span
                                className={`w-14 shrink-0 text-right text-sm font-semibold ${
                                  answered ? "text-gray-900" : "text-gray-400"
                                }`}
                              >
                                {answer?.score ?? "—"} / {q.ratingScale}
                              </span>
                            </div>
                            {(q.minLabel || q.maxLabel) && (
                              <div className="mt-1 flex justify-between text-xs text-gray-400">
                                <span>{q.minLabel ?? "1"}</span>
                                <span>{q.maxLabel ?? q.ratingScale}</span>
                              </div>
                            )}
                            {!answered && (
                              <p className="mt-1 text-xs text-gray-400">
                                Drag to score — nothing is recorded until you do.
                              </p>
                            )}
                          </>
                        )}

                        {/* Yes/No and short option sets read better as buttons than
                            as a select the reviewer has to open to see. */}
                        {isOptionBased(q) && q.options.length <= 4 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {q.options.map((o) => (
                              <button
                                key={o.optionId}
                                type="button"
                                disabled={!canSubmit}
                                aria-pressed={answer?.optionId === o.optionId}
                                onClick={() => setAnswer(q.questionId, { optionId: o.optionId })}
                                className={`rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                  answer?.optionId === o.optionId
                                    ? "border-brand bg-brand-light/70 text-brand-dark"
                                    : "border-gray-200 text-gray-600 hover:border-brand hover:bg-gray-50"
                                }`}
                              >
                                {o.optionText}
                              </button>
                            ))}
                          </div>
                        )}

                        {isOptionBased(q) && q.options.length > 4 && (
                          <select
                            value={answer?.optionId ?? ""}
                            disabled={!canSubmit}
                            onChange={(e) => setAnswer(q.questionId, { optionId: e.target.value })}
                            aria-label={`Answer for ${q.questionText}`}
                            className="mt-3 w-full rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60 disabled:opacity-50"
                          >
                            <option value="">Select an answer…</option>
                            {q.options.map((o) => (
                              <option key={o.optionId} value={o.optionId}>
                                {o.optionText}
                              </option>
                            ))}
                          </select>
                        )}

                        {/* text_feedback has no separate remarks box: the text is the
                            answer, so a second field would be asking twice. */}
                        {q.questionType === "text_feedback" ? (
                          <textarea
                            value={answer?.remarks ?? ""}
                            disabled={!canSubmit}
                            onChange={(e) => setAnswer(q.questionId, { remarks: e.target.value })}
                            rows={3}
                            placeholder="Write your feedback for this question"
                            aria-label={`Feedback for ${q.questionText}`}
                            className="mt-3 w-full resize-none rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:opacity-50"
                          />
                        ) : (
                          <input
                            type="text"
                            value={answer?.remarks ?? ""}
                            disabled={!canSubmit}
                            onChange={(e) => setAnswer(q.questionId, { remarks: e.target.value })}
                            placeholder="Optional comment on this question"
                            aria-label={`Comment on ${q.questionText}`}
                            className="mt-3 w-full rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:opacity-50"
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-medium text-gray-900">
                  Comments <span className="font-normal text-gray-400">(optional)</span>
                </span>
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
                <span className="mb-2 block text-sm font-medium text-gray-900">
                  Recommendation <span className="font-normal text-gray-400">(optional)</span>
                </span>
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

            {/*
              `self-start` is what makes `sticky` mean anything here: a grid item
              stretches to the row height by default, so a stretched box has
              nowhere to travel and never sticks. The scroll container is
              DashboardLayout's <main>, which is the offset parent for `top-0`.
            */}
            <div className="sticky top-0 self-start rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <p className="flex items-center gap-1.5 text-sm font-medium text-gray-500">
                Weighted Score (live)
                <InfoTip
                  side="left"
                  label="How the weighted score is calculated"
                  text="Each answer becomes a percentage — a rating against its own scale, an option against the highest-scoring option on that question — and those are averaged by weight. Written-feedback questions carry no weight and are left out. The server recalculates this on submit and its figure is the one that is stored."
                />
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-brand-dark">
                {weightedTotal}
                <span className="text-base font-normal text-gray-400">%</span>
              </p>
              <p className="mt-2 text-xs text-gray-400">
                {answeredCount} of {activeQuestions.length} answered
                {unanswered.length > 0 && ` · ${unanswered.length} required still open`}
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
