import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import SidePanel from "@/components/dialogs/SidePanel";
import InfoTip from "@/components/common/InfoTip";
import SearchableMultiSelect from "@/modules/performance/components/SearchableMultiSelect";
import {
  formsApi,
  type AppraisalForm,
  type EvaluationType,
  type FormQuestion,
  type FormStatus,
} from "@/modules/appraisal/api/appraisalApi";
import type {
  Department,
  Designation,
} from "@/modules/settings/api/settingsApi";

/** The three cadences, as picker rows. Mirrors the editor's own list. */
const SCHEDULE_ITEMS = [
  { id: "Daily", label: "Daily", detail: "Generated every working day, before the shift starts." },
  { id: "Weekly", label: "Weekly", detail: "Generated on the last working day of each week." },
  { id: "Monthly", label: "Monthly", detail: "Generated on the last working day of each month." },
];

/** Weight rows are keyed on the form link id, which is what answers key on too. */
type WeightDraft = Record<string, string>;

/**
 * Everything about a form that gets revised after it is written, in a drawer
 * beside the list.
 *
 * The split against the full editor is by what the change *is*, not by how many
 * fields it touches. Renaming a form, adding a department to its audience,
 * moving it from monthly to weekly, or correcting a weight are all one-line
 * edits to an existing form — they used to cost a full-page editor round trip.
 * Authoring questions is the editor's job and stays there.
 *
 * Weights are the exception that earns its place here: they are the one number
 * that blocks publishing, so being able to fix a 95% total without opening the
 * builder is the difference between one click and a detour. They are editable
 * only while the form is Draft, because publishing freezes them onto the review
 * snapshots — the server enforces the same rule.
 *
 * The audience and the weights are fetched rather than read off the table row:
 * the list endpoint returns department *names* for display, and saving needs ids.
 */
export default function QuickEditPanel({
  form,
  departments,
  designations,
  canAssign,
  onClose,
  onSaved,
  onError,
  onNotice,
}: {
  form: AppraisalForm;
  departments: Department[];
  designations: Designation[];
  canAssign: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (err: unknown, msg: string) => void;
  onNotice: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState(form.formName);
  const [description, setDescription] = useState(form.description ?? "");
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [designationIds, setDesignationIds] = useState<string[]>([]);
  const [evaluationType, setEvaluationType] = useState<EvaluationType>(
    form.evaluationType,
  );
  const [status, setStatus] = useState<FormStatus>(form.status);
  const [isActive, setIsActive] = useState(form.isActive);
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  /*
   * Weights live as strings while being typed. A number-typed state would have
   * to coerce "" and a half-typed "1." into something, and every keystroke would
   * fight the input's own value.
   */
  const [weights, setWeights] = useState<WeightDraft>({});

  const isDraft = form.status === "Draft";

  useEffect(() => {
    let alive = true;
    formsApi
      .get(form.formId)
      .then((detail) => {
        if (!alive) return;
        setDepartmentIds(
          detail.assignments
            .filter((a) => a.targetType === "department")
            .map((a) => a.targetId),
        );
        setDesignationIds(
          detail.assignments
            .filter((a) => a.targetType === "designation")
            .map((a) => a.targetId),
        );
        setQuestions(detail.questions);
        setWeights(
          Object.fromEntries(
            detail.questions.map((q) => [q.questionId, String(q.weightage)]),
          ),
        );
      })
      .catch((err) => onError(err, "Could not load this form's details."))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [form.formId, onError]);

  // Same client-side scoping as the editor: a designation outside the chosen
  // departments would be saved but never shown.
  const visibleDesignations = useMemo(() => {
    if (departmentIds.length === 0) return designations;
    const allowed = new Set(departmentIds);
    return designations.filter((d) => allowed.has(d.departmentId));
  }, [designations, departmentIds]);

  /*
   * Only active, scored questions count toward the 100%. text_feedback carries
   * no score and is excluded rather than allowed to consume part of the total —
   * a weighted comment box would shrink the scored denominator and inflate every
   * review. This mirrors `publishForm` exactly, so the number shown here is the
   * number the server will check.
   */
  const scoredQuestions = useMemo(
    () =>
      questions.filter(
        (q) => q.isActive && q.questionType !== "text_feedback",
      ),
    [questions],
  );

  const weightTotal = useMemo(
    () =>
      scoredQuestions.reduce(
        (sum, q) => sum + (Number(weights[q.questionId]) || 0),
        0,
      ),
    [scoredQuestions, weights],
  );

  const weightsChanged = useMemo(
    () =>
      questions.some(
        (q) => (Number(weights[q.questionId]) || 0) !== Number(q.weightage),
      ),
    [questions, weights],
  );

  const nameError =
    formName.trim().length === 0
      ? "A form needs a name."
      : formName.trim().length > 150
        ? "Keep the name to 150 characters or fewer."
        : undefined;

  const willPublish = status === "Published" && form.status !== "Published";
  const publishBlocked =
    willPublish &&
    (scoredQuestions.length === 0 || Math.round(weightTotal) !== 100);

  const save = async () => {
    if (nameError) return;
    setSaving(true);
    try {
      /*
       * Leaving the archive comes first. `updateForm` refuses an archived form
       * outright, so restoring one and renaming it in the same save has to
       * un-archive before the rename — the reverse order fails on the first
       * call with nothing applied.
       */
      const restoring = form.status === "Archived" && status !== "Archived";
      if (restoring) {
        await formsApi.changeStatus(form.formId, { status: "Draft" });
      }

      await formsApi.update(form.formId, {
        formName: formName.trim(),
        description: description.trim(),
        evaluationType,
        // Omitted entirely when this user cannot set the audience — an empty
        // array would read as "clear it" rather than "leave it alone".
        ...(canAssign ? { departmentIds, designationIds } : {}),
      });

      /*
       * Questions are only re-sent when a weight actually moved. The endpoint
       * replaces the form's whole question set, so calling it needlessly would
       * rewrite every link row (and its display order) for a rename.
       *
       * Every field is echoed back, not just the weight: an omitted ratingScale,
       * ratingMin or minLabel would be re-defaulted server-side rather than
       * preserved.
       */
      if (weightsChanged) {
        await formsApi.saveQuestions(
          form.formId,
          questions.map((q) => ({
            questionId: q.questionId,
            questionText: q.questionText,
            questionType: q.questionType,
            description: q.description ?? undefined,
            weightage: Number(weights[q.questionId]) || 0,
            isActive: q.isActive,
            isRequired: q.isRequired,
            ratingScale: q.ratingScale,
            ratingMin: q.ratingMin,
            minLabel: q.minLabel ?? undefined,
            maxLabel: q.maxLabel ?? undefined,
          })),
        );
      }

      /*
       * Status last, and through the same endpoint the row menu uses, so the
       * publish rules, the archive semantics and the audit entry are identical
       * whichever way the change was made. Skipped when nothing moved — an
       * unchanged PATCH would still write an audit row.
       */
      // After a restore the form is already Draft, so only a further move to
      // Published is still outstanding.
      const statusOutstanding = restoring
        ? status !== "Draft"
        : status !== form.status;

      if (statusOutstanding || isActive !== form.isActive) {
        await formsApi.changeStatus(form.formId, {
          ...(statusOutstanding ? { status } : {}),
          ...(isActive !== form.isActive ? { isActive } : {}),
        });
      }

      onNotice(
        willPublish
          ? `Updated and published "${formName.trim()}".`
          : `Updated "${formName.trim()}".`,
      );
      await onSaved();
      onClose();
    } catch (err) {
      onError(err, "Could not save those changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      open
      title="Quick edit"
      description={form.formName}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading || Boolean(nameError) || publishBlocked}
            title={
              publishBlocked
                ? "Active scored weights must total exactly 100% before publishing."
                : nameError
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving
              ? "Saving…"
              : willPublish
                ? "Save & Publish"
                : "Save changes"}
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-900">
              Form name
            </span>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              maxLength={150}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-brand/20 ${
                nameError
                  ? "border-red-300 focus:border-red-400"
                  : "border-gray-200 focus:border-brand"
              }`}
            />
            {nameError && (
              <span className="mt-1 block text-xs text-red-600">{nameError}</span>
            )}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-900">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this form is for."
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>

          <SearchableMultiSelect
            label="Departments"
            placeholder="Whole organisation"
            hint="Only employees in the selected departments take part. Leave empty to apply across the whole organisation."
            items={departments.map((d) => ({ id: d.departmentId, label: d.name }))}
            selected={departmentIds}
            disabled={!canAssign}
            emptyText="No departments have been set up yet."
            onChange={(ids) => {
              setDepartmentIds(ids);
              // Drop designations that just fell out of scope, so what is saved
              // matches what is on screen.
              const allowed = new Set(ids);
              setDesignationIds((prev) =>
                ids.length === 0
                  ? prev
                  : prev.filter((id) =>
                      designations.some(
                        (d) =>
                          d.designationId === id && allowed.has(d.departmentId),
                      ),
                    ),
              );
            }}
          />

          <SearchableMultiSelect
            label="Evaluator designations"
            placeholder="Any designation"
            hint="Team Lead is the usual choice, but any designation can evaluate."
            items={visibleDesignations.map((d) => ({
              id: d.designationId,
              label: d.name,
              sublabel: d.departmentName,
            }))}
            selected={designationIds}
            disabled={!canAssign}
            emptyText={
              departmentIds.length > 0
                ? "No designations exist in the selected departments."
                : "No designations have been set up yet."
            }
            onChange={setDesignationIds}
          />

          <SearchableMultiSelect
            label="Schedule"
            multiple={false}
            hint="Evaluations are generated automatically on this cadence."
            items={SCHEDULE_ITEMS}
            selected={evaluationType}
            emptyText="No schedules are available."
            onChange={(type) => setEvaluationType(type as EvaluationType)}
          />

          <StatusField
            current={form.status}
            value={status}
            onChange={setStatus}
            isActive={isActive}
            onActiveChange={setIsActive}
            reviewCount={form.reviewCount}
          />

          <WeightsField
            questions={questions}
            scored={scoredQuestions}
            weights={weights}
            total={weightTotal}
            editable={isDraft}
            onChange={(questionId, value) =>
              setWeights((prev) => ({ ...prev, [questionId]: value }))
            }
          />
        </div>
      )}
    </SidePanel>
  );
}

/**
 * Status and Active as the two independent axes they are on the server.
 *
 * Draft ⇄ Published and Archived ⇄ restored are lifecycle moves; Active is a
 * reversible pause on an otherwise published form. Collapsing them into one
 * four-value picker was the tempting shape and the wrong one — "Inactive" would
 * have had to mean both "paused" and "retired".
 */
function StatusField({
  current,
  value,
  onChange,
  isActive,
  onActiveChange,
  reviewCount,
}: {
  current: FormStatus;
  value: FormStatus;
  onChange: (next: FormStatus) => void;
  isActive: boolean;
  onActiveChange: (next: boolean) => void;
  reviewCount: number;
}) {
  /*
   * Unpublishing is refused server-side once evaluations exist: reviews are
   * scored against the frozen question snapshots, and reopening them would
   * change what a submitted score meant. Shown disabled with the reason rather
   * than hidden, so the current state stays legible.
   */
  const draftBlocked =
    current === "Published" && reviewCount > 0
      ? `${reviewCount} evaluation(s) are scored against this form. Duplicate it to rework the questions.`
      : undefined;

  const options: Array<{ value: FormStatus; blocked?: string }> = [
    { value: "Draft", blocked: draftBlocked },
    { value: "Published" },
    { value: "Archived" },
  ];

  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-900">
        Status
        <InfoTip
          text="Publishing freezes the questions so already-submitted reviews stay consistent. Archiving retires the form permanently; deactivating only pauses new evaluations and can be undone."
          label="About form status"
        />
      </span>

      <div className="flex gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={Boolean(option.blocked)}
            title={option.blocked}
            className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              value === option.value
                ? "border-brand bg-brand-light/50 text-brand-dark"
                : "border-gray-200 text-gray-600 hover:border-brand/60"
            }`}
          >
            {option.value}
          </button>
        ))}
      </div>

      {draftBlocked && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-500">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
          {draftBlocked}
        </p>
      )}

      {/* Only meaningful on a Published form: a Draft generates nothing either
          way, and an Archived one is forced inactive server-side. */}
      {value === "Published" && (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => onActiveChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand focus:ring-brand/30"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-900">
              Active
            </span>
            <span className="block text-xs leading-snug text-gray-500">
              {isActive
                ? "Evaluations are generated on the schedule above."
                : "Paused — no new evaluations are generated. Existing ones are unaffected."}
            </span>
          </span>
        </label>
      )}
    </div>
  );
}

/**
 * The weights of a Draft form's questions, with a running total against 100%.
 *
 * Read-only once the form is Published: the weights are frozen onto the review
 * snapshots at that point, and editing them would silently restate scores
 * already given. The rows are still shown, because "what is this form weighted
 * at" is a fair question to ask of a live form.
 */
function WeightsField({
  questions,
  scored,
  weights,
  total,
  editable,
  onChange,
}: {
  questions: FormQuestion[];
  scored: FormQuestion[];
  weights: WeightDraft;
  total: number;
  editable: boolean;
  onChange: (questionId: string, value: string) => void;
}) {
  if (questions.length === 0) {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-medium text-gray-900">
          Weights
        </span>
        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-500">
          This form has no questions yet. Open the editor to add some.
        </p>
      </div>
    );
  }

  const rounded = Math.round(total * 100) / 100;
  const balanced = Math.round(total) === 100;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-sm font-medium text-gray-900">
          Weights
          <InfoTip
            text="Active scored questions must total exactly 100% before the form can be published. Text feedback questions carry no weight and are excluded from the total."
            label="About weights"
          />
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            balanced
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
          }`}
        >
          {rounded}%
        </span>
      </div>

      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {questions.map((question) => {
          const unweighted = question.questionType === "text_feedback";
          const counted = scored.some((q) => q.questionId === question.questionId);
          return (
            <div
              key={question.questionId}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm ${
                    counted ? "text-gray-800" : "text-gray-400"
                  }`}
                  title={question.questionText}
                >
                  {question.questionText}
                </span>
                {!counted && (
                  <span className="block text-xs text-gray-400">
                    {unweighted ? "Text feedback — unscored" : "Inactive"}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  inputMode="decimal"
                  value={weights[question.questionId] ?? "0"}
                  disabled={!editable || unweighted}
                  onChange={(e) => onChange(question.questionId, e.target.value)}
                  className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-right text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-gray-50 disabled:text-gray-400"
                />
                <span className="text-xs text-gray-400">%</span>
              </span>
            </div>
          );
        })}
      </div>

      {!editable && (
        <p className="mt-1.5 text-xs text-gray-500">
          Weights are frozen once a form is published, so submitted evaluations
          keep the scores they were given.
        </p>
      )}
      {editable && !balanced && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-500">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
          Active scored weights total {rounded}% — publishing needs exactly 100%.
        </p>
      )}
    </div>
  );
}
