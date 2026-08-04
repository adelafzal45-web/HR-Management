// ============================================================================
// Employee ID Cards (spec section 8).
//
// Replaces the ComingSoon placeholder at /employees/cards. Gated on
// `employees.card.view`; the PDF and Print actions additionally require
// `employees.card.download` — the backend enforces the same keys, this only
// hides controls the user cannot use.
//
// The card faces themselves live in components/idcard/ and are rendered at
// true physical size (CR80, 53.98mm x 85.6mm). This page is the surrounding
// workflow: pick employees, preview both faces, export.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  Download,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import SectionTabs from "@/components/common/SectionTabs";
import EmptyState from "@/components/common/EmptyState";
import { getEmployeeTabs } from "@/config/featureTabs";
import { useAuth } from "@/app/providers/AuthContext";
import { useBranding } from "@/app/providers/BrandingContext";
import { useToast } from "@/app/providers/ToastContext";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { API_BASE_URL, ApiError } from "@/lib/apiClient";

import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import { employeeService } from "@/modules/employees/api/employeeService";
import { fullName, type Employee } from "@/modules/employees/types/employee.types";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";

import { IdCardFront } from "@/modules/employees/components/idcard/IdCardFront";
import { IdCardBack } from "@/modules/employees/components/idcard/IdCardBack";
import {
  IdCardPage,
  IdCardSheet,
  IdCardStage,
} from "@/modules/employees/components/idcard/IdCardSheet";
import { buildIdCardData } from "@/modules/employees/components/idcard/idCardData";
import { downloadIdCardsPdf } from "@/modules/employees/components/idcard/idCardPdf";

const PAGE_SIZE = 12;

/**
 * How many cards may be exported in one action.
 *
 * Each card fetches a photo and rasterises two QR codes, all on the main
 * thread; an unbounded "select all" over a few thousand employees would lock
 * the tab. The cap is surfaced in the UI rather than silently truncating.
 */
const MAX_BATCH = 50;

export default function EmployeeCards() {
  const status = useBackendStatus();
  const { hasPermission } = useAuth();
  const { branding } = useBranding();
  const { showSuccess, showError } = useToast();

  const canDownload = hasPermission("employees.card.download");

  const tabs = useMemo(
    () =>
      getEmployeeTabs({
        showTeamLeads: hasPermission("employees.team.view"),
        showCards: hasPermission("employees.card.view"),
      }),
    [hasPermission],
  );

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);

  // Selection is keyed by id and holds the record, so a card stays selected —
  // and still previewable — after the user pages away from the row it came
  // from. Keying on id alone would leave the preview with nothing to render.
  const [selected, setSelected] = useState<Map<string, Employee>>(new Map());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void departmentsApi
      .list()
      .then((res) => setDepartments(res.data))
      // A failed department fetch costs the filter dropdown, not the page.
      .catch(() => setDepartments([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await employeeService.list({
        search: search || undefined,
        department_id: departmentFilter || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setEmployees(result.data);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load employees.");
      setEmployees([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, departmentFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, departmentFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedList = useMemo(() => Array.from(selected.values()), [selected]);

  const toggle = useCallback((employee: Employee) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(employee.user_id)) next.delete(employee.user_id);
      else next.set(employee.user_id, employee);
      return next;
    });
  }, []);

  const pageAllSelected =
    employees.length > 0 && employees.every((e) => selected.has(e.user_id));

  const togglePage = useCallback(() => {
    setSelected((prev) => {
      const next = new Map(prev);
      const allOn = employees.every((e) => next.has(e.user_id));
      for (const employee of employees) {
        if (allOn) next.delete(employee.user_id);
        else next.set(employee.user_id, employee);
      }
      return next;
    });
  }, [employees]);

  /**
   * The record whose faces are shown in the preview pane: the explicitly
   * previewed employee, else the first selection, else the first row. Falling
   * back this way means the pane always shows a real card rather than an empty
   * frame the moment the page loads.
   */
  const previewEmployee = useMemo(() => {
    if (previewId) {
      return selected.get(previewId) ?? employees.find((e) => e.user_id === previewId);
    }
    return selectedList[0] ?? employees[0];
  }, [previewId, selected, selectedList, employees]);

  const previewData = useMemo(
    () => (previewEmployee ? buildIdCardData(previewEmployee, branding, API_BASE_URL) : null),
    [previewEmployee, branding],
  );

  /**
   * Cards fed to the print sheet and the PDF: the current selection, or the
   * previewed card alone when nothing is ticked, so the primary actions work
   * without forcing the user to select a row they can already see.
   */
  const exportTargets = useMemo(() => {
    const source = selectedList.length > 0 ? selectedList : previewEmployee ? [previewEmployee] : [];
    return source.slice(0, MAX_BATCH).map((e) => buildIdCardData(e, branding, API_BASE_URL));
  }, [selectedList, previewEmployee, branding]);

  const overBatchLimit = selectedList.length > MAX_BATCH;

  const handleDownload = useCallback(async () => {
    if (exportTargets.length === 0) return;
    setExporting(true);
    try {
      const filename =
        exportTargets.length === 1
          ? `id-card-${exportTargets[0].employeeCode || "employee"}.pdf`
          : `id-cards-${exportTargets.length}.pdf`;
      await downloadIdCardsPdf(exportTargets, filename);
      showSuccess(
        `Downloaded ${exportTargets.length} ID card${exportTargets.length === 1 ? "" : "s"}.`,
      );
    } catch {
      showError("Couldn't generate the PDF.", "Please try again.");
    } finally {
      setExporting(false);
    }
  }, [exportTargets, showSuccess, showError]);

  return (
    <DashboardLayout title="Employee ID Cards" activeKey="employees">
        <BackendStatusBanner status={status} />
        <SectionTabs tabs={tabs} active="employee-cards" />

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees..."
              className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm ring-1 ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="rounded-xl border-0 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm ring-1 ring-gray-200 focus:ring-2 focus:ring-brand/60"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.departmentId} value={d.departmentId}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh employees"
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
          {/* ---- Employee picker ---- */}
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={togglePage}
                disabled={employees.length === 0}
                className="text-sm font-semibold text-brand-dark transition hover:underline disabled:opacity-40 disabled:hover:no-underline"
              >
                {pageAllSelected ? "Clear this page" : "Select this page"}
              </button>
              {selected.size > 0 && (
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>
                    {selected.size} selected
                    {overBatchLimit && (
                      <span className="ml-1 font-semibold text-amber-600">
                        — only the first {MAX_BATCH} will be exported
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelected(new Map())}
                    className="flex items-center gap-1 font-semibold text-gray-600 transition hover:text-gray-900"
                  >
                    <X size={14} />
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-gray-100"
                    style={{ animationDelay: `${i * 50}ms` }}
                  />
                ))}
              </div>
            ) : error ? (
              <div
                role="alert"
                className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
              >
                {error}{" "}
                <button
                  type="button"
                  onClick={() => void load()}
                  className="font-semibold underline"
                >
                  Try again
                </button>
              </div>
            ) : employees.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="No employees found"
                description={
                  search || departmentFilter
                    ? "Try adjusting your search or filters."
                    : "Add an employee to print their ID card."
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {employees.map((employee) => {
                  const isSelected = selected.has(employee.user_id);
                  const isPreviewing = previewEmployee?.user_id === employee.user_id;
                  return (
                    <div
                      key={employee.user_id}
                      className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 transition ${
                        isPreviewing ? "ring-2 ring-brand/60" : "ring-gray-100 hover:shadow-md"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(employee)}
                        aria-label={`Select ${fullName(employee)}`}
                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand focus:ring-brand/60"
                      />
                      <button
                        type="button"
                        onClick={() => setPreviewId(employee.user_id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <EmployeeAvatar
                          firstName={employee.first_name}
                          lastName={employee.last_name}
                          photo={employee.profile_image}
                          thumb={employee.profile_image_thumb}
                          size={40}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {fullName(employee)}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {employee.designation?.title ?? employee.employee_code}
                          </p>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-5 flex items-center justify-between rounded-2xl bg-white px-5 py-3 shadow-sm ring-1 ring-gray-100">
                <p className="text-sm text-gray-500">
                  Page {page} of {totalPages} · {total} employee{total === 1 ? "" : "s"}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-brand-dark transition hover:brightness-95 disabled:opacity-40 disabled:hover:brightness-100"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---- Preview + actions ---- */}
          <div className="xl:sticky xl:top-6 xl:self-start">
            {previewData ? (
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <div className="flex flex-col gap-6 sm:flex-row xl:flex-col">
                  <IdCardStage label="Front" scale={1.9}>
                    <IdCardFront data={previewData} />
                  </IdCardStage>
                  <IdCardStage label="Back" scale={1.9}>
                    <IdCardBack data={previewData} />
                  </IdCardStage>
                </div>

                {canDownload && (
                  <div className="mt-5 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDownload()}
                      disabled={exporting || exportTargets.length === 0}
                      className="flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                    >
                      {exporting ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Download size={15} />
                      )}
                      Download PDF
                      {exportTargets.length > 1 && ` (${exportTargets.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      disabled={exportTargets.length === 0}
                      className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Printer size={15} />
                      Print
                      {exportTargets.length > 1 && ` (${exportTargets.length})`}
                    </button>
                    <p className="text-center text-xs text-gray-400">
                      Printed at CR80 size (53.98 × 85.6 mm), one face per page.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              !loading && (
                <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-gray-100">
                  Select an employee to preview their ID card.
                </div>
              )
            )}
          </div>
        </div>

        {/* Print-only: hidden on screen, the only thing the browser prints. */}
        <IdCardSheet>
          {exportTargets.map((card, i) => (
            <div key={`${card.employeeCode}-${i}`}>
              <IdCardPage>
                <IdCardFront data={card} />
              </IdCardPage>
              <IdCardPage>
                <IdCardBack data={card} />
              </IdCardPage>
            </div>
          ))}
        </IdCardSheet>
    </DashboardLayout>
  );
}
