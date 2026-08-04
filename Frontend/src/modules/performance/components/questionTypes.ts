import type {
  BankOptionInput,
  BankQuestionInput,
  QuestionType,
} from "@/modules/appraisal/api/appraisalApi";

/*
 * The five types the DB CHECK constraint accepts. `rating` deliberately has no
 * options editor: the scale is per form link (`rating_scale`), not a property of
 * the bank question, so a form may reuse one question at 1–5 and another at
 * 1–10.
 */
export const TYPE_META: Record<
  QuestionType,
  { label: string; hint: string; hasOptions: boolean; scored: boolean }
> = {
  rating: {
    label: "Rating",
    hint: "Reviewers pick a number. The scale (1–5, 1–10, …) is set per form, not here — so one question can be reused at different scales.",
    hasOptions: false,
    scored: true,
  },
  yes_no: {
    label: "Yes / No",
    hint: "Exactly two options. Leave them untouched to accept the defaults (Yes = 1, No = 0).",
    hasOptions: true,
    scored: true,
  },
  multiple_choice: {
    label: "Multiple Choice",
    hint: "Between 2 and 20 options, rendered as radio buttons. Each carries a score.",
    hasOptions: true,
    scored: true,
  },
  dropdown: {
    label: "Dropdown",
    hint: "Between 2 and 20 options, rendered as a select. Scored identically to multiple choice.",
    hasOptions: true,
    scored: true,
  },
  text_feedback: {
    label: "Text Feedback",
    hint: "Free text. It carries no weight — there is nothing to score, so weighting it would shrink the scored denominator and inflate every total.",
    hasOptions: false,
    scored: false,
  },
};

export const TYPE_ORDER: QuestionType[] = [
  "rating",
  "yes_no",
  "multiple_choice",
  "dropdown",
  "text_feedback",
];

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 20;

export const YES_NO_DEFAULTS: BankOptionInput[] = [
  { optionText: "Yes", score: 1 },
  { optionText: "No", score: 0 },
];

export const blankOption = (): BankOptionInput => ({ optionText: "", score: 0 });

/**
 * Client-side mirror of the service's per-type rules.
 *
 * Duplicated deliberately, not trusted instead of the server: the backend is
 * still the authority, but catching this here turns a 400 round-trip into an
 * inline message next to the field that caused it.
 */
export function validate(draft: BankQuestionInput): string | null {
  if (!draft.questionText.trim()) return "Question text is required.";
  if (draft.questionText.length > 500)
    return "Question text cannot exceed 500 characters.";

  const meta = TYPE_META[draft.questionType];
  if (!meta.hasOptions) return null;

  const options = draft.options ?? [];
  if (draft.questionType === "yes_no") {
    if (options.length !== 2)
      return "Yes / No questions need exactly two options.";
  } else if (options.length < MIN_OPTIONS) {
    return `${meta.label} questions need at least ${MIN_OPTIONS} options.`;
  } else if (options.length > MAX_OPTIONS) {
    return `${meta.label} questions can have at most ${MAX_OPTIONS} options.`;
  }

  if (options.some((o) => !o.optionText.trim())) return "Every option needs text.";
  if (
    options.some((o) => !Number.isFinite(o.score) || o.score < 0 || o.score > 999.99)
  )
    return "Option scores must be between 0 and 999.99.";

  return null;
}

// ---------------------------------------------------------------------------
// Builder presets
// ---------------------------------------------------------------------------

/**
 * What the form builder offers as a "question type".
 *
 * Rating (1–5) and Rating (1–10) are the same stored type — the scale lives on
 * the form link's `ratingScale`, not on the bank question. Splitting them here
 * is a presentation choice so HR picks a concrete scale instead of a type plus a
 * loose number field; nothing downstream needs a migration for it.
 */
export type QuestionKind =
  | "rating-5"
  | "rating-10"
  | "yes_no"
  | "multiple_choice"
  | "dropdown"
  | "text_feedback";

export const KIND_ORDER: QuestionKind[] = [
  "rating-5",
  "rating-10",
  "yes_no",
  "multiple_choice",
  "dropdown",
  "text_feedback",
];

export const KIND_META: Record<
  QuestionKind,
  {
    label: string;
    short: string;
    hint: string;
    questionType: QuestionType;
    /** Undefined for the types where the scale is meaningless. */
    ratingScale?: number;
    hasOptions: boolean;
    scored: boolean;
  }
> = {
  "rating-5": {
    label: "Rating (1–5)",
    short: "1–5",
    hint: "Reviewers pick a whole number from 1 to 5.",
    questionType: "rating",
    ratingScale: 5,
    hasOptions: false,
    scored: true,
  },
  "rating-10": {
    label: "Rating (1–10)",
    short: "1–10",
    hint: "Reviewers pick a whole number from 1 to 10.",
    questionType: "rating",
    ratingScale: 10,
    hasOptions: false,
    scored: true,
  },
  yes_no: {
    label: "Yes / No",
    short: "Y/N",
    hint: "Two options with a score each. Defaults to Yes = 1, No = 0.",
    questionType: "yes_no",
    hasOptions: true,
    scored: true,
  },
  multiple_choice: {
    label: "Multiple Choice",
    short: "Choice",
    hint: "2–20 radio options, each carrying its own score.",
    questionType: "multiple_choice",
    hasOptions: true,
    scored: true,
  },
  dropdown: {
    label: "Dropdown",
    short: "Select",
    hint: "2–20 options in a select. Scored identically to multiple choice.",
    questionType: "dropdown",
    hasOptions: true,
    scored: true,
  },
  text_feedback: {
    label: "Text Feedback",
    short: "Text",
    hint: "Free text. Unscored, so its weight is fixed at 0%.",
    questionType: "text_feedback",
    hasOptions: false,
    scored: false,
  },
};

/** Collapses a stored `(type, ratingScale)` pair back into a builder preset. */
export function kindOf(questionType: QuestionType, ratingScale: number): QuestionKind {
  if (questionType !== "rating") return questionType;
  // Anything that is not exactly 5 reads as the 1–10 preset. Legacy rows can
  // hold 7 or 100; rounding them to the nearer preset is better than crashing,
  // and re-saving normalises them.
  return ratingScale === 5 ? "rating-5" : "rating-10";
}
