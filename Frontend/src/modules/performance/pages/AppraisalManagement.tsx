import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Eye, Building2, IdCard,
  CheckCircle2, AlertTriangle, BarChart3, FileText,
  TrendingUp, Table2, GitCompare, Library, Zap, ClipboardCheck,
  Download, Clock
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import { BarChart, DoughnutChart, LineChart } from "@/components/charts";
import Modal from "@/components/dialogs/Modal";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import DataTable, {
  type DataTableColumn,
  type SortDirection,
} from "@/components/tables/DataTable";
import ReviewFormDialog from "@/modules/appraisal/components/ReviewFormDialog";
import AppraisalStatsTab from "@/modules/performance/components/AppraisalStatsTab";
import AppraisalResultsTab from "@/modules/performance/components/AppraisalResultsTab";
import AppraisalCompareTab from "@/modules/performance/components/AppraisalCompareTab";
import QuestionBankTab from "@/modules/performance/components/QuestionBankTab";
import FormEditor from "@/modules/performance/components/FormEditor";
import ViewForm from "@/modules/performance/components/ViewForm";
import FormStatusMenu from "@/modules/performance/components/FormStatusMenu";
import QuickEditPanel from "@/modules/performance/components/QuickEditPanel";
import FilterPanel, {
  type FilterValues,
} from "@/modules/performance/components/FilterPanel";
import { useAuth } from "@/app/providers/AuthContext";
import {
  formsApi, appraisalReportsApi,
  type AppraisalForm, type AppraisalFormDetail,
  type Analytics, type EvaluationType, type FormStatus,
  type SubmittedEvaluation,
} from "@/modules/appraisal/api/appraisalApi";
import {
  departmentsApi, designationsApi,
  type Department, type Designation,
} from "@/modules/settings/api/settingsApi";
import { formatDisplayDate } from "@/utils/formatDate";

/*
 * These are in-page tabs, not routes, and deliberately so: `AppRouter.tsx`
 * carries a comment recording that the old per-tab routes were removed because
 * a bookmarked `/performance/questions` bypassed the workspace's shared error /
 * notice banners and its loaded form context. New screens are added here.
 *
 * There is no Assignments tab: a form's audience is a department + designation
 * rule set on the form itself, so a separate screen for it only ever showed the
 * same rows a second time.
 *
 * There is no Form Editor tab either. The editor is not a peer of the other
 * screens — it is always *about* one form — so a tab for it was either disabled
 * (before a form was opened) or a second way to reach what the Forms row
 * actions already open. It is now a full-page takeover launched from those
 * actions, which is also what lets it use the full width.
 *
 * Team Lead Access is gone for the same reason it stopped mattering: HR Admin
 * now evaluates org-wide, so per-lead rosters no longer gate the Admin path.
 * Rosters are managed through the API.
 */
type Tab =
  | "forms"
  | "analytics"
  | "stats"
  | "results"
  | "compare"
  | "bank";

export default function AppraisalManagement() {
  const [tab, setTab] = useState<Tab>("forms");
  const [formDetail, setFormDetail] = useState<AppraisalFormDetail | null>(null);
  /*
   * True while the editor is open on a form that does not exist yet. It cannot
   * be inferred from `formDetail === null`, because that is also the state
   * before any form has been opened — and the Editor tab must stay disabled in
   * that case but reachable in this one.
   */
  const [creating, setCreating] = useState(false);
  // The editor doubles as the viewer. View is offered for every form, including
  // drafts, so "what is on this form" never requires the risk of opening it for
  // editing.
  const [viewOnly, setViewOnly] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { hasPermission } = useAuth();

  const canCreate = hasPermission("appraisal-forms.create");
  const canUpdate = hasPermission("appraisal-forms.update");
  const canDelete = hasPermission("appraisal-forms.delete");
  const canAssign = hasPermission("appraisal-forms.assign");
  const canViewAll = hasPermission("appraisal.viewAll");
  // `appraisal.stats` covers both Stats and Results — the backend guards
  // `GET /appraisal/stats` and `GET /appraisal/results` with the same key.
  const canStats = hasPermission("appraisal.stats");
  const canCompare = hasPermission("appraisal.compare");
  const canManageQuestions = hasPermission("appraisal-forms.questions.manage");
  /*
   * The admin's way into the roster. `/team` used to be Team-Lead-only, so an
   * HR Admin holding this key had no link to the one screen that spends it.
   * The backend resolves their roster to every active employee, so this reads
   * "evaluate anyone", not "evaluate my reports".
   */
  const canEvaluate = hasPermission("appraisal.create");

  // Set when Results hands a selection to Compare, so the ids survive the tab
  // switch without a URL param.
  const [compareIds, setCompareIds] = useState<string[]>([]);

  // Memoised because it is passed down as `onError` and listed in child
  // effect dependency arrays; an unmemoised closure would change identity on
  // every render and re-trigger those fetches in a loop. The state setters it
  // closes over are stable, so an empty dep list is correct.
  const showError = useCallback((err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    setNotice(null);
  }, []);
  const showNotice = (message: string) => {
    setNotice(message);
    setError(null);
  };

  /*
   * The reload signal for the Forms tab. `FormsTab` fetches its own page
   * server-side, so this does not hold rows — it bumps a token the tab watches,
   * which is what lets an action elsewhere on the page (publish, delete, quick
   * edit) refresh the table without the parent duplicating its query.
   */
  const [formsToken, setFormsToken] = useState(0);
  const loadForms = useCallback(async () => {
    setFormsToken((n) => n + 1);
  }, []);

  useEffect(() => {
    setLoading(false);
  }, []);

  /*
   * Departments and designations feed the editor's audience pickers and the
   * Forms table's audience filter, so they load for anyone who can reach this
   * page — the editor shows the current audience read-only to someone who
   * cannot change it, and an empty list there would read as "no departments
   * exist".
   */
  useEffect(() => {
    departmentsApi.list({ pageSize: 500 }).then((r) => setDepartments(r.data as Department[])).catch(() => {});
    designationsApi.list({ pageSize: 500 }).then((r) => setDesignations(r.data as Designation[])).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "analytics" || !canViewAll || analytics) return;
    appraisalReportsApi
      .getAnalytics()
      .then(setAnalytics)
      .catch((err) => showError(err, "Could not load analytics."));
  }, [tab, canViewAll, analytics, showError]);

  /*
   * The editor is a full-page takeover rather than a tab, so opening one is
   * purely a matter of having a form loaded (or a pending create). `tab` is
   * left where it is: closing the editor returns to whichever screen launched
   * it, which is always Forms today but need not stay that way.
   */
  const editorOpen = formDetail !== null || creating;

  const openBuilder = async (formId: string, readOnly = false) => {
    setBusy(true);
    try {
      setFormDetail(await formsApi.get(formId));
      setCreating(false);
      setViewOnly(readOnly);
      setError(null);
      setNotice(null);
    } catch (err) {
      showError(err, "Could not open that form.");
    } finally {
      setBusy(false);
    }
  };

  // A new form opens the same editor with nothing loaded. It is not written
  // until the first save, so abandoning it leaves no draft behind.
  const openCreate = () => {
    setFormDetail(null);
    setCreating(true);
    setViewOnly(false);
    setError(null);
    setNotice(null);
  };

  const closeEditor = () => {
    // Clearing the detail is what closes the takeover — without it the editor
    // would stay mounted over the list it just returned to.
    setFormDetail(null);
    setCreating(false);
    setViewOnly(false);
    setTab("forms");
  };

  const refreshDetail = async (formId: string) => {
    setFormDetail(await formsApi.get(formId));
    // A save turns a pending create into a real form; without this the editor
    // would keep treating the next save as another create.
    setCreating(false);
    await loadForms();
  };

  const banners = (
    <>
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
    </>
  );

  /*
   * The editor replaces the workspace instead of sitting beside it. A form is a
   * single subject with its own header, footer and unsaved state — leaving the
   * tab bar on screen invited a mid-edit tab switch that silently discarded it.
   * The banners stay, because a failed save reports through them.
   *
   * View mode takes the same takeover but renders `ViewForm`, not the editor
   * with every input disabled. A reader who cannot change the form should get a
   * document, not a greyed-out interface — and it also means the view path
   * cannot accidentally hold unsaved editor state.
   */
  if (editorOpen && viewOnly && formDetail) {
    return (
      <DashboardLayout title="Evaluation Forms" activeKey="appraisal">
        {banners}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
          <ViewForm
            form={formDetail}
            onClose={closeEditor}
            onEdit={canUpdate ? () => setViewOnly(false) : undefined}
          />
        </div>
      </DashboardLayout>
    );
  }

  if (editorOpen) {
    return (
      <DashboardLayout title="Evaluation Forms" activeKey="appraisal">
        {banners}
        <FormEditor
          /*
           * Remounts when the editor swaps forms — including the moment a new
           * form is first saved — and again when the status changes, so a
           * publish reloads the now-frozen questions instead of leaving the
           * pre-publish drafts on screen. The drafts held in the editor's state
           * belong to one form and must not carry over.
           */
          key={creating ? "new" : `${formDetail!.formId}:${formDetail!.status}`}
          form={creating ? null : formDetail}
          departments={departments}
          designations={designations}
          canUpdate={canUpdate}
          canAssign={canAssign}
          onClose={closeEditor}
          onSaved={refreshDetail}
          onError={showError}
          onNotice={showNotice}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Evaluation Forms" activeKey="appraisal">
      <LoadingOverlay show={loading} label="Loading evaluation forms…" />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-100">
        <div className="flex flex-wrap gap-1.5 xs:gap-2">
        {([
          ["forms", "Forms", FileText, true],
          ["bank", "Question Bank", Library, canManageQuestions],
          ["stats", "Statistics", TrendingUp, canStats],
          ["results", "Results", Table2, canStats],
          ["compare", "Compare", GitCompare, canCompare],
          ["analytics", "Analytics", BarChart3, canViewAll],
        ] as const)
          // Tabs are filtered out, not disabled: a visible-but-dead tab still
          // advertises a screen this user's token can never load.
          .filter(([, , , allowed]) => allowed)
          .map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium xs:gap-2 xs:px-4 xs:py-2.5 xs:text-sm ${
                tab === id ? "bg-brand-light text-brand-dark" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
        </div>

        {/*
          * A link, not a tab: evaluating happens on `/team`, which is a real
          * route with its own roster, filters and per-employee form. Copying it
          * in here as a seventh tab would be a second implementation of the one
          * screen Team Leads already use.
          *
          * Styled as a filled primary button rather than a quiet text link: it
          * is the highest-value action on this page, and sitting in a row of
          * tabs it read as one more tab nobody had reason to click.
          */}
        {canEvaluate && (
          <Link
            to="/team"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-dark px-4 py-2.5 text-xs font-semibold text-gray-900 shadow-sm transition hover:brightness-95 xs:px-5 xs:text-sm"
          >
            <ClipboardCheck size={16} className="shrink-0" />
            <span className="whitespace-nowrap">Evaluate Employees</span>
          </Link>
        )}
      </div>

      {banners}

      {tab === "forms" && (
        <FormsTab
          reloadToken={formsToken}
          busy={busy}
          departments={departments}
          designations={designations}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canAssign={canAssign}
          canDelete={canDelete}
          onOpen={openBuilder}
          onCreate={openCreate}
          onReload={loadForms}
          onError={showError}
          onNotice={showNotice}
        />
      )}

      {tab === "analytics" && canViewAll && <AnalyticsTab analytics={analytics} onError={showError} />}

      {tab === "bank" && canManageQuestions && (
        <QuestionBankTab onError={showError} onNotice={showNotice} />
      )}

      {tab === "stats" && canStats && <AppraisalStatsTab onError={showError} />}

      {tab === "results" && canStats && (
        <AppraisalResultsTab
          onError={showError}
          onNotice={showNotice}
          /*
           * Only offered when this user can actually reach the Compare tab —
           * `AppraisalResultsTab` derives its own `canCompare` from the
           * permission *and* the presence of this callback, so omitting it
           * removes the selection UI rather than leaving a button that lands
           * on a tab that was filtered out of the bar above.
           */
          onCompare={
            canCompare
              ? (employeeIds) => {
                  setCompareIds(employeeIds);
                  setTab("compare");
                }
              : undefined
          }
        />
      )}

      {tab === "compare" && canCompare && (
        <AppraisalCompareTab onError={showError} initialEmployeeIds={compareIds} />
      )}
    </DashboardLayout>
  );
}

// ============================================================================
// AUDIENCE CELL — who a form applies to, in one table cell
// ============================================================================

/** Badges shown inline before the cell collapses into a "+N more" button. */
const AUDIENCE_INLINE_LIMIT = 2;

function AudienceBadge({
  kind,
  label,
}: {
  kind: "department" | "designation";
  label: string;
}) {
  const Icon = kind === "department" ? Building2 : IdCard;
  return (
    <span
      className={`flex max-w-[190px] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ${
        kind === "department"
          ? "bg-brand-light/50 text-brand-dark ring-brand/20"
          : "bg-gray-50 text-gray-600 ring-gray-200"
      }`}
    >
      <Icon size={11} className="shrink-0 opacity-70" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * A form's audience as badges, capped so one broadly-targeted form cannot make
 * every other row in the table unreadable.
 *
 * The names arrive already de-duplicated and sorted from the server (`FormDto`),
 * so this only decides how many to show. Overflow opens a dialog rather than a
 * CSS hover tooltip: the overflow list can run to dozens of entries and needs to
 * be scrollable and readable on touch, neither of which a tooltip manages.
 */
function AudienceCell({
  departmentNames,
  designationNames,
  formName,
}: {
  departmentNames: string[];
  designationNames: string[];
  formName: string;
}) {
  const [open, setOpen] = useState(false);

  const total = departmentNames.length + designationNames.length;
  if (total === 0) {
    return (
      <span className="text-xs italic text-gray-400" title="Nobody will be evaluated on this form">
        Not assigned
      </span>
    );
  }

  // Departments come first and get the inline slots ahead of designations: a
  // department is the broader statement, so it is the one worth reading at a
  // glance.
  const inlineDepartments = departmentNames.slice(0, AUDIENCE_INLINE_LIMIT);
  const inlineDesignations = designationNames.slice(
    0,
    Math.max(0, AUDIENCE_INLINE_LIMIT - inlineDepartments.length),
  );
  const hidden = total - inlineDepartments.length - inlineDesignations.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        {inlineDepartments.map((name) => (
          <AudienceBadge key={`dept-${name}`} kind="department" label={name} />
        ))}
        {inlineDesignations.map((name) => (
          <AudienceBadge key={`desig-${name}`} kind="designation" label={name} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Show the full audience"
            className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-200 hover:text-gray-800"
          >
            +{hidden} more
          </button>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Form audience"
        description={`Who "${formName}" applies to.`}
      >
        <div className="space-y-5">
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <Building2 size={13} />
              Departments ({departmentNames.length})
            </p>
            {departmentNames.length === 0 ? (
              <p className="text-sm text-gray-400">No departments targeted.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {departmentNames.map((name) => (
                  <AudienceBadge key={name} kind="department" label={name} />
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <IdCard size={13} />
              Designations ({designationNames.length})
            </p>
            {designationNames.length === 0 ? (
              <p className="text-sm text-gray-400">
                No designations targeted — everyone in the departments above is in scope.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {designationNames.map((name) => (
                  <AudienceBadge key={name} kind="designation" label={name} />
                ))}
              </div>
            )}
          </section>
        </div>
      </Modal>
    </>
  );
}

// ============================================================================
// FORMS TAB — table of all forms with view/edit/publish/delete
// ============================================================================

type FormsTabProps = {
  reloadToken: number;
  busy: boolean;
  departments: Department[];
  designations: Designation[];
  canCreate: boolean;
  canUpdate: boolean;
  canAssign: boolean;
  canDelete: boolean;
  onOpen: (formId: string, readOnly?: boolean) => void;
  onCreate: () => void;
  onReload: () => Promise<void>;
  onError: (err: unknown, msg: string) => void;
  onNotice: (msg: string) => void;
};

const FORM_SORT_OPTIONS = [
  { value: "updatedAt", label: "Last updated" },
  { value: "formName", label: "Form name" },
  { value: "questionCount", label: "Question count" },
  { value: "activeWeightTotal", label: "Weight total" },
  { value: "reviewCount", label: "Evaluations" },
];

const FORM_STATUS_TABS = [
  { value: undefined, label: "All" },
  { value: "Draft" as const, label: "Draft" },
  { value: "Published" as const, label: "Published" },
  { value: "Archived" as const, label: "Archived" },
];

const EVALUATION_TYPE_OPTIONS = [
  { value: "Daily", label: "Daily" },
  { value: "Weekly", label: "Weekly" },
  { value: "Monthly", label: "Monthly" },
];

function FormsTab({
  reloadToken, busy, departments, designations,
  canCreate, canUpdate, canAssign, canDelete,
  onOpen, onCreate, onReload, onError, onNotice,
}: FormsTabProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<string>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDirection>("DESC");
  const [status, setStatus] = useState<FormStatus | undefined>("Published");
  const [evaluationType, setEvaluationType] = useState<EvaluationType | undefined>();
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [designationId, setDesignationId] = useState<string | undefined>();
  const [rows, setRows] = useState<AppraisalForm[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [targetForm, setTargetForm] = useState<AppraisalForm | null>(null);
  const [quickEditForm, setQuickEditForm] = useState<AppraisalForm | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Status is driven by the tab row above the table, not by a dropdown inside
  // the filter popover — so it is deliberately absent here.
  const tableFilters = useMemo(
    () => ({
      evaluationType: evaluationType ?? "",
    }),
    [evaluationType],
  );

  const load = useCallback(() => {
    setLoading(true);
    formsApi
      .list({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        status,
        evaluationType,
        departmentId,
        designationId,
        sortBy: sortKey,
        sortOrder: sortDir,
      })
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .catch((err) => onError(err, "Could not load evaluation forms."))
      .finally(() => setLoading(false));
  }, [page, pageSize, debouncedSearch, status, evaluationType, departmentId, designationId, sortKey, sortDir, reloadToken, onError]);

  useEffect(load, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, evaluationType, departmentId, designationId, pageSize, sortKey, sortDir]);

  const handleDelete = async () => {
    if (!targetForm) return;
    try {
      const result = await formsApi.remove(targetForm.formId);
      onNotice(result.archived ? `Archived "${targetForm.formName}" (it has submitted evaluations).` : `Deleted "${targetForm.formName}".`);
      setDeleteModalOpen(false);
      setTargetForm(null);
      load();
      await onReload();
    } catch (err) {
      onError(err, "Could not delete that form.");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await formsApi.exportExcel({
        search: debouncedSearch || undefined,
        status,
        evaluationType,
        departmentId,
        designationId,
        sortBy: sortKey,
        sortOrder: sortDir,
      });
    } catch (err) {
      onError(err, "Could not export forms.");
    } finally {
      setExporting(false);
    }
  };

  const columns: DataTableColumn<AppraisalForm>[] = [
    {
      key: "formName",
      label: "Form Name",
      sortable: true,
      render: (form) => (
        <div>
          <p className="font-medium text-gray-900">{form.formName}</p>
          {form.description && (
            <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">
              {form.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "evaluationType",
      label: "Schedule",
      sortable: true,
      hideBelow: "md",
      filterable: true,
      filterOptions: EVALUATION_TYPE_OPTIONS,
      filterPlaceholder: "All schedules",
      render: (form) => form.evaluationType,
    },
    {
      key: "status",
      label: "Status",
      sortable: false,
      render: (form) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={form.status} />
          {/*
            * Only surfaced when it contradicts the expectation. A Published form
            * is assumed live, so "Paused" is the exception worth a badge;
            * labelling every active form "Active" would just be noise, and Draft
            * and Archived forms are inert regardless of the flag.
            */}
          {form.status === "Published" && !form.isActive && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
              Paused
            </span>
          )}
        </div>
      ),
    },
    {
      key: "audience",
      label: "Applies To",
      sortable: false,
      hideBelow: "lg",
      render: (form) => (
        <AudienceCell
          departmentNames={form.departmentNames}
          designationNames={form.designationNames}
          formName={form.formName}
        />
      ),
    },
    {
      key: "questionCount",
      label: "Questions",
      sortable: true,
      align: "right",
      render: (form) => form.questionCount,
    },
    {
      key: "activeWeightTotal",
      label: "Weight",
      sortable: true,
      sortKey: "activeWeightTotal",
      align: "right",
      render: (form) => (
        <span
          className={
            form.activeWeightTotal === 100 ? "text-green-600" : "text-amber-600"
          }
        >
          {form.activeWeightTotal}%
        </span>
      ),
    },
    {
      key: "reviewCount",
      label: "Evaluations",
      sortable: true,
      align: "right",
      render: (form) => form.reviewCount,
    },
    {
      key: "updatedAt",
      label: "Updated",
      sortable: true,
      hideBelow: "xl",
      render: (form) => (
        <span className="whitespace-nowrap">{formatDisplayDate(form.updatedAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/*
        * Status as tabs rather than a dropdown buried in the filter popover.
        * "Show me the drafts" is the question people actually bring to this
        * table, and a control they have to open a popover to find is a control
        * they do not know exists.
        */}
      <div
        role="tablist"
        aria-label="Filter forms by status"
        className="flex flex-wrap gap-1.5 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-100"
      >
        {FORM_STATUS_TABS.map(({ value, label }) => {
          const active = status === value;
          return (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatus(value)}
              className={`rounded-xl px-3 py-2 text-xs font-medium transition xs:px-4 xs:text-sm ${
                active ? "bg-brand-light text-brand-dark" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <DataTable<AppraisalForm>
        columns={columns}
        rows={rows}
        rowKey={(form) => form.formId}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by form name or description…"
        emptyIcon={FileText}
        emptyTitle={status ? `No ${status.toLowerCase()} forms` : "No evaluation forms yet"}
        emptyDescription={
          status
            ? "Switch to another status tab to see the rest."
            : canCreate
              ? "Create your first form to get started."
              : "Ask an administrator to create a form."
        }
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50, 100]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
        }}
        filters={tableFilters}
        onFiltersChange={(next) => {
          setEvaluationType((next.evaluationType || undefined) as EvaluationType | undefined);
        }}
        unifiedFilter
        hideSortDirection
        sortOptions={FORM_SORT_OPTIONS}
        extraFilterCount={(departmentId ? 1 : 0) + (designationId ? 1 : 0)}
        onClearExtraFilters={() => {
          setDepartmentId(undefined);
          setDesignationId(undefined);
        }}
        extraFilters={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Department
              </span>
              <select
                value={departmentId ?? ""}
                onChange={(e) => setDepartmentId(e.target.value || undefined)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
              >
                <option value="">All departments</option>
                {departments.map((dept) => (
                  <option key={dept.departmentId} value={dept.departmentId}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Designation
              </span>
              <select
                value={designationId ?? ""}
                onChange={(e) => setDesignationId(e.target.value || undefined)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
              >
                <option value="">All designations</option>
                {designations.map((desig) => (
                  <option key={desig.designationId} value={desig.designationId}>
                    {desig.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
        actions={(form) => (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => onOpen(form.formId, true)}
              disabled={busy}
              title="View form"
              aria-label={`View ${form.formName}`}
              className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
            >
              <Eye size={16} />
            </button>
            <button
              onClick={() => onOpen(form.formId, false)}
              disabled={busy}
              title="Edit form"
              aria-label={`Edit ${form.formName}`}
              className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
            >
              <Pencil size={16} />
            </button>
            {canUpdate && (
              <button
                onClick={() => setQuickEditForm(form)}
                disabled={busy}
                title="Quick edit audience, schedule and status"
                aria-label={`Quick edit ${form.formName}`}
                className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
              >
                <Zap size={16} />
              </button>
            )}
            {canUpdate && (
              <FormStatusMenu
                form={form}
                disabled={busy}
                onDone={async () => {
                  load();
                  await onReload();
                }}
                onError={onError}
                onNotice={onNotice}
              />
            )}
            {canDelete && (
              <button
                onClick={() => {
                  setTargetForm(form);
                  setDeleteModalOpen(true);
                }}
                title="Delete or archive"
                aria-label={`Delete ${form.formName}`}
                className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        )}
        toolbarRight={
          <div className="flex items-center gap-2">
            {canCreate && (
              <button
                onClick={onCreate}
                className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
              >
                <Plus size={16} />
                Create Form
              </button>
            )}
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || loading}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark disabled:opacity-50"
            >
              {exporting ? <Clock size={14} /> : <Download size={14} />}
              {exporting ? "Exporting…" : "Excel"}
            </button>
          </div>
        }
      />

      {quickEditForm && (
        <QuickEditPanel
          // Remounts per form so the fetched audience never leaks between rows.
          key={quickEditForm.formId}
          form={quickEditForm}
          departments={departments}
          designations={designations}
          canAssign={canAssign}
          onClose={() => setQuickEditForm(null)}
          onSaved={async () => {
            load();
            await onReload();
          }}
          onError={onError}
          onNotice={onNotice}
        />
      )}

      {deleteModalOpen && targetForm && (
        <Modal
          open={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setTargetForm(null);
          }}
          title="Delete Form"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Delete <strong>{targetForm.formName}</strong>?
              {targetForm.reviewCount > 0 && (
                <span className="mt-2 block text-amber-600">
                  This form has {targetForm.reviewCount} submitted evaluation(s). It will be archived instead of deleted.
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700"
              >
                {targetForm.reviewCount > 0 ? "Archive" : "Delete"}
              </button>
              <button
                onClick={() => {
                  setDeleteModalOpen(false);
                  setTargetForm(null);
                }}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// ANALYTICS TAB — org-wide aggregates plus the full evaluations table
// ============================================================================

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

/**
 * Score bands run worst-to-best in a fixed order from the backend, so they get
 * a red-to-green ramp rather than the palette's default rotation — the slice
 * colour then means the same thing as the band it labels.
 */
const BAND_COLORS: Record<string, string> = {
  "0–39": "rgb(248 113 113)",
  "40–59": "rgb(251 146 60)",
  "60–74": "rgb(251 191 36)",
  "75–89": "rgb(96 165 250)",
  "90–100": "rgb(52 211 153)",
};

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        {subtitle && <span className="shrink-0 text-xs text-gray-400">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

const EVALUATION_SORT_OPTIONS = [
  { value: "reviewDate", label: "Date" },
  { value: "totalScore", label: "Score" },
  { value: "employeeName", label: "Employee" },
  { value: "formName", label: "Form" },
];

function AnalyticsTab({
  analytics,
  onError,
}: {
  analytics: Analytics | null;
  onError: (err: unknown, msg: string) => void;
}) {
  const [evaluations, setEvaluations] = useState<SubmittedEvaluation[] | null>(null);
  const [selected, setSelected] = useState<SubmittedEvaluation | null>(null);
  const [filters, setFilters] = useState<FilterValues>({});

  useEffect(() => {
    appraisalReportsApi
      .getAllEvaluations()
      .then(setEvaluations)
      .catch((err) => onError(err, "Could not load evaluations."));
  }, [onError]);

  const visible = useMemo(() => {
    if (!evaluations) return null;
    const needle = filters.search?.trim().toLowerCase() ?? "";

    const rows = evaluations.filter((ev) => {
      if (
        needle &&
        !ev.employeeName.toLowerCase().includes(needle) &&
        !ev.formName.toLowerCase().includes(needle) &&
        !ev.reviewerName.toLowerCase().includes(needle)
      )
        return false;
      // `reviewDate` is an ISO timestamp and the date inputs yield YYYY-MM-DD,
      // so a prefix comparison keeps the bounds inclusive on both ends without
      // dragging a timezone into it.
      const day = ev.reviewDate.slice(0, 10);
      if (filters.dateFrom && day < filters.dateFrom) return false;
      if (filters.dateTo && day > filters.dateTo) return false;
      return true;
    });

    if (!filters.sortBy) return rows;
    const dir = filters.sortOrder === "ASC" ? 1 : -1;
    const key = filters.sortBy;
    return [...rows].sort((a, b) => {
      if (key === "totalScore") return (a.totalScore - b.totalScore) * dir;
      if (key === "reviewDate")
        return (Date.parse(a.reviewDate) - Date.parse(b.reviewDate)) * dir;
      return (
        String(a[key as keyof SubmittedEvaluation] ?? "").localeCompare(
          String(b[key as keyof SubmittedEvaluation] ?? ""),
        ) * dir
      );
    });
  }, [evaluations, filters]);

  if (!analytics) {
    return <p className="text-sm text-gray-500">Loading analytics…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Evaluations" value={analytics.totalEvaluations} />
        <StatCard label="Employees Evaluated" value={analytics.employeesEvaluated} />
        <StatCard label="Average Score" value={analytics.averageScore === null ? "—" : `${analytics.averageScore}%`} />
        <StatCard
          label="Score Bands"
          value={analytics.distribution.reduce((sum, d) => sum + d.count, 0)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="By Department" subtitle="average score">
          <BarChart
            labels={analytics.byDepartment.map((d) => d.name)}
            series={[
              {
                label: "Average score",
                values: analytics.byDepartment.map((d) => d.averageScore),
              },
            ]}
            valueSuffix="%"
            showValues
            emptyMessage="No scored evaluations yet."
          />
        </ChartCard>

        <ChartCard title="By Designation" subtitle="average score">
          <BarChart
            labels={analytics.byDesignation.map((d) => d.name)}
            series={[
              {
                label: "Average score",
                values: analytics.byDesignation.map((d) => d.averageScore),
              },
            ]}
            valueSuffix="%"
            showValues
            emptyMessage="No scored evaluations yet."
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Score Distribution">
          <DoughnutChart
            slices={analytics.distribution.map((d) => ({
              label: d.band,
              value: d.count,
              color: BAND_COLORS[d.band],
            }))}
            centreLabel="reviews"
            emptyMessage="No scored evaluations yet."
          />
        </ChartCard>

        <ChartCard title="Trend">
          <LineChart
            labels={analytics.trend.map((t) => t.period)}
            series={[
              {
                label: "Average score",
                values: analytics.trend.map((t) => t.averageScore),
              },
            ]}
            valueSuffix="%"
            emptyMessage="No scored evaluations yet."
          />
        </ChartCard>
      </div>

      <div>
        <h4 className="mb-3 text-base font-semibold text-gray-900">All Evaluations</h4>
        {visible === null ? (
          <p className="text-sm text-gray-500">Loading evaluations…</p>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
            <FilterPanel
              config={{
                search: true,
                searchPlaceholder: "Search by employee, form or reviewer…",
                sortOptions: EVALUATION_SORT_OPTIONS,
                dateRange: true,
              }}
              values={filters}
              onChange={setFilters}
            />
            {visible.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={FileText}
                  title="No evaluations to show"
                  description="Submitted reviews will appear here."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3.5">Employee</th>
                      <th className="px-4 py-3.5">Form</th>
                      <th className="px-4 py-3.5">Reviewer</th>
                      <th className="px-4 py-3.5">Period</th>
                      <th className="px-4 py-3.5">Date</th>
                      <th className="px-4 py-3.5 text-right">Score</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((ev) => (
                      <tr
                        key={ev.appraisalId}
                        onClick={() => setSelected(ev)}
                        className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                      >
                        <td className="px-4 py-3.5 font-medium text-gray-900">{ev.employeeName}</td>
                        <td className="px-4 py-3.5 text-gray-700">{ev.formName}</td>
                        <td className="px-4 py-3.5 text-gray-700">{ev.reviewerName}</td>
                        <td className="px-4 py-3.5 text-gray-700">{ev.reviewPeriod}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-700">{formatDisplayDate(ev.reviewDate)}</td>
                        <td className="px-4 py-3.5 text-right font-medium text-gray-900">{ev.totalScore}%</td>
                        <td className="px-4 py-3.5">
                          <div className="flex justify-end">
                            {/*
                              * The row is clickable for convenience, but this
                              * button is what keyboard users reach — a `tr` with
                              * a click handler is not focusable, and giving it
                              * role="button" would cost the table its semantics.
                              */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(ev);
                              }}
                              title="View detail"
                              aria-label={`View evaluation for ${ev.employeeName}`}
                              className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100"
                            >
                              <Eye size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/*
        * The shared viewer, not a local modal: it refetches the full record by
        * id, so the drill-down shows the selected option text and per-question
        * remarks that the summary row does not carry.
        */}
      {selected && (
        <ReviewFormDialog
          reviewId={selected.appraisalId}
          employeeName={selected.employeeName}
          onClose={() => setSelected(null)}
          onError={onError}
        />
      )}
    </div>
  );
}
