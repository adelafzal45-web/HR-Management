import { useEffect, useState } from "react";
import { ClipboardList, Info } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import { formsApi, type AppraisalForm, type FormQuestion } from "@/modules/appraisal/api/appraisalApi";

export default function AppraisalCriteria() {
  const [forms, setForms] = useState<AppraisalForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    formsApi
      .list()
      .then((data) => {
        const published = data.filter((f) => f.status === "Published" && f.isActive);
        setForms(published);
        if (published.length > 0 && !selectedFormId) {
          setSelectedFormId(published[0].formId);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load evaluation forms."))
      .finally(() => setLoading(false));
  }, [selectedFormId]);

  useEffect(() => {
    if (!selectedFormId) {
      setQuestions([]);
      return;
    }
    setQuestionsLoading(true);
    formsApi
      .get(selectedFormId)
      .then((detail) => setQuestions(detail.questions.filter((q) => q.isActive)))
      .catch(() => setQuestions([]))
      .finally(() => setQuestionsLoading(false));
  }, [selectedFormId]);

  const selectedForm = forms.find((f) => f.formId === selectedFormId);
  const total = questions.reduce((sum, q) => sum + q.weightage, 0);

  return (
    <DashboardLayout title="Evaluation Rubric" activeKey="appraisal-criteria">
      <LoadingOverlay show={loading} label="Loading evaluation forms…" />

      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            This is the evaluation rubric used when reviewing your team members. Questions and weights are configured
            by HR and cannot be edited here.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && forms.length === 0 && !error ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
            <ClipboardList size={24} />
          </span>
          <p className="mt-3 text-sm font-semibold text-gray-900">No published evaluation forms yet</p>
          <p className="mt-1 text-sm text-gray-500">
            HR needs to create and publish an evaluation form before you can view the rubric.
          </p>
        </div>
      ) : (
        <>
          {forms.length > 1 && (
            <div className="mb-4">
              <label htmlFor="form-select" className="mb-2 block text-sm font-medium text-gray-700">
                Evaluation Form
              </label>
              <select
                id="form-select"
                value={selectedFormId ?? ""}
                onChange={(e) => setSelectedFormId(e.target.value)}
                className="w-full max-w-md rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
              >
                {forms.map((f) => (
                  <option key={f.formId} value={f.formId}>
                    {f.formName} ({f.evaluationType})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            {selectedForm && (
              <div className="mb-5 border-b border-gray-100 pb-4">
                <h2 className="text-base font-semibold text-gray-900">{selectedForm.formName}</h2>
                {selectedForm.description && (
                  <p className="mt-1 text-sm text-gray-500">{selectedForm.description}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Type: {selectedForm.evaluationType} · {selectedForm.questionCount} question
                  {selectedForm.questionCount === 1 ? "" : "s"}
                </p>
              </div>
            )}

            {questionsLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : questions.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">This form has no active questions.</p>
            ) : (
              <>
                <div className="space-y-3">
                  {questions.map((q) => (
                    <div
                      key={q.questionId}
                      className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{q.questionText}</p>
                        {(q.minLabel || q.maxLabel) && (
                          <p className="mt-1 text-xs text-gray-500">
                            Scale: {q.minLabel ?? "1"} → {q.maxLabel ?? String(q.ratingScale)} (1–{q.ratingScale})
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="font-semibold">{q.weightage}%</span>
                        <span className="text-gray-400">weight</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-5">
                  <p className="text-sm text-gray-600">
                    {questions.length} active question{questions.length === 1 ? "" : "s"}
                  </p>
                  <p className={`text-sm font-semibold ${total === 100 ? "text-emerald-600" : "text-amber-600"}`}>
                    Total: {total}%
                  </p>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
