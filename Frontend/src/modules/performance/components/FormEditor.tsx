import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  GripVertical,
  Info,
  Layers,
  Library,
  Lock,
  Pencil,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";

import Modal from "@/components/dialogs/Modal";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import SearchableMultiSelect, {
  type SelectItem,
} from "@/modules/performance/components/SearchableMultiSelect";
import {
  formsApi,
  questionBankApi,
  type AppraisalFormDetail,
  type BankQuestion,
  type EvaluationType,
  type FormQuestionInput,
  type QuestionOptionInput,
} from "@/modules/appraisal/api/appraisalApi";
import type { Department, Designation } from "@/modules/settings/api/settingsApi";
import {
  KIND_META,
  KIND_ORDER,
  MAX_OPTIONS,
  MIN_OPTIONS,
  YES_NO_DEFAULTS,
  kindOf,
  type QuestionKind,
} from "@/modules/performance/components/questionTypes";

// ---------------------------------------------------------------------------
// Draft shapes
//
// The editor works on its own mutable copies rather than on the API types: a
// question that has not been saved yet has no server id, and options need a
// stable React key while their text is still empty. `localId` supplies both.
// ---------------------------------------------------------------------------

type OptionDraft = {
  localId: string;
  optionId?: string;
  optionText: string;
  score: number;
};

type QuestionDraft = {
  localId: string;
  /** The form link id. Absent until the question has been saved once. */
  questionId?: string;
  /** Set when this row reuses a bank question rather than owning its wording. */
  bankQuestionId?: string;
  questionText: string;
  description: string;
  kind: QuestionKind;
  weightage: number;
  isActive: boolean;
  isRequired: boolean;
  minLabel: string;
  maxLabel: string;
  options: OptionDraft[];
  /** True once published: this row reads its frozen copy and cannot be edited. */
  isSnapshotted: boolean;
};

let idCounter = 0;
const nextLocalId = () => `local-${Date.now()}-${idCounter++}`;

const blankOptionDraft = (): OptionDraft => ({
  localId: nextLocalId(),
  optionText: "",
  score: 0,
});

function blankQuestion(kind: QuestionKind = "rating-10"): QuestionDraft {
  const meta = KIND_META[kind];
  return {
    localId: nextLocalId(),
    questionText: "",
    description: "",
    kind,
    weightage: 0,
    isActive: true,
    isRequired: true,
    minLabel: "",
    maxLabel: "",
    options: meta.hasOptions
      ? kind === "yes_no"
        ? YES_NO_DEFAULTS.map((o) => ({ ...blankOptionDraft(), ...o }))
        : [blankOptionDraft(), blankOptionDraft()]
      : [],
    isSnapshotted: false,
  };
}

/** Rebuilds the option list when the type changes, so no stale rows survive. */
function optionsForKind(kind: QuestionKind, current: OptionDraft[]): OptionDraft[] {
  const meta = KIND_META[kind];
  if (!meta.hasOptions) return [];
  if (kind === "yes_no") {
    return YES_NO_DEFAULTS.map((o) => ({ ...blankOptionDraft(), ...o }));
  }
  return current.length >= MIN_OPTIONS
    ? current
    : [...current, ...Array.from({ length: MIN_OPTIONS - current.length }, blankOptionDraft)];
}

function toDraft(q: AppraisalFormDetail["questions"][number]): QuestionDraft {
  return {
    localId: nextLocalId(),
    questionId: q.questionId,
    bankQuestionId: q.bankQuestionId,
    questionText: q.questionText,
    description: q.description ?? "",
    kind: kindOf(q.questionType, q.ratingScale),
    weightage: Number(q.weightage),
    isActive: q.isActive,
    isRequired: q.isRequired,
    minLabel: q.minLabel ?? "",
    maxLabel: q.maxLabel ?? "",
    options: q.options.map((o) => ({
      localId: nextLocalId(),
      optionId: o.optionId,
      optionText: o.optionText,
      score: Number(o.score),
    })),
    isSnapshotted: q.isSnapshotted,
  };
}

/** Rounded the way the backend rounds, so the 100% gate agrees on both sides. */
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Evaluation schedule
//
// Keyed by evaluation type so adding Quarterly is one entry here plus one
// cadence object on the backend — the page has no per-type branching anywhere
// else.
// ---------------------------------------------------------------------------

const SCHEDULES: Array<{
  type: EvaluationType;
  when: string;
  detail: string;
}> = [
  {
    type: "Daily",
    when: "Every working day, before the shift starts",
    detail:
      "A new evaluation is generated each working day ahead of the employee's shift, so the reviewer finds it waiting. Non-working days are skipped.",
  },
  {
    type: "Weekly",
    when: "On the last working day of each week",
    detail:
      "One evaluation per week, generated on the week's final working day. A week missed while the system was down is generated once, retroactively.",
  },
  {
    type: "Monthly",
    when: "On the last working day of each month",
    detail:
      "One evaluation per month, generated on the month's final working day. A missed month is generated once, retroactively.",
  },
];

/** The schedule list as picker rows, so the cadence reads like the other two selections. */
const SCHEDULE_ITEMS: SelectItem[] = SCHEDULES.map((s) => ({
  id: s.type,
  label: s.type,
  sublabel: s.when,
  detail: s.detail,
}));

// ---------------------------------------------------------------------------
// Validation — mirrors the server rules so the reason is visible before submit
// ---------------------------------------------------------------------------

type Problem = { message: string; localId?: string };

function collectProblems(
  formName: string,
  questions: QuestionDraft[],
): { blocking: Problem[]; weightTotal: number } {
  const blocking: Problem[] = [];

  if (!formName.trim()) blocking.push({ message: "The form needs a name." });
  if (formName.length > 150)
    blocking.push({ message: "The form name cannot exceed 150 characters." });

  const active = questions.filter((q) => q.isActive);
  const scored = active.filter((q) => KIND_META[q.kind].scored);

  if (active.length === 0)
    blocking.push({ message: "Add at least one active question." });
  else if (scored.length === 0)
    blocking.push({
      message: "Add at least one scored question — text feedback alone cannot be graded.",
    });

  // Only active questions are validated — an inactive one is excluded from the
  // form, so half-finished wording on it must not block a publish. Numbering
  // still counts from the full list so "Question 3" is the third card on screen.
  questions.forEach((q, index) => {
    if (!q.isActive) return;
    const meta = KIND_META[q.kind];
    const label = q.questionText.trim() || `Question ${index + 1}`;

    if (!q.questionText.trim())
      blocking.push({ message: `Question ${index + 1} needs a title.`, localId: q.localId });
    if (q.questionText.length > 500)
      blocking.push({
        message: `"${label}" exceeds 500 characters.`,
        localId: q.localId,
      });
    if (q.description.length > 500)
      blocking.push({
        message: `The description on "${label}" exceeds 500 characters.`,
        localId: q.localId,
      });

    if (!meta.scored && q.weightage > 0)
      blocking.push({
        message: `"${label}" is text feedback, so its weight must be 0%.`,
        localId: q.localId,
      });

    if (!meta.hasOptions) return;

    if (q.kind === "yes_no" && q.options.length !== 2)
      blocking.push({
        message: `"${label}" needs exactly two options.`,
        localId: q.localId,
      });
    if (q.kind !== "yes_no" && q.options.length < MIN_OPTIONS)
      blocking.push({
        message: `"${label}" needs at least ${MIN_OPTIONS} options.`,
        localId: q.localId,
      });
    if (q.options.length > MAX_OPTIONS)
      blocking.push({
        message: `"${label}" can have at most ${MAX_OPTIONS} options.`,
        localId: q.localId,
      });
    if (q.options.some((o) => !o.optionText.trim()))
      blocking.push({
        message: `Every option on "${label}" needs text.`,
        localId: q.localId,
      });
    if (q.options.some((o) => !Number.isFinite(o.score) || o.score < 0 || o.score > 999.99))
      blocking.push({
        message: `Option scores on "${label}" must be between 0 and 999.99.`,
        localId: q.localId,
      });
    // Every option scoring zero makes the question unanswerable in practice —
    // no answer could ever earn anything, so the weight is silently lost.
    if (q.options.length > 0 && !q.options.some((o) => Number(o.score) > 0))
      blocking.push({
        message: `"${label}" needs at least one option worth more than zero.`,
        localId: q.localId,
      });
  });

  const weightTotal = round2(scored.reduce((sum, q) => sum + Number(q.weightage || 0), 0));

  if (weightTotal !== 100)
    blocking.push({
      message: `Scored question weights must total exactly 100% — currently ${weightTotal}%.`,
    });

  return { blocking, weightTotal };
}

function toPayload(questions: QuestionDraft[]): FormQuestionInput[] {
  return questions.map((q) => {
    const meta = KIND_META[q.kind];
    const options: QuestionOptionInput[] | undefined = meta.hasOptions
      ? q.options.map((o) => ({ optionText: o.optionText.trim(), score: Number(o.score) }))
      : undefined;

    return {
      questionId: q.questionId,
      /*
       * Only sent for a row freshly picked from the bank. On an existing link the
       * backend ignores `questionText` whenever `bankQuestionId` is present, so
       * echoing it back would silently discard every wording edit made here.
       * Omitting it lets the service resolve the bank row from the link instead —
       * and refuse with a 409 if the row is shared with another form.
       */
      bankQuestionId: q.questionId ? undefined : q.bankQuestionId,
      questionText: q.questionText.trim(),
      questionType: meta.questionType,
      description: q.description.trim() || undefined,
      weightage: meta.scored ? Number(q.weightage) : 0,
      isActive: q.isActive,
      isRequired: q.isRequired,
      ratingScale: meta.ratingScale,
      minLabel: q.minLabel.trim() || undefined,
      maxLabel: q.maxLabel.trim() || undefined,
      options,
    };
  });
}

// ---------------------------------------------------------------------------
// Option editor — text, score and order for one option-based question
// ---------------------------------------------------------------------------

function OptionEditor({
  kind,
  options,
  readOnly,
  onChange,
}: {
  kind: QuestionKind;
  options: OptionDraft[];
  readOnly: boolean;
  onChange: (options: OptionDraft[]) => void;
}) {
  const fixedCount = kind === "yes_no";

  const patch = (index: number, next: Partial<OptionDraft>) =>
    onChange(options.map((o, i) => (i === index ? { ...o, ...next } : o)));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= options.length) return;
    const copy = [...options];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(copy);
  };

  const highest = Math.max(0, ...options.map((o) => Number(o.score) || 0));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">
          Options{" "}
          <span className="font-normal text-gray-400">
            ({options.length}
            {fixedCount ? "/2" : `/${MAX_OPTIONS}`})
          </span>
        </span>
        {!readOnly && !fixedCount && options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => onChange([...options, blankOptionDraft()])}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark"
          >
            <Plus size={12} />
            Add option
          </button>
        )}
      </div>

      <div className="space-y-2">
        {options.map((opt, index) => (
          <div key={opt.localId} className="flex items-center gap-1.5">
            {!readOnly && !fixedCount ? (
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move option ${index + 1} up`}
                  className="rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-25"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === options.length - 1}
                  aria-label={`Move option ${index + 1} down`}
                  className="rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-25"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
            ) : (
              <span className="w-[18px] shrink-0 text-center text-xs text-gray-300">
                {index + 1}
              </span>
            )}

            <input
              type="text"
              value={opt.optionText}
              onChange={(e) => patch(index, { optionText: e.target.value })}
              disabled={readOnly}
              placeholder={`Option ${index + 1}`}
              maxLength={500}
              className="min-w-0 flex-1 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:bg-gray-50 disabled:text-gray-500"
            />

            <label className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs text-gray-400">Score</span>
              <input
                type="number"
                value={opt.score}
                min={0}
                max={999.99}
                step={0.01}
                onChange={(e) => patch(index, { score: Number(e.target.value) })}
                disabled={readOnly}
                className="w-[74px] rounded-lg bg-gray-100 px-2.5 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </label>

            {!readOnly && !fixedCount && options.length > MIN_OPTIONS && (
              <button
                type="button"
                onClick={() => onChange(options.filter((_, i) => i !== index))}
                aria-label={`Remove option ${index + 1}`}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-gray-400">
        An answer is normalised against the highest score here
        {highest > 0 ? ` (${highest})` : ""}, so the scores are relative — 0/5/10 and
        0/1/2 grade identically.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question card
// ---------------------------------------------------------------------------

function QuestionCard({
  question,
  index,
  total,
  expanded,
  readOnly,
  hasProblem,
  dragging,
  dragOver,
  onToggleExpand,
  onPatch,
  onRemove,
  onMove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  question: QuestionDraft;
  index: number;
  total: number;
  expanded: boolean;
  readOnly: boolean;
  hasProblem: boolean;
  dragging: boolean;
  dragOver: boolean;
  onToggleExpand: () => void;
  onPatch: (next: Partial<QuestionDraft>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const meta = KIND_META[question.kind];
  const locked = readOnly || question.isSnapshotted;

  const changeKind = (kind: QuestionKind) => {
    const nextMeta = KIND_META[kind];
    onPatch({
      kind,
      options: optionsForKind(kind, question.options),
      // Unscored questions cannot carry weight — the server rejects it, so zero
      // it here rather than letting the footer show a total that will 400.
      weightage: nextMeta.scored ? question.weightage : 0,
    });
  };

  return (
    <div
      draggable={!locked}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (locked) return;
        // Without preventDefault the browser refuses the drop outright.
        e.preventDefault();
        onDragOver();
      }}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`rounded-xl bg-white shadow-sm ring-1 transition ${
        dragging
          ? "opacity-40 ring-brand"
          : dragOver
            ? "ring-2 ring-brand"
            : hasProblem
              ? "ring-red-200"
              : question.isActive
                ? "ring-gray-100"
                : "ring-gray-200"
      } ${!question.isActive ? "bg-gray-50/60" : ""}`}
    >
      {/* Header — always visible, click to expand */}
      <div className="flex items-start gap-2 p-3 sm:p-4">
        {!locked && (
          <span
            className="mt-1 hidden shrink-0 cursor-grab text-gray-300 transition hover:text-gray-500 active:cursor-grabbing sm:block"
            title="Drag to reorder"
            aria-hidden="true"
          >
            <GripVertical size={16} />
          </span>
        )}

        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-brand-dark">
          {index + 1}
        </span>

        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <p
            className={`truncate text-sm font-medium ${
              question.questionText.trim() ? "text-gray-900" : "text-gray-400"
            }`}
          >
            {question.questionText.trim() || "Untitled question"}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
            <span>{meta.label}</span>
            <span className="text-gray-300">·</span>
            <span>{meta.scored ? `${question.weightage}%` : "unweighted"}</span>
            {question.isRequired && (
              <>
                <span className="text-gray-300">·</span>
                <span>required</span>
              </>
            )}
            {!question.isActive && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-amber-600">inactive</span>
              </>
            )}
            {question.bankQuestionId && !question.isSnapshotted && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-brand-dark">from bank</span>
              </>
            )}
          </p>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          {hasProblem && (
            <AlertTriangle size={14} className="mr-1 text-red-500" aria-label="Has errors" />
          )}
          {!locked && (
            <>
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={index === 0}
                aria-label={`Move question ${index + 1} up`}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-25"
              >
                <ChevronUp size={15} />
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={index === total - 1}
                aria-label={`Move question ${index + 1} down`}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-25"
              >
                <ChevronDown size={15} />
              </button>
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove question ${index + 1}`}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? "Collapse question" : "Expand question"}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-gray-100 p-3 sm:p-4">
          {/*
            * Title and type sit together at the top: they are the two decisions
            * that shape every other field below, and the type quietly rewrites
            * the option list when it changes.
            */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-700">
              Question title
            </span>
            <textarea
              value={question.questionText}
              onChange={(e) => onPatch({ questionText: e.target.value })}
              disabled={locked}
              rows={2}
              maxLength={500}
              placeholder="e.g. How consistently did this employee meet deadlines?"
              className="w-full resize-none rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-gray-700">
              Answer type
            </span>
            <div className="flex flex-wrap gap-1.5">
              {KIND_ORDER.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => changeKind(kind)}
                  disabled={locked}
                  title={KIND_META[kind].hint}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    question.kind === kind
                      ? "bg-brand-light text-brand-dark ring-1 ring-brand/40"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {KIND_META[kind].label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-500">{meta.hint}</p>
          </div>

          {/* Scoring — weight and the two toggles that decide whether it is asked at all */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:gap-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-700">
                Weight (%)
              </span>
              <input
                type="number"
                value={meta.scored ? question.weightage : 0}
                onChange={(e) => onPatch({ weightage: Number(e.target.value) })}
                disabled={locked || !meta.scored}
                min={0}
                max={100}
                step={0.01}
                className="w-full rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60 disabled:bg-gray-50 disabled:text-gray-500"
              />
              {!meta.scored && (
                <span className="mt-1 block text-xs text-gray-400">
                  Unscored, so no weight.
                </span>
              )}
            </label>

            <div className="flex flex-col justify-center gap-1.5 sm:pt-5">
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={question.isRequired}
                  onChange={(e) => onPatch({ isRequired: e.target.checked })}
                  disabled={locked}
                  className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-dark focus:ring-brand/60"
                />
                <span className="text-sm text-gray-700">
                  Required
                  <span className="ml-1.5 text-xs text-gray-400">
                    reviewers must answer this
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={question.isActive}
                  onChange={(e) => onPatch({ isActive: e.target.checked })}
                  disabled={locked}
                  className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-dark focus:ring-brand/60"
                />
                <span className="text-sm text-gray-700">
                  Active
                  <span className="ml-1.5 text-xs text-gray-400">
                    inactive keeps history but is not asked
                  </span>
                </span>
              </label>
            </div>
          </div>

          {meta.hasOptions && (
            <OptionEditor
              kind={question.kind}
              options={question.options}
              readOnly={locked}
              onChange={(options) => onPatch({ options })}
            />
          )}

          {/*
            * Description and the two scale labels are all optional and rarely
            * touched, so they fold away — they were the bulk of the clutter on a
            * card whose only real decisions are the four fields above. Opened
            * automatically when something is already in them, so an existing
            * value is never hidden.
            */}
          <details
            open={Boolean(
              question.description || question.minLabel || question.maxLabel,
            )}
            className="group rounded-lg bg-gray-50/80"
          >
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 transition hover:text-gray-700">
              <ChevronRight
                size={13}
                className="shrink-0 transition group-open:rotate-90"
              />
              Optional guidance &amp; labels
            </summary>

            <div className="space-y-3 px-3 pb-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-gray-700">
                  Description
                </span>
                <input
                  type="text"
                  value={question.description}
                  onChange={(e) => onPatch({ description: e.target.value })}
                  disabled={locked}
                  maxLength={500}
                  placeholder="Guidance shown to the reviewer under the title"
                  className="w-full rounded-lg bg-white px-3 py-2 text-sm text-gray-800 outline-none ring-1 ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </label>

              {question.kind.startsWith("rating") && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-gray-700">
                      Label for 1
                    </span>
                    <input
                      type="text"
                      value={question.minLabel}
                      onChange={(e) => onPatch({ minLabel: e.target.value })}
                      disabled={locked}
                      maxLength={60}
                      placeholder="e.g. Needs improvement"
                      className="w-full rounded-lg bg-white px-3 py-2 text-sm text-gray-800 outline-none ring-1 ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-gray-700">
                      Label for {meta.ratingScale}
                    </span>
                    <input
                      type="text"
                      value={question.maxLabel}
                      onChange={(e) => onPatch({ maxLabel: e.target.value })}
                      disabled={locked}
                      maxLength={60}
                      placeholder="e.g. Consistently exceeds"
                      className="w-full rounded-lg bg-white px-3 py-2 text-sm text-gray-800 outline-none ring-1 ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </label>
                </div>
              )}
            </div>
          </details>

          {question.isSnapshotted && (
            <p className="flex items-start gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <Lock size={12} className="mt-0.5 shrink-0" />
              Frozen at publish. This question reads its own copy, so bank edits no
              longer reach it — which is what keeps already-submitted reviews honest.
            </p>
          )}
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Question bank picker — reuse instead of retyping
// ---------------------------------------------------------------------------

/**
 * One bank row: a checkbox, a one-line summary, and a Preview toggle.
 *
 * The preview is collapsed by default and opens in place. Showing every option
 * up front turned a 20-row bank into a wall of text, and a modal-over-modal for
 * one question's options would be worse than the problem.
 */
function BankRow({
  row,
  used,
  checked,
  onToggle,
}: {
  row: BankQuestion;
  used: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const meta = KIND_META[kindOf(row.questionType, 10)];

  return (
    <div
      className={`rounded-xl ring-1 transition ${
        used
          ? "bg-gray-50 ring-gray-100 opacity-60"
          : checked
            ? "bg-brand-light/40 ring-brand/40"
            : "bg-white ring-gray-100 hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={used}
          aria-label={`Add "${row.questionText}"`}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-dark focus:ring-brand/60 disabled:cursor-not-allowed"
        />

        <label
          title={used ? "Already on this form." : undefined}
          className={`min-w-0 flex-1 ${used ? "cursor-not-allowed" : "cursor-pointer"}`}
          onClick={() => !used && onToggle()}
        >
          <span className="block text-sm text-gray-800">{row.questionText}</span>
          <span className="mt-0.5 block text-xs text-gray-400">
            {meta.label}
            {row.options.length > 0 ? ` · ${row.options.length} options` : ""}
            {" · "}
            {row.usageCount === 0
              ? "unused"
              : `used on ${row.usageCount} form${row.usageCount === 1 ? "" : "s"}`}
            {used ? " · already added" : ""}
          </span>
        </label>

        <button
          type="button"
          onClick={() => setPreview((prev) => !prev)}
          aria-expanded={preview}
          title={preview ? "Hide preview" : "Preview this question"}
          aria-label={`Preview "${row.questionText}"`}
          className={`shrink-0 rounded-lg p-1.5 transition ${
            preview
              ? "bg-white text-brand-dark ring-1 ring-brand/40"
              : "text-gray-400 hover:bg-white hover:text-gray-700"
          }`}
        >
          <Eye size={15} />
        </button>
      </div>

      {preview && (
        <div className="border-t border-gray-100 px-3 py-2.5 pl-10">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            How reviewers will see it
          </p>
          <p className="text-sm text-gray-800">{row.questionText}</p>

          {row.options.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {[...row.options]
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((opt) => (
                  <li
                    key={opt.optionId}
                    className="flex items-center justify-between gap-3 rounded-md bg-white px-2.5 py-1.5 text-xs ring-1 ring-gray-100"
                  >
                    <span className="min-w-0 truncate text-gray-700">
                      {opt.optionText}
                    </span>
                    <span className="shrink-0 text-gray-400">{Number(opt.score)} pts</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-gray-400">
              {/*
                * A bank rating question has no options of its own — the scale is
                * set per form, so the preview says so rather than showing an
                * empty list that reads as missing data.
                */}
              {meta.hint} The scale is set on the form once this question is added.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BankPicker({
  open,
  alreadyUsed,
  onClose,
  onPick,
  onError,
}: {
  open: boolean;
  alreadyUsed: Set<string>;
  onClose: () => void;
  onPick: (questions: BankQuestion[]) => void;
  onError: (err: unknown, fallback: string) => void;
}) {
  const [rows, setRows] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setLoading(true);
    questionBankApi
      /*
       * 100 is the server's hard maximum per page. Ranking by usage happens
       * client-side because `usageCount` is counted after pagination and so is
       * not a sortable column — newest-first is the closest server-side proxy,
       * and the search box covers a bank deeper than one page.
       */
      .list({ limit: 100, isActive: "true", sortBy: "createdAt", sortOrder: "DESC" })
      .then((res) => setRows(res.data))
      .catch((err) => onError(err, "Could not load the question bank."))
      .finally(() => setLoading(false));
  }, [open, onError]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matching = needle
      ? rows.filter((r) => r.questionText.toLowerCase().includes(needle))
      : rows;
    return [...matching].sort((a, b) => b.usageCount - a.usageCount);
  }, [rows, search]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = () => {
    onPick(rows.filter((r) => picked.has(r.questionId)));
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Add from Question Bank"
      description="Reused questions keep their wording in the bank, so one edit there updates every draft form using them."
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-3">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the bank…"
            className="w-full rounded-lg bg-gray-100 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
          />
        </div>

        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              {rows.length === 0
                ? "The bank is empty. Add questions here first, or type them directly on the form."
                : `Nothing matches "${search}".`}
            </p>
          ) : (
            visible.map((row) => (
              <BankRow
                key={row.questionId}
                row={row}
                used={alreadyUsed.has(row.questionId)}
                checked={picked.has(row.questionId)}
                onToggle={() => toggle(row.questionId)}
              />
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={picked.size === 0}
            className="rounded-lg bg-gradient-to-r from-brand to-brand-dark px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:opacity-50"
          >
            Add {picked.size > 0 ? `${picked.size} ` : ""}question{picked.size === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

export type FormEditorProps = {
  /** null = creating. The form is persisted on the first save, not before. */
  form: AppraisalFormDetail | null;
  departments: Department[];
  designations: Designation[];
  canUpdate: boolean;
  canAssign: boolean;
  /**
   * Read-only preview: every input disabled and the write actions hidden, so the
   * same component answers "what is on this form" without the risk of a stray
   * keystroke being saved.
   */
  viewOnly?: boolean;
  /** Offered in view mode to switch this same form into edit mode in place. */
  onEdit?: () => void;
  onClose: () => void;
  /** Called after every successful write so the parent list stays in step. */
  onSaved: (formId: string) => Promise<void>;
  onError: (err: unknown, fallback: string) => void;
  onNotice: (message: string) => void;
};

export default function FormEditor({
  form,
  departments,
  designations,
  canUpdate,
  canAssign,
  viewOnly = false,
  onEdit,
  onClose,
  onSaved,
  onError,
  onNotice,
}: FormEditorProps) {
  const [formName, setFormName] = useState(form?.formName ?? "");
  const [description, setDescription] = useState(form?.description ?? "");
  const [evaluationType, setEvaluationType] = useState<EvaluationType>(
    form?.evaluationType ?? "Monthly",
  );
  const [departmentIds, setDepartmentIds] = useState<string[]>(() =>
    (form?.assignments ?? [])
      .filter((a) => a.targetType === "department")
      .map((a) => a.targetId),
  );
  const [designationIds, setDesignationIds] = useState<string[]>(() =>
    (form?.assignments ?? [])
      .filter((a) => a.targetType === "designation")
      .map((a) => a.targetId),
  );
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    () => form?.questions.map(toDraft) ?? [],
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bankOpen, setBankOpen] = useState(false);
  const [saving, setSaving] = useState<null | "draft" | "publish" | "duplicate">(null);
  const [showProblems, setShowProblems] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const status = form?.status ?? "Draft";
  const isDraft = status === "Draft";
  /*
   * Two independent reasons a field can be inert: this user cannot write forms,
   * or the form was opened for viewing. Collapsed here so every control below
   * asks one question instead of repeating the pair.
   */
  const editable = canUpdate && !viewOnly;
  const audienceEditable = canAssign && !viewOnly;
  // Questions freeze on publish — that is what protects in-flight reviews. The
  // form's name, cadence and audience stay editable.
  const questionsLocked = !isDraft || !editable;

  /*
   * Default the audience to Team Lead on a brand-new form. It is the common case
   * by a wide margin, but it is a preselection rather than a rule — HR can clear
   * it and pick any designation, and a lead with an empty roster still gets to
   * evaluate themselves.
   */
  const defaultApplied = useRef(false);
  useEffect(() => {
    if (form || defaultApplied.current || designations.length === 0) return;
    defaultApplied.current = true;
    const lead = designations.find((d) => /team\s*lead/i.test(d.name));
    if (lead) setDesignationIds([lead.designationId]);
  }, [form, designations]);

  /*
   * Designations are scoped to the chosen departments. Filtered client-side
   * because the full list is already loaded — a fetch per checkbox click would
   * add latency for data we hold. With no department chosen, every designation
   * is offered rather than none: an empty list reads as "broken", and a form
   * with no department restriction is a legitimate org-wide form.
   */
  const visibleDesignations = useMemo(() => {
    if (departmentIds.length === 0) return designations;
    const allowed = new Set(departmentIds);
    return designations.filter((d) => allowed.has(d.departmentId));
  }, [designations, departmentIds]);

  // Narrowing the departments must not leave a designation selected that is no
  // longer on offer — it would be invisible but still sent on save.
  useEffect(() => {
    const visible = new Set(visibleDesignations.map((d) => d.designationId));
    setDesignationIds((prev) => {
      const next = prev.filter((id) => visible.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [visibleDesignations]);

  const { blocking, weightTotal } = useMemo(
    () => collectProblems(formName, questions),
    [formName, questions],
  );
  const problemIds = useMemo(
    () => new Set(blocking.map((p) => p.localId).filter(Boolean) as string[]),
    [blocking],
  );
  const canPublish = blocking.length === 0;

  const patchQuestion = useCallback((localId: string, next: Partial<QuestionDraft>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.localId === localId ? { ...q, ...next } : q)),
    );
  }, []);

  const toggleExpand = useCallback((localId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
  }, []);

  const addQuestion = () => {
    const draft = blankQuestion();
    setQuestions((prev) => [...prev, draft]);
    setExpanded((prev) => new Set(prev).add(draft.localId));
  };

  const addFromBank = (picked: BankQuestion[]) => {
    const drafts = picked.map<QuestionDraft>((row) => ({
      ...blankQuestion(kindOf(row.questionType, 10)),
      bankQuestionId: row.questionId,
      questionText: row.questionText,
      options: row.options
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((o) => ({
          localId: nextLocalId(),
          optionId: o.optionId,
          optionText: o.optionText,
          score: Number(o.score),
        })),
    }));
    setQuestions((prev) => [...prev, ...drafts]);
    if (drafts.length === 1) {
      setExpanded((prev) => new Set(prev).add(drafts[0].localId));
    }
  };

  const moveQuestion = (from: number, to: number) => {
    if (to < 0 || to >= questions.length || from === to) return;
    setQuestions((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  };

  /** Spreads the remaining weight evenly across the scored active questions. */
  const distributeWeights = () => {
    const scored = questions.filter((q) => q.isActive && KIND_META[q.kind].scored);
    if (scored.length === 0) return;
    // Give every question the same share, then push the rounding remainder onto
    // the last one so the total lands on exactly 100 rather than 99.99.
    const each = Math.floor((100 / scored.length) * 100) / 100;
    const remainder = round2(100 - each * scored.length);
    const lastId = scored[scored.length - 1].localId;
    setQuestions((prev) =>
      prev.map((q) => {
        if (!scored.some((s) => s.localId === q.localId)) return q;
        return {
          ...q,
          weightage: q.localId === lastId ? round2(each + remainder) : each,
        };
      }),
    );
  };

  /**
   * Writes the form, its audience and its questions.
   *
   * Ordered so the form exists before anything can reference it: create/update
   * carries the audience (the backend replaces those rows in one transaction),
   * then the questions go in a second call. Questions are skipped once the form
   * leaves Draft — the server would refuse them, and asking is a wasted 400.
   */
  const persist = async (): Promise<string> => {
    const payload = {
      formName: formName.trim(),
      description: description.trim(),
      evaluationType,
      // Only sent when this user may set the audience; otherwise the keys are
      // omitted entirely so the backend leaves the existing rows alone rather
      // than reading an empty array as "clear them".
      ...(canAssign ? { departmentIds, designationIds } : {}),
    };

    const saved = form
      ? await formsApi.update(form.formId, payload)
      : await formsApi.create(payload);

    if (isDraft && canUpdate) {
      await formsApi.saveQuestions(saved.formId, toPayload(questions));
    }

    return saved.formId;
  };

  const saveDraft = async () => {
    // The name is the one field with nothing sensible to fall back on, so it is
    // checked even for a draft. Everything else may legitimately be incomplete —
    // that is what a draft is for.
    if (!formName.trim()) {
      setShowProblems(true);
      onError(null, "The form needs a name before it can be saved.");
      return;
    }
    setSaving("draft");
    try {
      const formId = await persist();
      onNotice(
        form ? `Saved "${formName.trim()}".` : `Created "${formName.trim()}" as a draft.`,
      );
      await onSaved(formId);
    } catch (err) {
      onError(err, "Could not save the form.");
    } finally {
      setSaving(null);
    }
  };

  const publish = async () => {
    if (!canPublish) {
      setShowProblems(true);
      onError(null, "Fix the listed problems before publishing.");
      return;
    }
    setSaving("publish");
    try {
      // Saved first, then published: publish freezes whatever is stored, so
      // publishing without saving would snapshot the previous version.
      const formId = await persist();
      await formsApi.publish(formId);
      onNotice(`Published "${formName.trim()}". Its questions are now frozen.`);
      await onSaved(formId);
    } catch (err) {
      onError(err, "Could not publish the form.");
    } finally {
      setSaving(null);
    }
  };

  const duplicate = async () => {
    if (!form) {
      onError(null, "Save this form before duplicating it.");
      return;
    }
    setSaving("duplicate");
    try {
      const copy = await formsApi.duplicate(form.formId);
      onNotice(`Created "${copy.formName}" as an editable draft.`);
      await onSaved(copy.formId);
    } catch (err) {
      onError(err, "Could not duplicate the form.");
    } finally {
      setSaving(null);
    }
  };

  const busy = saving !== null;
  const activeCount = questions.filter((q) => q.isActive).length;

  return (
    <div className="space-y-4 pb-28">
      {/* ---- Header ---- */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-gray-900">
            {form ? formName || form.formName : "New Evaluation Form"}
            <StatusBadge status={status} />
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {viewOnly
              ? `Viewing only — nothing here can be changed. ${activeCount} active question(s) · ${form?.reviewCount ?? 0} submitted evaluation(s)`
              : form
                ? `${activeCount} active question(s) · ${form.reviewCount} submitted evaluation(s)`
                : "Everything for this form is on this page — fill it in and save when you are ready."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close the editor"
        >
          <X size={18} />
        </button>
      </div>

      {viewOnly ? (
        <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <Eye size={15} className="mt-0.5 shrink-0 text-gray-400" />
          <span>
            Read-only view of this {status.toLowerCase()} form. Use Edit Form below to
            make changes.
          </span>
        </div>
      ) : (
        !isDraft && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Lock size={15} className="mt-0.5 shrink-0" />
            <span>
              This form is {status}, so its questions are frozen — that is what keeps
              already-submitted reviews consistent. Its name, schedule and audience can
              still be changed. To rework the questions, duplicate it into a new draft.
            </span>
          </div>
        )
      )}

      {/* ---- 1. Form information ---- */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Layers size={15} className="text-gray-400" />
          Form Information
        </h3>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-900">
              Form name <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              disabled={!editable}
              maxLength={150}
              placeholder="e.g. Monthly Performance Review"
              className="w-full rounded-lg bg-gray-100 px-3.5 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-900">
              Description <span className="font-normal text-gray-400">(optional)</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!editable}
              rows={2}
              maxLength={500}
              placeholder="What this form is for, and how reviewers should approach it."
              className="w-full resize-none rounded-lg bg-gray-100 px-3.5 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SearchableMultiSelect
              label="Departments"
              placeholder="Whole organisation"
              hint="Only employees in the selected departments take part. Leave empty to apply across the whole organisation."
              items={departments.map((d) => ({ id: d.departmentId, label: d.name }))}
              selected={departmentIds}
              disabled={!audienceEditable}
              emptyText="No departments have been set up yet."
              onChange={setDepartmentIds}
            />

            <SearchableMultiSelect
              label="Evaluator designations"
              placeholder="Any designation"
              hint={
                departmentIds.length > 0
                  ? "Narrowed to the departments selected above. Team Lead is the usual choice, but any designation can evaluate."
                  : "Team Lead is the usual choice, but any designation can evaluate. Pick departments above to narrow this list."
              }
              items={visibleDesignations.map((d) => ({
                id: d.designationId,
                label: d.name,
                sublabel: d.departmentName,
              }))}
              selected={designationIds}
              disabled={!audienceEditable}
              emptyText={
                departmentIds.length > 0
                  ? "No designations exist in the selected departments."
                  : "No designations have been set up yet."
              }
              onChange={setDesignationIds}
            />
          </div>

          <p className="flex items-start gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <Info size={12} className="mt-0.5 shrink-0 text-gray-400" />
            An evaluator with no team members can still submit their own evaluation
            against this form, provided their designation is selected above.
          </p>
        </div>
      </section>

      {/* ---- 2. Evaluation schedule ---- */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <CalendarClock size={15} className="text-gray-400" />
          Evaluation Schedule
        </h3>
        <p className="mb-4 text-xs text-gray-500">
          Evaluations are generated automatically — there is nothing to schedule by
          hand. Pick how often.
        </p>

        <SearchableMultiSelect
          label="Frequency"
          multiple={false}
          items={SCHEDULE_ITEMS}
          selected={evaluationType}
          disabled={!editable}
          emptyText="No schedules are available."
          onChange={(type) => setEvaluationType(type as EvaluationType)}
        />
      </section>

      {/* ---- 3. Questions ---- */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Library size={15} className="text-gray-400" />
              Questions{" "}
              <span className="font-normal text-gray-400">({questions.length})</span>
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Drag a card by its handle to reorder, or use the arrows. Click a card to
              open it.
            </p>
          </div>

          {!questionsLocked && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBankOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark"
              >
                <Library size={13} />
                From bank
              </button>
              <button
                type="button"
                onClick={distributeWeights}
                disabled={activeCount === 0}
                title="Split 100% evenly across the active scored questions"
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark disabled:opacity-40"
              >
                Even weights
              </button>
              <button
                type="button"
                onClick={addQuestion}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-dark px-3 py-2 text-xs font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
              >
                <Plus size={13} />
                Add question
              </button>
            </div>
          )}
        </div>

        {questions.length === 0 ? (
          <EmptyState
            icon={Library}
            title="No questions yet"
            description={
              questionsLocked
                ? "This form has no questions."
                : "Add a question, or pull one in from the question bank to reuse wording you already have."
            }
          />
        ) : (
          <div className="space-y-2.5">
            {questions.map((question, index) => (
              <QuestionCard
                key={question.localId}
                question={question}
                index={index}
                total={questions.length}
                expanded={expanded.has(question.localId)}
                readOnly={questionsLocked}
                hasProblem={showProblems && problemIds.has(question.localId)}
                dragging={dragIndex === index}
                dragOver={dragOverIndex === index && dragIndex !== index}
                onToggleExpand={() => toggleExpand(question.localId)}
                onPatch={(next) => patchQuestion(question.localId, next)}
                onRemove={() =>
                  setQuestions((prev) =>
                    prev.filter((q) => q.localId !== question.localId),
                  )
                }
                onMove={(direction) => moveQuestion(index, index + direction)}
                onDragStart={() => setDragIndex(index)}
                onDragOver={() => setDragOverIndex(index)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onDrop={() => {
                  if (dragIndex !== null) moveQuestion(dragIndex, index);
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---- Sticky footer: weight total, problems, actions ---- */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6">
          {showProblems && blocking.length > 0 && (
            <ul className="mb-2.5 max-h-24 space-y-1 overflow-y-auto rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {blocking.map((problem, i) => (
                <li key={`${problem.message}-${i}`} className="flex items-start gap-1.5">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  <span>{problem.message}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Weight total
                </p>
                <p
                  className={`text-xl font-semibold leading-tight ${
                    weightTotal === 100 ? "text-green-600" : "text-amber-600"
                  }`}
                >
                  {weightTotal}%
                  <span className="ml-1 text-xs font-normal text-gray-400">/ 100%</span>
                </p>
              </div>
              {/*
               * The publish-readiness badge is advice for someone who can act on it.
               * In view mode there is nothing to fix from here, so it is dropped
               * rather than shown as an instruction the reader cannot follow.
               */}
              {!viewOnly &&
                (blocking.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowProblems((prev) => !prev)}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                  >
                    <AlertTriangle size={12} />
                    {blocking.length} to fix before publishing
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700">
                    <CheckCircle2 size={12} />
                    Ready to publish
                  </span>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {viewOnly ? "Close" : "Cancel"}
              </button>

              {/*
               * View mode offers exactly one way forward — switch this same form
               * into edit mode — so the reader is never hunting for it.
               */}
              {viewOnly && onEdit && canUpdate && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-dark px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
                >
                  <Pencil size={14} />
                  Edit Form
                </button>
              )}

              {!viewOnly && form && canUpdate && (
                <button
                  type="button"
                  onClick={duplicate}
                  disabled={busy}
                  title="Copy this form, its questions and its audience into a new editable draft"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark disabled:opacity-50"
                >
                  <Copy size={14} />
                  {saving === "duplicate" ? "Duplicating…" : "Duplicate"}
                </button>
              )}

              {!viewOnly && canUpdate && (
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  <Save size={14} />
                  {saving === "draft" ? "Saving…" : isDraft ? "Save as Draft" : "Save"}
                </button>
              )}

              {!viewOnly && canUpdate && isDraft && (
                <button
                  type="button"
                  onClick={publish}
                  disabled={busy || !canPublish}
                  title={
                    canPublish
                      ? "Publish and freeze the questions"
                      : "Every field must be complete and the scored weights must total exactly 100%"
                  }
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-dark px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send size={14} />
                  {saving === "publish" ? "Publishing…" : "Publish Form"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <BankPicker
        open={bankOpen}
        alreadyUsed={
          new Set(
            questions
              .map((q) => q.bankQuestionId)
              .filter((id): id is string => Boolean(id)),
          )
        }
        onClose={() => setBankOpen(false)}
        onPick={addFromBank}
        onError={onError}
      />
    </div>
  );
}
