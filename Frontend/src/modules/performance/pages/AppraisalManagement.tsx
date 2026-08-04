import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, Eye, Building2, IdCard,
  CheckCircle2, AlertTriangle, BarChart3, FileText,
  TrendingUp, Table2, GitCompare, Library, UserCog
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import Modal from "@/components/dialogs/Modal";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import AppraisalStatsTab from "@/modules/performance/components/AppraisalStatsTab";
import AppraisalResultsTab from "@/modules/performance/components/AppraisalResultsTab";
import AppraisalCompareTab from "@/modules/performance/components/AppraisalCompareTab";
import QuestionBankTab from "@/modules/performance/components/QuestionBankTab";
import TeamLeadAssignmentsTab from "@/modules/performance/components/TeamLeadAssignmentsTab";
import FormEditor from "@/modules/performance/components/FormEditor";
import FilterPanel, {
  type FilterValues,
} from "@/modules/performance/components/FilterPanel";
import { useAuth } from "@/app/providers/AuthContext";
import {
  formsApi, appraisalReportsApi,
  type AppraisalForm, type AppraisalFormDetail,
  type Analytics, type SubmittedEvaluation,
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
 */
type Tab =
  | "forms"
  | "builder"
  | "analytics"
  | "stats"
  | "results"
  | "compare"
  | "bank"
  | "leads";

export default function AppraisalManagement() {
  const [tab, setTab] = useState<Tab>("forms");
  const [forms, setForms] = useState<AppraisalForm[]>([]);
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
  const canAssignLeads = hasPermission("appraisal.teamlead.assign");

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

  const loadForms = useCallback(async () => {
    try {
      setForms(await formsApi.list());
    } catch (err) {
      showError(err, "Could not load evaluation forms.");
    }
  }, [showError]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadForms();
      setLoading(false);
    })();
  }, [loadForms]);

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

  const openBuilder = async (formId: string, readOnly = false) => {
    setBusy(true);
    try {
      setFormDetail(await formsApi.get(formId));
      setCreating(false);
      setViewOnly(readOnly);
      setError(null);
      setNotice(null);
      setTab("builder");
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
    setTab("builder");
  };

  const closeEditor = () => {
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

  return (
    <DashboardLayout title="Evaluation Forms" activeKey="appraisal">
      <LoadingOverlay show={loading} label="Loading evaluation forms…" />

      <div className="mb-5 flex flex-wrap gap-1.5 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-100 xs:gap-2">
        {([
          ["forms", "Forms", FileText, true],
          ["builder", viewOnly ? "Form Preview" : "Form Editor", Pencil, true],
          ["bank", "Question Bank", Library, canManageQuestions],
          ["leads", "Team Lead Access", UserCog, canAssignLeads],
          ["stats", "Statistics", TrendingUp, canStats],
          ["results", "Results", Table2, canStats],
          ["compare", "Compare", GitCompare, canCompare],
          ["analytics", "Analytics", BarChart3, canViewAll],
        ] as const)
          // Tabs are filtered out, not disabled: a visible-but-dead tab still
          // advertises a screen this user's token can never load.
          .filter(([, , , allowed]) => allowed)
          .map(([id, label, Icon]) => {
            // The editor tab is reachable for an unsaved new form, but not
            // before anything at all has been opened.
            const needsForm = id === "builder" && !formDetail && !creating;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                disabled={needsForm}
                title={needsForm ? "Open a form from the Forms tab first" : undefined}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium disabled:opacity-40 xs:gap-2 xs:px-4 xs:py-2.5 xs:text-sm ${
                  tab === id ? "bg-brand-light text-brand-dark" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                <Icon size={16} className="shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
              </button>
            );
          })}
      </div>

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

      {tab === "forms" && (
        <FormsTab
          forms={forms}
          busy={busy}
          departments={departments}
          designations={designations}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onOpen={openBuilder}
          onCreate={openCreate}
          onReload={loadForms}
          onError={showError}
          onNotice={showNotice}
        />
      )}

      {tab === "builder" && (formDetail || creating) && (
        <FormEditor
          /*
           * Remounts when the editor swaps forms — including the moment a new
           * form is first saved — and again when the status or the read-only
           * flag changes, so a publish reloads the now-frozen questions instead
           * of leaving the pre-publish drafts on screen. The drafts held in the
           * editor's state belong to one form in one mode and must not carry
           * over.
           */
          key={creating ? "new" : `${formDetail!.formId}:${formDetail!.status}:${viewOnly}`}
          form={creating ? null : formDetail}
          departments={departments}
          designations={designations}
          canUpdate={canUpdate}
          canAssign={canAssign}
          viewOnly={viewOnly}
          onEdit={viewOnly ? () => setViewOnly(false) : undefined}
          onClose={closeEditor}
          onSaved={refreshDetail}
          onError={showError}
          onNotice={showNotice}
        />
      )}

      {tab === "analytics" && canViewAll && <AnalyticsTab analytics={analytics} onError={showError} />}

      {tab === "bank" && canManageQuestions && (
        <QuestionBankTab onError={showError} onNotice={showNotice} />
      )}

      {tab === "leads" && canAssignLeads && (
        <TeamLeadAssignmentsTab onError={showError} onNotice={showNotice} />
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
  forms: AppraisalForm[];
  busy: boolean;
  departments: Department[];
  designations: Designation[];
  canCreate: boolean;
  canUpdate: boolean;
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

const FORM_STATUS_OPTIONS = [
  { value: "Draft", label: "Draft" },
  { value: "Published", label: "Published" },
  { value: "Archived", label: "Archived" },
];

function FormsTab({
  forms, busy, departments, designations,
  canCreate, canUpdate, canDelete,
  onOpen, onCreate, onReload, onError, onNotice,
}: FormsTabProps) {
  const [filters, setFilters] = useState<FilterValues>({});
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [targetForm, setTargetForm] = useState<AppraisalForm | null>(null);

  const visible = useMemo(() => {
    /*
     * The department and designation filters match on name because that is what
     * the list endpoint returns — resolving them to ids server-side would mean
     * the audience column and the filter disagreeing about the same row.
     */
    const departmentName = departments.find(
      (d) => d.departmentId === filters.departmentId,
    )?.name;
    const designationName = designations.find(
      (d) => d.designationId === filters.designationId,
    )?.name;
    const needle = filters.search?.trim().toLowerCase() ?? "";

    const rows = forms.filter((f) => {
      if (
        needle &&
        !f.formName.toLowerCase().includes(needle) &&
        !f.description?.toLowerCase().includes(needle)
      )
        return false;
      if (filters.status && f.status !== filters.status) return false;
      if (filters.evaluationType && f.evaluationType !== filters.evaluationType) return false;
      if (departmentName && !f.departmentNames.includes(departmentName)) return false;
      if (designationName && !f.designationNames.includes(designationName)) return false;
      return true;
    });

    if (!filters.sortBy) return rows;
    const dir = filters.sortOrder === "ASC" ? 1 : -1;
    const key = filters.sortBy;
    return [...rows].sort((a, b) => {
      if (key === "formName") return a.formName.localeCompare(b.formName) * dir;
      if (key === "updatedAt")
        return (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)) * dir;
      const aNum = Number(a[key as keyof AppraisalForm] ?? 0);
      const bNum = Number(b[key as keyof AppraisalForm] ?? 0);
      return (aNum - bNum) * dir;
    });
  }, [forms, filters, departments, designations]);

  const isFiltered = Object.values(filters).some(
    (v) => v !== undefined && v !== "",
  );

  const handlePublish = async (form: AppraisalForm) => {
    if (form.activeWeightTotal !== 100) {
      onError(null, `Cannot publish: active question weights total ${form.activeWeightTotal}% (must be 100%).`);
      return;
    }
    try {
      await formsApi.publish(form.formId);
      onNotice(`Published "${form.formName}".`);
      await onReload();
    } catch (err) {
      onError(err, "Could not publish that form.");
    }
  };

  const handleDelete = async () => {
    if (!targetForm) return;
    try {
      const result = await formsApi.remove(targetForm.formId);
      onNotice(result.archived ? `Archived "${targetForm.formName}" (it has submitted evaluations).` : `Deleted "${targetForm.formName}".`);
      setDeleteModalOpen(false);
      setTargetForm(null);
      await onReload();
    } catch (err) {
      onError(err, "Could not delete that form.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <FilterPanel
          config={{
            search: true,
            searchPlaceholder: "Search by form name or description…",
            sortOptions: FORM_SORT_OPTIONS,
            statusOptions: FORM_STATUS_OPTIONS,
            evaluationType: true,
            department: true,
            designation: true,
          }}
          values={filters}
          onChange={setFilters}
          departments={departments}
          designations={designations}
          toolbarRight={
            canCreate ? (
              <button
                onClick={onCreate}
                className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
              >
                <Plus size={16} />
                Create Form
              </button>
            ) : undefined
          }
        />

        {visible.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={FileText}
              title={isFiltered ? "No forms match these filters" : "No evaluation forms yet"}
              description={
                isFiltered
                  ? "Clear or widen the filters to see more."
                  : canCreate
                    ? "Create your first form to get started."
                    : "Ask an administrator to create a form."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3.5">Form Name</th>
                  <th className="px-4 py-3.5">Schedule</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Applies To</th>
                  <th className="px-4 py-3.5 text-right">Questions</th>
                  <th className="px-4 py-3.5 text-right">Weight</th>
                  <th className="px-4 py-3.5 text-right">Evaluations</th>
                  <th className="px-4 py-3.5">Updated</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((form) => (
                  <tr key={form.formId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-gray-900">{form.formName}</p>
                      {form.description && <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{form.description}</p>}
                    </td>
                    <td className="px-4 py-3.5 text-gray-700">{form.evaluationType}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={form.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <AudienceCell
                        departmentNames={form.departmentNames}
                        designationNames={form.designationNames}
                        formName={form.formName}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-right text-gray-700">{form.questionCount}</td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={form.activeWeightTotal === 100 ? "text-green-600" : "text-amber-600"}>
                        {form.activeWeightTotal}%
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right text-gray-700">{form.reviewCount}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-gray-700">{formatDisplayDate(form.updatedAt)}</td>
                    <td className="px-4 py-3.5">
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
                        {/*
                          * Edit is offered for a published form too — the editor
                          * keeps its questions read-only (they are snapshotted at
                          * publish) but name, description and audience are still
                          * editable, which is the common reason to reopen one.
                          */}
                        <button
                          onClick={() => onOpen(form.formId, false)}
                          disabled={busy}
                          title="Edit form"
                          aria-label={`Edit ${form.formName}`}
                          className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
                        >
                          <Pencil size={16} />
                        </button>
                        {canUpdate && form.status === "Draft" && (
                          <button
                            onClick={() => handlePublish(form)}
                            title="Publish (locks questions)"
                            aria-label={`Publish ${form.formName}`}
                            className="rounded-lg p-1.5 text-green-600 transition hover:bg-green-50"
                          >
                            <CheckCircle2 size={16} />
                          </button>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

function BreakdownList({ title, rows }: { title: string; rows: Array<{ name: string; averageScore: number; count: number }> }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <h4 className="mb-3 text-sm font-semibold text-gray-900">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No data yet.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.name}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-gray-700">{r.name}</span>
                <span className="font-medium text-gray-900">
                  {r.averageScore}% <span className="text-xs font-normal text-gray-400">({r.count})</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(r.averageScore, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
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
        <BreakdownList title="By Department" rows={analytics.byDepartment} />
        <BreakdownList title="By Designation" rows={analytics.byDesignation} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h4 className="mb-3 text-sm font-semibold text-gray-900">Score Distribution</h4>
          {analytics.distribution.length === 0 ? (
            <p className="text-sm text-gray-500">No data yet.</p>
          ) : (
            <div className="space-y-2.5">
              {analytics.distribution.map((d) => {
                const total = analytics.distribution.reduce((s, x) => s + x.count, 0) || 1;
                return (
                  <div key={d.band}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-700">{d.band}</span>
                      <span className="font-medium text-gray-900">{d.count}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${(d.count / total) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h4 className="mb-3 text-sm font-semibold text-gray-900">Trend</h4>
          {analytics.trend.length === 0 ? (
            <p className="text-sm text-gray-500">No data yet.</p>
          ) : (
            <div className="space-y-2.5">
              {analytics.trend.map((t) => (
                <div key={t.period} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{t.period}</span>
                  <span className="font-medium text-gray-900">
                    {t.averageScore}% <span className="text-xs font-normal text-gray-400">({t.count})</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
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
                      <tr key={ev.appraisalId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-4 py-3.5 font-medium text-gray-900">{ev.employeeName}</td>
                        <td className="px-4 py-3.5 text-gray-700">{ev.formName}</td>
                        <td className="px-4 py-3.5 text-gray-700">{ev.reviewerName}</td>
                        <td className="px-4 py-3.5 text-gray-700">{ev.reviewPeriod}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-700">{formatDisplayDate(ev.reviewDate)}</td>
                        <td className="px-4 py-3.5 text-right font-medium text-gray-900">{ev.totalScore}%</td>
                        <td className="px-4 py-3.5">
                          <div className="flex justify-end">
                            <button
                              onClick={() => setSelected(ev)}
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

      {selected && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={`Evaluation · ${selected.employeeName}`}
          description={`${selected.formName} · ${selected.reviewPeriod} · reviewed by ${selected.reviewerName}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            <div className="rounded-xl bg-brand-light px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-dark">Total Score</p>
              <p className="text-3xl font-semibold text-gray-900">{selected.totalScore}%</p>
            </div>

            <div className="space-y-2">
              {selected.scores.map((s) => (
                <div key={s.scoreId} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{s.criteriaName}</p>
                    <p className="text-sm text-gray-700">
                      {s.score}/{s.ratingScale}
                      <span className="ml-2 text-xs text-gray-400">weight {s.weightage}%</span>
                    </p>
                  </div>
                  {s.remarks && <p className="mt-1.5 text-sm text-gray-500">{s.remarks}</p>}
                </div>
              ))}
            </div>

            {selected.comments && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Comments</p>
                <p className="mt-1 text-sm text-gray-700">{selected.comments}</p>
              </div>
            )}
            {selected.recommendation && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Recommendation</p>
                <p className="mt-1 text-sm text-gray-700">{selected.recommendation}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
