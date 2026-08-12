import { Building2, Calendar, ChevronLeft, IdCard, Info, Pencil } from "lucide-react";
import type {
  AppraisalFormDetail,
  FormQuestion,
} from "@/modules/appraisal/api/appraisalApi";
import StatusBadge from "@/components/common/StatusBadge";
import { KIND_META, kindOf } from "@/modules/performance/components/questionTypes";

type Props = {
  form: AppraisalFormDetail;
  onClose: () => void;
  /**
   * Offered only to someone who can actually write forms. Omitted rather than
   * disabled: a dead Edit button advertises a door this reader cannot open.
   */
  onEdit?: () => void;
};

/**
 * Read-only form viewer that presents the form structure cleanly, matching how
 * reviewers see questions on the evaluation page but without any submission UI.
 *
 * Separate from FormEditor so the "view" path is not a disabled editor: a form
 * shown to someone who cannot change it should read like documentation, not like
 * an interface they cannot type into.
 *
 * The audience comes from the form's own resolved `departmentNames` /
 * `designationNames` rather than from the id lists plus a lookup table — the
 * server already de-duplicated and sorted them, so re-deriving them here would
 * be a second, drifting answer to the same question.
 */
export default function ViewForm({ form, onClose, onEdit }: Props) {
  const activeQuestions = form.questions.filter((q) => q.isActive);
  const inactiveQuestions = form.questions.filter((q) => !q.isActive);

  const scoredQuestions = activeQuestions.filter((q) => q.questionType !== "text_feedback");
  const weightTotal = scoredQuestions.reduce((sum, q) => sum + Number(q.weightage || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header with form metadata */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-900">{form.formName}</h2>
            <StatusBadge status={form.status} />
            {form.status === "Published" && !form.isActive && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                Paused
              </span>
            )}
          </div>
          {form.description && (
            <p className="text-sm text-gray-600">{form.description}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-dark px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
            >
              <Pencil size={14} />
              Edit
            </button>
          )}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <ChevronLeft size={14} />
            Back
          </button>
        </div>
      </div>

      {/* Metadata cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-gray-50 p-4">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
            <Calendar size={13} />
            Schedule
          </p>
          <p className="text-base font-semibold text-gray-900">{form.evaluationType}</p>
        </div>

        <div className="rounded-xl bg-gray-50 p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
            Questions
          </p>
          <p className="text-base font-semibold text-gray-900">
            {activeQuestions.length} active
            {inactiveQuestions.length > 0 && (
              <span className="ml-1 text-sm font-normal text-gray-400">
                · {inactiveQuestions.length} inactive
              </span>
            )}
          </p>
        </div>

        <div className="rounded-xl bg-gray-50 p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
            Weight Total
          </p>
          <p
            className={`text-base font-semibold ${
              weightTotal === 100 ? "text-green-600" : "text-amber-600"
            }`}
          >
            {weightTotal}%
            <span className="ml-1 text-sm font-normal text-gray-400">/ 100%</span>
          </p>
        </div>
      </div>

      {/* Audience section */}
      {(form.departmentNames.length > 0 || form.designationNames.length > 0) && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Applies To</h3>
          <div className="space-y-3">
            {form.departmentNames.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                  <Building2 size={12} />
                  Departments ({form.departmentNames.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {form.departmentNames.map((name) => (
                    <span
                      key={name}
                      className="flex items-center gap-1 rounded-md bg-brand-light/50 px-2 py-1 text-xs font-medium text-brand-dark ring-1 ring-brand/20"
                    >
                      <Building2 size={11} className="shrink-0 opacity-70" />
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {form.designationNames.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                  <IdCard size={12} />
                  Designations ({form.designationNames.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {form.designationNames.map((name) => (
                    <span
                      key={name}
                      className="flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200"
                    >
                      <IdCard size={11} className="shrink-0 opacity-70" />
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active questions */}
      {activeQuestions.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Questions ({activeQuestions.length})
          </h3>
          <div className="space-y-3">
            {activeQuestions.map((q, index) => (
              <QuestionCard key={q.questionId} question={q} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Inactive questions */}
      {inactiveQuestions.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-500">
            Inactive Questions ({inactiveQuestions.length})
            <span className="text-xs font-normal">
              These are excluded from evaluations
            </span>
          </h3>
          <div className="space-y-3 opacity-60">
            {inactiveQuestions.map((q, index) => (
              <QuestionCard
                key={q.questionId}
                question={q}
                index={activeQuestions.length + index}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One question card, matching how it appears on the evaluation form. */
function QuestionCard({ question, index }: { question: FormQuestion; index: number }) {
  const kind = kindOf(question.questionType, question.ratingScale, question.ratingMin);
  const meta = KIND_META[kind];

  const isScored = question.questionType !== "text_feedback";

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">Q{index + 1}</span>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {meta.label}
            </span>
            {question.isRequired && (
              <span className="text-xs text-rose-500" title="Required">
                Required
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-900">{question.questionText}</p>
          {question.description && (
            <p className="mt-1 text-xs text-gray-500">{question.description}</p>
          )}
        </div>

        {isScored && (
          <div className="shrink-0 text-right">
            <p className="text-xs text-gray-400">Weight</p>
            <p className="text-base font-semibold text-gray-900">{question.weightage}%</p>
          </div>
        )}
      </div>

      {/* Rating scale */}
      {question.questionType === "rating" && (
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium text-gray-700">
            Rating scale: {question.ratingMin}–{question.ratingScale}
          </p>
          <div className="flex items-center justify-between text-xs text-gray-500">
            {question.minLabel && <span>{question.minLabel}</span>}
            {!question.minLabel && <span>{question.ratingMin}</span>}
            <div className="flex-1 px-3">
              <div className="h-1.5 rounded-full bg-gray-200" />
            </div>
            {question.maxLabel && <span>{question.maxLabel}</span>}
            {!question.maxLabel && <span>{question.ratingScale}</span>}
          </div>
        </div>
      )}

      {/* Options */}
      {question.options.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-700">
            Options ({question.options.length})
          </p>
          {question.options.map((opt, i) => (
            <div
              key={opt.optionId}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm text-gray-700">
                <span className="text-xs text-gray-400">{i + 1}.</span>
                {opt.optionText}
              </span>
              <span className="text-xs text-gray-500">Score: {opt.score}</span>
            </div>
          ))}
        </div>
      )}

      {/* Text feedback hint */}
      {question.questionType === "text_feedback" && (
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="flex items-center gap-1.5 text-xs text-gray-600">
            <Info size={12} />
            Reviewers write free-form feedback. This question carries no weight.
          </p>
        </div>
      )}
    </div>
  );
}
