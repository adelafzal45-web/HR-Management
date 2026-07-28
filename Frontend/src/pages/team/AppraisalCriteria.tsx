import { useEffect, useState } from "react";
import { Plus, Trash2, ClipboardList } from "lucide-react";
import DashboardLayout from "../../components/dashboard/DashboardLayout";
import BackendStatusBanner from "../../components/BackendStatusBanner";
import { PrimaryButton } from "../../components/FormField";
import { useBackendStatus } from "../../hooks/useBackendStatus";
import { appraisalCriteriaApi, type AppraisalQuestion } from "../../lib/teamApi";

type DraftQuestion = Omit<AppraisalQuestion, "questionId"> & { questionId?: string; localId: string };

let localIdCounter = 0;
const nextLocalId = () => `local-${++localIdCounter}`;

export default function AppraisalCriteria() {
  const status = useBackendStatus();

  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await appraisalCriteriaApi.getCriteria();
        setQuestions(data.map((q) => ({ ...q, localId: nextLocalId() })));
      } catch {
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const total = questions.filter((q) => q.isActive).reduce((sum, q) => sum + (Number(q.weightage) || 0), 0);

  const addQuestion = () => {
    setQuestions((cur) => [
      ...cur,
      { localId: nextLocalId(), questionText: "", weightage: 0, isActive: true },
    ]);
    setSuccess(null);
  };

  const removeQuestion = (localId: string) => {
    setQuestions((cur) => cur.filter((q) => q.localId !== localId));
    setSuccess(null);
  };

  const updateQuestion = (localId: string, updates: Partial<DraftQuestion>) => {
    setQuestions((cur) => cur.map((q) => (q.localId === localId ? { ...q, ...updates } : q)));
    setSuccess(null);
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    if (questions.some((q) => q.isActive && !q.questionText.trim())) {
      setError("Every active question needs criteria text.");
      return;
    }
    if (total !== 100) {
      setError(`Total weightage must equal 100% (currently ${total}%).`);
      return;
    }

    setSaving(true);
    try {
      const saved = await appraisalCriteriaApi.saveCriteria(
        questions.map(({ localId: _localId, ...q }) => q),
      );
      setQuestions(saved.map((q) => ({ ...q, localId: nextLocalId() })));
      setSuccess("Appraisal criteria saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save appraisal criteria.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Appraisal Criteria" activeKey="appraisal-criteria">
      <BackendStatusBanner status={status} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Appraisal Questions &amp; Weightage</h2>
        <button
          type="button"
          onClick={addQuestion}
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
        >
          <Plus size={16} /> Add Question
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : questions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-brand-dark">
              <ClipboardList size={24} />
            </span>
            <p className="text-sm font-semibold text-gray-900">No appraisal criteria yet</p>
            <p className="max-w-sm text-sm text-gray-500">
              Add questions and assign weightage — they must total 100% before you can save.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => (
              <div
                key={q.localId}
                className={`flex flex-col gap-3 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-center ${
                  !q.isActive ? "opacity-50" : ""
                }`}
              >
                <input
                  type="text"
                  value={q.questionText}
                  onChange={(e) => updateQuestion(q.localId, { questionText: e.target.value })}
                  placeholder="e.g. Job Knowledge"
                  className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={q.weightage}
                    onChange={(e) => updateQuestion(q.localId, { weightage: Number(e.target.value) })}
                    className="w-20 rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={q.isActive}
                    onChange={(e) => updateQuestion(q.localId, { isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-brand-dark focus:ring-brand"
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={() => removeQuestion(q.localId)}
                  aria-label="Remove question"
                  className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5">
          <p className={`text-sm font-semibold ${total === 100 ? "text-emerald-600" : "text-rose-600"}`}>
            Total weightage: {total}% {total === 100 ? "✓" : "(must equal 100%)"}
          </p>
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}

        <div className="mt-4 max-w-xs">
          <PrimaryButton type="button" onClick={handleSave} loading={saving} disabled={loading || questions.length === 0}>
            Save Criteria
          </PrimaryButton>
        </div>
      </div>
    </DashboardLayout>
  );
}
