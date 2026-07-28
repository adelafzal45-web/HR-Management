import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackButton from "@/components/common/BackButton";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { teamApi, appraisalCriteriaApi, evaluationApi } from "@/modules/team/api/teamApi";
import type { TeamMember, AppraisalQuestion, SubmittedEvaluation } from "@/modules/team/api/teamApi";

function currentReviewPeriod() {
  const now = new Date();
  const half = now.getMonth() < 6 ? "H1" : "H2";
  return half === "H1" ? `Jan – Jun ${now.getFullYear()}` : `Jul – Dec ${now.getFullYear()}`;
}

export default function EvaluateProfessional() {
  const status = useBackendStatus();
  const navigate = useNavigate();
  const { professionalId } = useParams<{ professionalId: string }>();

  const [member, setMember] = useState<TeamMember | null>(null);
  const [criteria, setCriteria] = useState<AppraisalQuestion[]>([]);
  const [existing, setExisting] = useState<SubmittedEvaluation | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedEvaluation | null>(null);

  useEffect(() => {
    if (!professionalId) return;
    (async () => {
      setLoading(true);
      try {
        const [members, criteriaList, prior] = await Promise.all([
          teamApi.getTeamMembers(),
          appraisalCriteriaApi.getCriteria(),
          evaluationApi.getEvaluation(professionalId),
        ]);
        setMember(members.find((m) => m.professionalId === professionalId) ?? null);
        setCriteria(criteriaList.filter((q) => q.isActive));
        setExisting(prior);
        if (prior) {
          const initialScores: Record<string, number> = {};
          prior.scores.forEach((s) => {
            initialScores[s.questionId] = s.score;
          });
          setScores(initialScores);
          setComments(prior.comments);
          setRecommendation(prior.recommendation);
        }
      } catch {
        setMember(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [professionalId]);

  const weightedScore = useMemo(() => {
    return (
      Math.round(
        criteria.reduce((sum, q) => sum + ((scores[q.questionId] ?? 0) * q.weightage) / 100, 0) * 10,
      ) / 10
    );
  }, [criteria, scores]);

  const allScored = criteria.length > 0 && criteria.every((q) => scores[q.questionId] != null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!professionalId) return;
    if (!allScored) {
      setError("Please score every criterion before submitting.");
      return;
    }
    if (!comments.trim() || !recommendation.trim()) {
      setError("Please add comments and a recommendation.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await evaluationApi.submitEvaluation({
        professionalId,
        reviewPeriod: currentReviewPeriod(),
        comments: comments.trim(),
        recommendation: recommendation.trim(),
        scores: criteria.map((q) => ({ questionId: q.questionId, score: scores[q.questionId] })),
      });
      setSubmitted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit the evaluation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout title="Evaluate Professional" activeKey="team-members">
      <BackendStatusBanner status={status} />

      <BackButton fallback="/team" label="Back to My Team" className="mb-4" />

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      ) : !member ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
          <p className="text-sm font-semibold text-gray-900">Team member not found</p>
        </div>
      ) : submitted ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-gray-100">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={26} />
          </span>
          <p className="text-lg font-semibold text-gray-900">Evaluation submitted</p>
          <p className="max-w-sm text-sm text-gray-500">
            {member.firstName} {member.lastName}'s weighted appraisal score is{" "}
            <strong className="text-gray-900">{submitted.totalScore} / 10</strong>.
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
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-base font-semibold text-gray-900">
              {member.firstName} {member.lastName}
            </h2>
            <p className="text-sm text-gray-500">
              {member.designation} · {currentReviewPeriod()}
            </p>
            {existing && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                An evaluation already exists for this cycle — submitting again will overwrite it.
              </p>
            )}

            <div className="mt-5 space-y-4">
              {criteria.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No active appraisal criteria yet. Set them up under Appraisal Criteria first.
                </p>
              ) : (
                criteria.map((q) => (
                  <div key={q.questionId} className="rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-gray-900">{q.questionText}</p>
                      <span className="shrink-0 text-xs text-gray-400">{q.weightage}% weight</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={0.5}
                        value={scores[q.questionId] ?? 5}
                        onChange={(e) =>
                          setScores((cur) => ({ ...cur, [q.questionId]: Number(e.target.value) }))
                        }
                        className="h-2 flex-1 cursor-pointer accent-brand-dark"
                      />
                      <span className="w-10 shrink-0 text-right text-sm font-semibold text-gray-900">
                        {(scores[q.questionId] ?? 5).toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium text-gray-900">Comments</span>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                placeholder="Summarize overall performance for this period"
                className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-medium text-gray-900">Recommendation</span>
              <input
                type="text"
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
                placeholder="e.g. Recommended for a performance increment"
                className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
              />
            </label>

            {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
          </div>

          <div className="h-fit rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <p className="text-sm font-medium text-gray-500">Weighted Score (live)</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-brand-dark">
              {weightedScore}
              <span className="text-base font-normal text-gray-400"> / 10</span>
            </p>
            <p className="mt-2 text-xs text-gray-400">
              {allScored ? "All criteria scored." : "Score every criterion to finalize."}
            </p>

            <div className="mt-5">
              <PrimaryButton type="submit" loading={submitting} disabled={criteria.length === 0}>
                Submit Evaluation
              </PrimaryButton>
            </div>
          </div>
        </form>
      )}
    </DashboardLayout>
  );
}
