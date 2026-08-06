// ============================================================================
// The appraisal API — a 1:1 mirror of Backend/src/appraisal-facade.
//
// No mocks and no demo fallback: every call hits the real backend and real
// errors surface to the caller. Screens render loading / error / empty states
// from these results.
//
// Permission required per call is noted so it's obvious which role each is for.
// ============================================================================

import { api, apiDownload, ENDPOINTS, saveBlob } from "@/lib/apiClient";

export type EvaluationType = "Daily" | "Weekly" | "Monthly";
export type FormStatus = "Draft" | "Published" | "Archived";

/**
 * The five types the backend stores. Rating (1–5) and Rating (1–10) are both
 * `rating` — the scale lives on `ratingScale`, per form link, so the two are a
 * builder-level preset rather than two database types.
 */
export type QuestionType =
  | "rating"
  | "yes_no"
  | "multiple_choice"
  | "dropdown"
  | "text_feedback";

export type QuestionOption = {
  optionId: string;
  optionText: string;
  score: number;
  displayOrder: number;
};

export type FormQuestion = {
  /** This form's link id. Answers are keyed on it, not on the bank row. */
  questionId: string;
  /** The reusable bank row behind the link. */
  bankQuestionId: string;
  questionText: string;
  questionType: QuestionType;
  /** Optional helper text under the title. */
  description: string | null;
  weightage: number;
  isActive: boolean;
  isRequired: boolean;
  ratingScale: number;
  minLabel: string | null;
  maxLabel: string | null;
  displayOrder: number;
  /** Empty for `rating` and `text_feedback`. */
  options: QuestionOption[];
  /**
   * True once the form is published and this link reads its frozen copy. The
   * builder uses it to explain why a bank edit had no effect here.
   */
  isSnapshotted: boolean;
};

export type Assignment = {
  assignmentId: string;
  formId: string;
  targetType: "department" | "designation" | "employee";
  targetId: string;
  targetName: string;
};

export type AppraisalForm = {
  formId: string;
  formName: string;
  description: string;
  evaluationType: EvaluationType;
  status: FormStatus;
  isActive: boolean;
  questionCount: number;
  activeWeightTotal: number;
  assignmentCount: number;
  /**
   * Who the form applies to, resolved server-side and already de-duplicated and
   * sorted. Individual per-employee assignments are not included — the audience
   * column reads as an org rule, not a roster.
   */
  departmentNames: string[];
  designationNames: string[];
  reviewCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AppraisalFormDetail = AppraisalForm & {
  questions: FormQuestion[];
  assignments: Assignment[];
};

/** One entry in a form's revision history. */
export type FormVersionInfo = {
  version: number;
  /** The version the form is on now — the one edits and publishes hit. */
  isCurrent: boolean;
  questionCount: number;
  /** Evaluations submitted while this version was current. */
  reviewCount: number;
};

export type TeamMember = {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  designation: string;
  department: string;
  joiningDate: string;
  status: "Active" | "On Leave" | "Inactive";
  avatarUrl?: string;
  /** 128px derivative of `avatarUrl`, for small renderings. */
  avatarThumbUrl?: string;
  assignedFormId: string | null;
  assignedFormName: string | null;
  evaluationStatus: "Pending" | "Completed" | "Unassigned";
  lastReviewedAt: string | null;
  lastScore: number | null;
};

export type EvaluationScore = {
  scoreId: string;
  questionId: string;
  criteriaName: string;
  questionType: QuestionType;
  weightage: number;
  ratingScale: number;
  /** Raw rating on the question's own scale. Always 0 for non-rating types. */
  score: number;
  /** Normalised 0–100, which is what every aggregate is computed from. */
  scorePercentage: number;
  /** Option-based answers only; null for rating and text_feedback. */
  selectedOptionId: string | null;
  selectedOptionText: string | null;
  remarks: string | null;
};

export type SubmittedEvaluation = {
  appraisalId: string;
  employeeId: string;
  employeeName: string;
  formId: string;
  formName: string;
  /** The form's Daily / Weekly / Monthly cadence, for filtering own history. */
  evaluationType: string;
  reviewerName: string;
  reviewDate: string;
  reviewPeriod: string;
  totalScore: number;
  comments: string;
  recommendation: string;
  status: string;
  scores: EvaluationScore[];
};

export type EvaluationForm = {
  employeeId: string;
  employeeName: string;
  formId: string;
  formName: string;
  evaluationType: EvaluationType;
  /**
   * The period this submission belongs to, named by the form's own cadence —
   * "2026-08-04" for Daily, "2026-W32" for Weekly, "2026-08" for Monthly.
   *
   * Always send this back verbatim. It is part of the review's unique key and
   * is how the backend finds the Draft the scheduler already generated; a label
   * invented on the client creates a second review instead of filling that one.
   */
  reviewPeriod: string;
  questions: FormQuestion[];
  existing: SubmittedEvaluation | null;
};

export type TeamStats = {
  teamSize: number;
  evaluated: number;
  pending: number;
  completionRate: number;
  averageScore: number | null;
  distribution: Array<{ band: string; count: number }>;
};

export type MyEvaluations = {
  evaluations: SubmittedEvaluation[];
  latestScore: number | null;
  averageScore: number | null;
  trend: Array<{ period: string; score: number; reviewDate: string }>;
  categoryBreakdown: Array<{
    criteriaName: string;
    averageScore: number;
    weightage: number;
  }>;
};

export type Analytics = {
  totalEvaluations: number;
  employeesEvaluated: number;
  averageScore: number | null;
  distribution: Array<{ band: string; count: number }>;
  byDepartment: Array<{ name: string; averageScore: number; count: number }>;
  byDesignation: Array<{ name: string; averageScore: number; count: number }>;
  trend: Array<{ period: string; averageScore: number; count: number }>;
};

export type QuestionOptionInput = {
  optionText: string;
  score: number;
};

export type FormQuestionInput = {
  /** Omit to create a new bank question; pass the link id to keep answers. */
  questionId?: string;
  /** Reuse an existing bank row instead of creating one. */
  bankQuestionId?: string;
  questionText: string;
  questionType?: QuestionType;
  description?: string;
  weightage: number;
  isActive: boolean;
  isRequired?: boolean;
  ratingScale?: number;
  minLabel?: string;
  maxLabel?: string;
  /** Required for `multiple_choice` and `dropdown`; ignored otherwise. */
  options?: QuestionOptionInput[];
};

/**
 * Departments and designations narrow who a form applies to. Sent as a whole
 * list — the backend replaces the form's rows for whichever key is present, so
 * an omitted key leaves that tier untouched and `[]` clears it.
 */
type FormAudienceInput = {
  departmentIds?: string[];
  designationIds?: string[];
};

// ---------------------------------------------------------------------------
// HR/Admin — forms, questions, assignments
// ---------------------------------------------------------------------------

export type FormListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: FormStatus;
  evaluationType?: EvaluationType;
  departmentId?: string;
  designationId?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
};

export type FormListResult = {
  data: AppraisalForm[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const formsApi = {
  /** `appraisal-forms.view` — paginated, filtered, and sorted */
  list: (params: FormListParams = {}) =>
    api.get<FormListResult>(`${ENDPOINTS.appraisal.forms}${toQuery(params)}`),

  /** `appraisal-forms.view` */
  get: (formId: string) =>
    api.get<AppraisalFormDetail>(ENDPOINTS.appraisal.form(formId)),

  /** `appraisal-forms.create` — the form starts as Draft */
  create: (
    payload: FormAudienceInput & {
      formName: string;
      description?: string;
      evaluationType: EvaluationType;
    },
  ) => api.post<AppraisalForm>(ENDPOINTS.appraisal.forms, payload),

  /** `appraisal-forms.update` */
  update: (
    formId: string,
    payload: FormAudienceInput & {
      formName?: string;
      description?: string;
      evaluationType?: EvaluationType;
    },
  ) => api.put<AppraisalForm>(ENDPOINTS.appraisal.form(formId), payload),

  /**
   * `appraisal-forms.create` — copies the form, its questions and its
   * department/designation audience into a new Draft. The copy tracks the live
   * bank, so it carries no publish snapshots.
   */
  duplicate: (formId: string) =>
    api.post<AppraisalForm>(ENDPOINTS.appraisal.duplicateForm(formId)),

  /**
   * `appraisal-forms.update` — rejected with 400 unless the active questions'
   * weights total exactly 100%.
   */
  publish: (formId: string) =>
    api.post<AppraisalForm>(ENDPOINTS.appraisal.publishForm(formId)),

  /**
   * `appraisal-forms.update` — one call for every lifecycle move the list
   * screen offers: publish, unpublish, archive, restore, activate, deactivate.
   *
   * `status` and `isActive` are independent: archiving retires a form,
   * deactivating only pauses new evaluations. Send either or both. Unpublishing
   * is refused server-side once evaluations reference the form.
   */
  changeStatus: (
    formId: string,
    payload: { status?: FormStatus; isActive?: boolean; reason?: string },
  ) => api.patch<AppraisalForm>(ENDPOINTS.appraisal.formStatus(formId), payload),

  /** `appraisal-forms.delete` — archives instead if evaluations reference it */
  remove: (formId: string) =>
    api.delete<{ archived: boolean; message: string }>(
      ENDPOINTS.appraisal.form(formId),
    ),

  /**
   * `appraisal-forms.update` — starts a new version of a published form so it
   * can be edited. Copies the current version's questions into a new version and
   * returns the form to Draft. Existing reviews stay scored against the old
   * version. Publishing again makes the new version the one new evaluations use.
   */
  createVersion: (formId: string) =>
    api.post<AppraisalForm>(ENDPOINTS.appraisal.formVersions(formId)),

  /**
   * `appraisal-forms.view` — the form's revision history, newest first, with
   * question counts and review counts per version.
   */
  listVersions: (formId: string) =>
    api.get<FormVersionInfo[]>(ENDPOINTS.appraisal.formVersions(formId)),

  /** `appraisal-forms.update` — only allowed while the form is Draft */
  saveQuestions: (formId: string, questions: FormQuestionInput[]) =>
    api.put<FormQuestion[]>(ENDPOINTS.appraisal.formQuestions(formId), {
      questions,
    }),

  /** `appraisal-forms.view` */
  listAssignments: (formId: string) =>
    api.get<Assignment[]>(ENDPOINTS.appraisal.formAssignments(formId)),

  /**
   * `appraisal-forms.assign` — exactly one target. Allowed on a Draft; the rows
   * only take effect once the form is Published. Archived forms are rejected.
   */
  assign: (
    formId: string,
    target:
      | { departmentId: string }
      | { designationId: string }
      | { employeeId: string },
  ) =>
    api.post<Assignment>(ENDPOINTS.appraisal.formAssignments(formId), target),

  /** `appraisal-forms.assign` */
  unassign: (assignmentId: string) =>
    api.delete<{ message: string }>(ENDPOINTS.appraisal.assignment(assignmentId)),

  /** `appraisal.export` — downloads .xlsx with current filters applied */
  exportExcel: async (params: FormListParams = {}) => {
    const blob = await apiDownload(
      `${ENDPOINTS.appraisal.formsExportExcel}${toQuery(params)}`,
    );
    saveBlob(blob, `appraisal-forms-${today()}.xlsx`);
  },
};

// ---------------------------------------------------------------------------
// Team Lead — roster, stats, evaluating
// ---------------------------------------------------------------------------

export const teamAppraisalApi = {
  /** `appraisal.view` */
  getMyTeam: () => api.get<TeamMember[]>(ENDPOINTS.appraisal.myTeam),

  /** `appraisal.view` */
  getTeamStats: () => api.get<TeamStats>(ENDPOINTS.appraisal.teamStats),

  /** `appraisal.view` — resolves the employee's assigned form */
  getEvaluationForm: (employeeId: string) =>
    api.get<EvaluationForm>(ENDPOINTS.appraisal.evaluate(employeeId)),

  /** `appraisal.create` — re-submitting the same period overwrites */
  /**
   * Which field carries the answer depends on the question's type, and the
   * server validates the pairing rather than guessing:
   *
   *  - `rating`                                  → `score`, 0..ratingScale
   *  - `yes_no` / `multiple_choice` / `dropdown` → `selectedOptionId`
   *  - `text_feedback`                           → `remarks` only; unscored
   *
   * Sending the wrong one for a type is a 400 naming the question, not a
   * silent zero.
   */
  submitEvaluation: (
    employeeId: string,
    payload: {
      reviewPeriod: string;
      comments: string;
      recommendation: string;
      scores: Array<{
        questionId: string;
        score?: number;
        selectedOptionId?: string;
        remarks?: string;
      }>;
    },
  ) =>
    api.post<SubmittedEvaluation>(
      ENDPOINTS.appraisal.evaluate(employeeId),
      payload,
    ),
};

// ---------------------------------------------------------------------------
// Employee — own results only. The backend derives the employee from the JWT,
// so there is deliberately no id parameter here.
// ---------------------------------------------------------------------------

export const myAppraisalApi = {
  /** `appraisal.viewOwn` */
  getMyEvaluations: () =>
    api.get<MyEvaluations>(ENDPOINTS.appraisal.myEvaluations),
};

// ---------------------------------------------------------------------------
// HR/Admin — reporting
// ---------------------------------------------------------------------------

export const appraisalReportsApi = {
  /** `appraisal.viewAll` */
  getAllEvaluations: () =>
    api.get<SubmittedEvaluation[]>(ENDPOINTS.appraisal.allEvaluations),

  /**
   * `appraisal.viewAll` — one employee's history, breakdown and trend.
   *
   * Same payload as `myAppraisalApi.getMyEvaluations`, but for an arbitrary
   * employee. The server re-checks scope from the JWT, so a Team Lead calling
   * this for someone outside their roster gets a 403 rather than the record.
   */
  getEmployeeEvaluations: (employeeId: string) =>
    api.get<MyEvaluations>(ENDPOINTS.appraisal.employeeEvaluations(employeeId)),

  /** `appraisal.viewAll` */
  getAnalytics: () => api.get<Analytics>(ENDPOINTS.appraisal.analytics),
};

// ===========================================================================
// Question bank — five question types, reusable across forms.
//
// A Draft form reads the live bank, so an edit shows up immediately. Publishing
// freezes the wording onto the form's link row, which is why editing a question
// used by a published form is allowed and reports its blast radius rather than
// being blocked.
// ===========================================================================

// `QuestionType` is declared with the form types above — the bank and the form
// links share one set of types by design.

export type BankOption = {
  optionId: string;
  optionText: string;
  score: number;
  displayOrder: number;
};

export type BankQuestion = {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  isActive: boolean;
  /** False for `text_feedback`, which carries no weight. */
  isScored: boolean;
  options: BankOption[];
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type QuestionUsageForm = {
  formId: string;
  formName: string;
  status: string;
  evaluationType: string;
  weightage: number;
  /** Snapshotted links do not see bank edits. */
  isSnapshotted: boolean;
};

export type QuestionUsage = {
  questionId: string;
  questionText: string;
  totalForms: number;
  snapshottedForms: QuestionUsageForm[];
  liveForms: QuestionUsageForm[];
  answerCount: number;
};

/** What an edit actually touched — surfaced in the UI after saving. */
export type BankQuestionMutationResult = {
  question: BankQuestion;
  affectedDraftForms: string[];
  unaffectedPublishedForms: string[];
};

export type BankOptionInput = {
  optionId?: string;
  optionText: string;
  score: number;
  displayOrder?: number;
};

export type BankQuestionInput = {
  questionText: string;
  questionType: QuestionType;
  isActive?: boolean;
  options?: BankOptionInput[];
};

export type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/**
 * Turns a filter object into a query string.
 *
 * Empty strings, null and undefined are dropped rather than sent as blanks: the
 * backend's ValidationPipe runs `@IsUUID`/`@IsDateString` on whatever arrives,
 * and `?departmentId=` would fail validation instead of meaning "no filter".
 */
function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const questionBankApi = {
  /** `appraisal-forms.questions.manage` */
  list: (params: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "ASC" | "DESC";
    questionType?: QuestionType;
    isActive?: string;
  } = {}) =>
    api.get<Paginated<BankQuestion>>(
      `${ENDPOINTS.appraisal.questions}${toQuery(params)}`,
    ),

  /** `appraisal-forms.questions.manage` */
  create: (payload: BankQuestionInput) =>
    api.post<BankQuestionMutationResult>(ENDPOINTS.appraisal.questions, payload),

  /** `appraisal-forms.questions.manage` */
  update: (questionId: string, payload: Partial<BankQuestionInput>) =>
    api.put<BankQuestionMutationResult>(
      ENDPOINTS.appraisal.question(questionId),
      payload,
    ),

  /** `appraisal-forms.questions.manage` — deactivates if answers exist */
  remove: (questionId: string) =>
    api.delete<{ deactivated: boolean; message: string }>(
      ENDPOINTS.appraisal.question(questionId),
    ),

  /** `appraisal-forms.questions.manage` — check before editing or deleting */
  usage: (questionId: string) =>
    api.get<QuestionUsage>(ENDPOINTS.appraisal.questionUsage(questionId)),
};

// ===========================================================================
// Team Lead roster grants — HR only.
//
// DEPARTMENT mode keeps the historical behaviour (the lead sees their whole
// department). MEMBERS mode narrows them to an explicit list, and is enforced on
// both reading the roster and submitting an evaluation.
// ===========================================================================

export type TeamLeadAssignmentMode = "DEPARTMENT" | "MEMBERS";

export type TeamLeadAssignmentMember = {
  employeeId: string;
  employeeCode: string;
  name: string;
  email: string;
  department: string;
  designation: string;
};

export type TeamLeadAssignment = {
  assignmentId: string;
  teamLeadId: string;
  teamLeadName: string;
  teamLeadEmail: string;
  mode: TeamLeadAssignmentMode;
  departmentId: string | null;
  departmentName: string | null;
  members: TeamLeadAssignmentMember[];
  /** null in DEPARTMENT mode, where the count is whoever is in it today. */
  memberCount: number | null;
  createdAt: string;
};

export const teamLeadAssignmentsApi = {
  /** `appraisal.teamlead.assign` */
  list: () =>
    api.get<TeamLeadAssignment[]>(ENDPOINTS.appraisal.teamLeadAssignments),

  /** `appraisal.teamlead.assign` — departmentId XOR memberIds, per mode */
  create: (payload: {
    teamLeadId: string;
    mode: TeamLeadAssignmentMode;
    departmentId?: string;
    memberIds?: string[];
  }) =>
    api.post<TeamLeadAssignment>(
      ENDPOINTS.appraisal.teamLeadAssignments,
      payload,
    ),

  /** `appraisal.teamlead.assign` — MEMBERS mode only; replaces the whole list */
  replaceMembers: (assignmentId: string, memberIds: string[]) =>
    api.put<TeamLeadAssignment>(
      ENDPOINTS.appraisal.teamLeadAssignmentMembers(assignmentId),
      { memberIds },
    ),

  /** `appraisal.teamlead.assign` */
  remove: (assignmentId: string) =>
    api.delete<{ message: string }>(
      ENDPOINTS.appraisal.teamLeadAssignment(assignmentId),
    ),
};

// ===========================================================================
// Submit -> approve / reject / reopen.
//
// Approve and reject act on `Submitted` only; reopen returns an approved or
// rejected review to `Draft` and clears the lock so the reviewer can redo it.
// Every action appends to an append-only approval trail.
// ===========================================================================

export type ReviewApprovalAction = "SUBMIT" | "APPROVE" | "REJECT" | "REOPEN";

export type ReviewApproval = {
  approvalId: string;
  action: ReviewApprovalAction;
  actorId: string | null;
  actorName: string;
  comment: string | null;
  createdAt: string;
};

export type WorkflowResult = {
  reviewId: string;
  status: string;
  submittedAt: string | null;
  lockedAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  approvals: ReviewApproval[];
  message: string;
};

export const appraisalWorkflowApi = {
  /** `appraisal.approve` */
  approve: (reviewId: string, comment?: string) =>
    api.post<WorkflowResult>(ENDPOINTS.appraisal.approveReview(reviewId), {
      comment,
    }),

  /** `appraisal.approve` */
  reject: (reviewId: string, comment?: string) =>
    api.post<WorkflowResult>(ENDPOINTS.appraisal.rejectReview(reviewId), {
      comment,
    }),

  /** `appraisal.approve` — back to Draft, lock cleared */
  reopen: (reviewId: string, comment?: string) =>
    api.post<WorkflowResult>(ENDPOINTS.appraisal.reopenReview(reviewId), {
      comment,
    }),

  /** `appraisal.approve` — the full trail for one review */
  approvals: (reviewId: string) =>
    api.get<ReviewApproval[]>(ENDPOINTS.appraisal.reviewApprovals(reviewId)),
};

// ===========================================================================
// Stats, results and compare.
//
// All three take the same filter shape, so an export always matches the screen.
// Scoping is applied server-side from the JWT: HR sees everything, a Team Lead
// sees their roster, and an employee only their own rows — the frontend never
// passes a scope of its own.
// ===========================================================================

export type AppraisalStatsFilters = {
  dateFrom?: string;
  dateTo?: string;
  departmentId?: string;
  designationId?: string;
  employeeId?: string;
  evaluationType?: EvaluationType;
  status?: string;
};

export type StatsSummary = {
  workingDays: number;
  submittedForms: number;
  pendingForms: number;
  approvedForms: number;
  rejectedForms: number;
  absents: number;
  employeesOnLeave: number;
  /** Mean of every scored review in range, 0–100. */
  averageScore: number;
  /** Sum of those scores — the spec's "Gross Score". */
  grossScore: number;
  scoredCount: number;
};

export type TrendPoint = {
  period: string;
  averageScore: number;
  count: number;
};

export type AppraisalStats = {
  summary: StatsSummary;
  trend: TrendPoint[];
  byStatus: Array<{ status: string; count: number }>;
  byDepartment: Array<{ department: string; averageScore: number; count: number }>;
};

export type ResultRow = {
  reviewId: string;
  /** Carried so the results table can feed the compare view directly. */
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  designation: string;
  evaluationType: string;
  reviewPeriod: string;
  grossScore: number;
  status: string;
  reviewerName: string;
  submittedAt: string | null;
};

export type CompareEmployee = {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string;
  designation: string;
  teamLead: string;
  grossScore: number;
  averageScore: number;
  reviewCount: number;
  submittedCount: number;
  pendingCount: number;
  approvedCount: number;
  presentDays: number;
  absentDays: number;
  attendanceRate: number;
  trend: TrendPoint[];
};

export type CompareResult = {
  employees: CompareEmployee[];
  ranking: Array<{
    rank: number;
    employeeId: string;
    name: string;
    averageScore: number;
    grossScore: number;
  }>;
  /** Union of every period across the compared employees, for a shared x-axis. */
  periods: string[];
};

/** `YYYY-MM-DD` stamp for export filenames. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const appraisalStatsApi = {
  /** `appraisal.stats` — Team Lead results are roster-scoped */
  getStats: (filters: AppraisalStatsFilters = {}) =>
    api.get<AppraisalStats>(`${ENDPOINTS.appraisal.stats}${toQuery(filters)}`),

  /** `appraisal.stats` — the paginated results table */
  getResults: (
    params: AppraisalStatsFilters & {
      page?: number;
      limit?: number;
      search?: string;
      sortBy?: string;
      /** Note: `sortOrder`, not `order` — `order` is a derived field server-side. */
      sortOrder?: "ASC" | "DESC";
    } = {},
  ) =>
    api.get<Paginated<ResultRow>>(
      `${ENDPOINTS.appraisal.results}${toQuery(params)}`,
    ),

  /** `appraisal.stats` — one submitted review, for the form viewer */
  getReviewDetail: (reviewId: string) =>
    api.get<SubmittedEvaluation>(ENDPOINTS.appraisal.reviewDetail(reviewId)),

  /** `appraisal.compare` — 2 to 6 employees */
  compare: (
    employeeIds: string[],
    filters: Omit<AppraisalStatsFilters, "employeeId" | "status"> = {},
  ) =>
    api.get<CompareResult>(
      `${ENDPOINTS.appraisal.compare}${toQuery({
        ...filters,
        employeeIds: employeeIds.join(","),
      })}`,
    ),

  /**
   * `appraisal.export` — ignores page/limit and exports every matching row up to
   * the server's cap, so a download is never silently "page 2 of 47".
   */
  exportStatsExcel: async (filters: AppraisalStatsFilters = {}) => {
    const blob = await apiDownload(
      `${ENDPOINTS.appraisal.statsExportExcel}${toQuery(filters)}`,
    );
    saveBlob(blob, `appraisal-results-${today()}.xlsx`);
  },

  /** `appraisal.export` */
  exportCompareExcel: async (
    employeeIds: string[],
    filters: Omit<AppraisalStatsFilters, "employeeId" | "status"> = {},
  ) => {
    const blob = await apiDownload(
      `${ENDPOINTS.appraisal.compareExportExcel}${toQuery({
        ...filters,
        employeeIds: employeeIds.join(","),
      })}`,
    );
    saveBlob(blob, `appraisal-comparison-${today()}.xlsx`);
  },
};

// ===========================================================================
// Notifications and dashboards.
// ===========================================================================

export type AppraisalNotification = {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  relatedReviewId: string | null;
  createdAt: string;
};

export type TeamLeadDashboard = {
  pending: number;
  submitted: number;
  approved: number;
  teamSize: number;
  unreadNotifications: number;
  team: TeamMember[];
};

export const appraisalNotificationsApi = {
  /** `appraisal.viewOwn` — own notifications only, newest first */
  list: () =>
    api.get<AppraisalNotification[]>(ENDPOINTS.appraisal.notifications),

  /** `appraisal.viewOwn` — 403 if the notification belongs to someone else */
  markRead: (notificationId: string) =>
    api.patch<{ message: string }>(
      ENDPOINTS.appraisal.notificationRead(notificationId),
    ),
};

export const appraisalDashboardApi = {
  /** `appraisal.view` — roster-scoped counts for the lead's own team */
  teamLead: () =>
    api.get<TeamLeadDashboard>(ENDPOINTS.appraisal.teamLeadDashboard),

  /** `appraisal.viewOwn` — the employee is taken from the JWT */
  employee: () => api.get<MyEvaluations>(ENDPOINTS.appraisal.employeeDashboard),
};
