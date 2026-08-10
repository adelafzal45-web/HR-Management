// ============================================================================
// Employee ID Cards (spec section 8).
//
// Gated on `employees.card.view`; the PDF and Print actions additionally
// require `employees.card.download` — the backend enforces the same keys, this
// only hides controls the user cannot use.
//
// The roster is the same sortable, filterable grid the Employees page uses, so
// choosing a card is choosing a row and every row carries its own PDF and Print
// action. The columns show the card's own fields — code, designation,
// department, issue and expiry dates — read from the same builder that feeds
// the printed face, so what the table lists is what the card says.
//
// The faces themselves live in components/idcard/ and render at true physical
// size (CR80, 53.98mm x 85.6mm).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Download, Loader2, Printer, RefreshCw } from "lucide-react";

import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import SectionTabs from "@/components/common/SectionTabs";
import { getEmployeeTabs } from "@/config/featureTabs";
import { useAuth } from "@/app/providers/AuthContext";
import { useBranding } from "@/app/providers/BrandingContext";
import { useToast } from "@/app/providers/ToastContext";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { API_BASE_URL, ApiError } from "@/lib/apiClient";
import { exportExcel, exportPDF, type ExportFormat } from "@/utils/exportUtils";

import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import EmployeeDataGrid, {
  type BulkAction,
  type FilterChip,
  type GridColumn,
} from "@/modules/employees/components/EmployeeDataGrid";
import { employeeService } from "@/modules/employees/api/employeeService";
import { fullName, type Employee } from "@/modules/employees/types/employee.types";
import {
  departmentsApi,
  designationsApi,
  type Department,
  type Designation,
} from "@/modules/settings/api/settingsApi";

import { IdCardFront } from "@/modules/employees/components/idcard/IdCardFront";
import { IdCardBack } from "@/modules/employees/components/idcard/IdCardBack";
import {
  IdCardPage,
  IdCardSheet,
  IdCardStage,
} from "@/modules/employees/components/idcard/IdCardSheet";
import {
  buildIdCardData,
  type IdCardData,
} from "@/modules/employees/components/idcard/idCardData";
import { downloadIdCardsPdf } from "@/modules/employees/components/idcard/idCardPdf";
import { warmQrDataUrl } from "@/modules/employees/components/idcard/useQrDataUrl";

/**
 * Page size for the roster fetch.
 *
 * `/users` caps `limit` at 100 (PaginationQueryDto), so the whole roster is
 * pulled a page at a time and the grid then pages through it client-side.
 */
const PAGE_SIZE = 100;

/** Stops a runaway loop if `total` ever disagrees with what the API returns. */
const MAX_PAGES = 50;

/** Settings lists allow a larger page, and there are never that many of these. */
const REF_PAGE_SIZE = 500;

/**
 * How many cards may be exported in one action.
 *
 * Each card fetches a photo and rasterises two QR codes, all on the main
 * thread; an unbounded "select all" over a few thousand employees would lock
 * the tab. The cap is surfaced in the UI rather than silently truncating.
 */
const MAX_BATCH = 50;

const EMPTY_FILTERS = { departmentId: "", designationId: "", status: "" };
type Filters = typeof EMPTY_FILTERS;

/**
 * Resolves once the browser holds the bytes, or has given up on them.
 *
 * `window.print()` snapshots the page synchronously, so a photo still in flight
 * prints as an empty frame on a card that is about to be laminated. Failures
 * resolve too — a missing photo falls back to the card's own placeholder icon,
 * which is a better outcome than blocking the print.
 */
function preloadImage(src?: string): Promise<void> {
  if (!src) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

export default function EmployeeCards() {
  const status = useBackendStatus();
  const { hasPermission } = useAuth();
  const { branding } = useBranding();
  const { showSuccess, showError, showWarning } = useToast();

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);

  /** Which row's action is running, so only that button shows a spinner. */
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);

  /**
   * Cards queued for the printer. Null means "print what's selected"; a value
   * overrides that for one pass, which is how a single row's Print button
   * prints only its own card without disturbing the selection.
   */
  const [printCards, setPrintCards] = useState<IdCardData[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Sequential rather than parallel: the first response is what tells us
      // how many pages there are, and a card roster is printed rarely enough
      // that a few extra round-trips cost less than hammering the API.
      const rows: Employee[] = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const result = await employeeService.list({ page, limit: PAGE_SIZE });
        rows.push(...result.data);
        if (result.data.length < PAGE_SIZE || rows.length >= result.total) break;
      }
      setEmployees(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load employees.");
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // A failed reference fetch costs a filter dropdown, not the page.
    void departmentsApi
      .list({ pageSize: REF_PAGE_SIZE })
      .then((res) => setDepartments(res.data))
      .catch(() => setDepartments([]));
    void designationsApi
      .list({ pageSize: REF_PAGE_SIZE })
      .then((res) => setDesignations(res.data))
      .catch(() => setDesignations([]));
  }, []);

  // ---- filtering (search + quick filters), all client-side ----------------
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (needle) {
        const haystack = [
          e.first_name,
          e.last_name,
          e.employee_code,
          e.email,
          e.designation?.title,
          e.department?.department_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (filters.departmentId && e.department?.department_id !== filters.departmentId) return false;
      if (filters.designationId && e.designation?.designation_id !== filters.designationId) return false;
      if (filters.status && String(e.status) !== filters.status) return false;
      return true;
    });
  }, [employees, search, filters]);

  /**
   * Card data for every loaded employee, built once per load rather than per
   * render — the grid reads it for the date columns, the preview renders it,
   * and the export actions hand it straight to the PDF and print paths, so all
   * four are guaranteed to be describing the same card.
   */
  const cardsByUser = useMemo(() => {
    const map = new Map<string, IdCardData>();
    for (const e of employees) map.set(e.user_id, buildIdCardData(e, branding, API_BASE_URL));
    return map;
  }, [employees, branding]);

  const cardFor = useCallback(
    (e: Employee) => cardsByUser.get(e.user_id) ?? buildIdCardData(e, branding, API_BASE_URL),
    [cardsByUser, branding],
  );

  const selectedRows = useMemo(
    () => filteredRows.filter((e) => selectedIds.has(e.user_id)),
    [filteredRows, selectedIds],
  );

  /**
   * The record whose faces fill the preview pane: the explicitly previewed
   * employee, else the first selection, else the first row — so the pane shows
   * a real card the moment the page loads instead of an empty frame.
   */
  const previewEmployee = useMemo(() => {
    if (previewId) {
      const found = employees.find((e) => e.user_id === previewId);
      if (found) return found;
    }
    return selectedRows[0] ?? filteredRows[0];
  }, [previewId, employees, selectedRows, filteredRows]);

  const previewData = previewEmployee ? cardFor(previewEmployee) : null;

  /**
   * Cards for the page-level actions: the current selection, or the previewed
   * card alone when nothing is ticked, so those buttons work without forcing
   * the user to tick a row they can already see.
   */
  const exportTargets = useMemo(() => {
    const source =
      selectedRows.length > 0 ? selectedRows : previewEmployee ? [previewEmployee] : [];
    return source.slice(0, MAX_BATCH).map(cardFor);
  }, [selectedRows, previewEmployee, cardFor]);

  const overBatchLimit = selectedRows.length > MAX_BATCH;

  // ---- actions -------------------------------------------------------------
  const downloadCards = useCallback(
    async (cards: IdCardData[], rowId?: string) => {
      if (cards.length === 0) return;
      if (rowId) setBusyRowId(rowId);
      else setExporting(true);
      try {
        const filename =
          cards.length === 1
            ? `id-card-${cards[0].employeeCode || "employee"}.pdf`
            : `id-cards-${cards.length}.pdf`;
        await downloadIdCardsPdf(cards, filename);
        showSuccess(`Downloaded ${cards.length} ID card${cards.length === 1 ? "" : "s"}.`);
      } catch {
        showError("Couldn't generate the PDF.", "Please try again.");
      } finally {
        setBusyRowId(null);
        setExporting(false);
      }
    },
    [showSuccess, showError],
  );

  /**
   * Queues cards for the printer once their photos and QR codes are in hand.
   * Warming first is what stops a card printed straight from its row — never
   * previewed, so nothing cached — from coming out with empty boxes.
   */
  const printCardsNow = useCallback(
    async (cards: IdCardData[], rowId?: string) => {
      if (cards.length === 0) return;
      if (rowId) setBusyRowId(rowId);
      else setPreparingPrint(true);
      try {
        await Promise.all([
          ...cards.map((c) => warmQrDataUrl(c.verifyUrl)),
          ...cards.map((c) => preloadImage(c.photoUrl)),
          preloadImage(cards[0].company.logoUrl),
        ]);
      } finally {
        setBusyRowId(null);
        setPreparingPrint(false);
      }
      setPrintCards(cards);
    },
    [],
  );

  // The sheet has to be committed to the DOM before the blocking print dialog
  // snapshots the page, so the call waits one frame after the state lands.
  useEffect(() => {
    if (!printCards) return;
    const frame = requestAnimationFrame(() => {
      window.print();
      setPrintCards(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [printCards]);

  const handleExport = (rowsToExport: Employee[], format: ExportFormat) => {
    if (rowsToExport.length === 0) return showWarning("Nothing to export.");
    const columns = [
      { key: "employeeCode", label: "Employee Code" },
      { key: "employeeName", label: "Employee" },
      { key: "designation", label: "Designation" },
      { key: "department", label: "Department" },
      { key: "bloodGroup", label: "Blood Group" },
      { key: "issueDate", label: "Card Issued" },
      { key: "expiryDate", label: "Card Expires" },
    ];
    const records = rowsToExport.map((e) => {
      const card = cardFor(e);
      return {
        employeeCode: card.employeeCode,
        employeeName: card.employeeName,
        designation: card.designation ?? "—",
        department: card.department ?? "—",
        bloodGroup: card.bloodGroup ?? "—",
        issueDate: card.issueDate ?? "—",
        expiryDate: card.expiryDate ?? "—",
      };
    });
    const filename = `id-cards-${new Date().toISOString().slice(0, 10)}`;

    if (format === "excel") {
      exportExcel(filename, columns, records);
    } else {
      const opened = exportPDF("Employee ID Cards", columns, records);
      if (!opened)
        return showWarning(
          "Couldn't open the print window.",
          "Check your browser's pop-up blocker and try again.",
        );
    }
    showSuccess(`Exported ${rowsToExport.length} row(s) as ${format.toUpperCase()}.`);
  };

  // ---- grid configuration --------------------------------------------------
  const columns: GridColumn<Employee>[] = [
    {
      key: "employee",
      label: "Employee",
      locked: true,
      width: 250,
      minWidth: 200,
      sortAccessor: (e) => fullName(e),
      render: (e) => (
        <div className="flex items-center gap-3">
          <EmployeeAvatar
            firstName={e.first_name}
            lastName={e.last_name}
            photo={e.profile_image}
            thumb={e.profile_image_thumb}
            size={36}
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">{fullName(e)}</p>
            <p className="truncate text-xs text-gray-400">{e.employee_code}</p>
          </div>
        </div>
      ),
    },
    {
      key: "designation",
      label: "Designation",
      width: 170,
      minWidth: 120,
      sortAccessor: (e) => e.designation?.title ?? "",
      render: (e) => e.designation?.title ?? <span className="text-gray-300">—</span>,
    },
    {
      key: "department",
      label: "Department",
      width: 170,
      minWidth: 120,
      sortAccessor: (e) => e.department?.department_name ?? "",
      render: (e) => e.department?.department_name ?? <span className="text-gray-300">—</span>,
    },
    {
      key: "bloodGroup",
      label: "Blood Group",
      width: 120,
      minWidth: 100,
      hiddenByDefault: true,
      render: (e) => e.blood_group ?? <span className="text-gray-300">—</span>,
    },
    {
      key: "issued",
      label: "Card Issued",
      width: 140,
      minWidth: 110,
      sortAccessor: (e) => e.joining_date ?? "",
      render: (e) => cardFor(e).issueDate ?? <span className="text-gray-300">—</span>,
    },
    {
      key: "expires",
      label: "Card Expires",
      width: 140,
      minWidth: 110,
      sortAccessor: (e) => e.joining_date ?? "",
      render: (e) => cardFor(e).expiryDate ?? <span className="text-gray-300">—</span>,
    },
    {
      key: "status",
      label: "Status",
      width: 110,
      minWidth: 90,
      sortAccessor: (e) => (e.status ? 1 : 0),
      render: (e) => (
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            e.status ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {e.status ? "Active" : "Inactive"}
        </span>
      ),
    },
  ];

  const filterChips: FilterChip[] = [
    filters.departmentId && {
      key: "departmentId",
      label: `Department: ${departments.find((d) => d.departmentId === filters.departmentId)?.name ?? "—"}`,
      onRemove: () => setFilters((f) => ({ ...f, departmentId: "" })),
    },
    filters.designationId && {
      key: "designationId",
      label: `Designation: ${designations.find((d) => d.designationId === filters.designationId)?.name ?? "—"}`,
      onRemove: () => setFilters((f) => ({ ...f, designationId: "" })),
    },
    filters.status && {
      key: "status",
      label: `Status: ${filters.status === "true" ? "Active" : "Inactive"}`,
      onRemove: () => setFilters((f) => ({ ...f, status: "" })),
    },
  ].filter(Boolean) as FilterChip[];

  const bulkActions: BulkAction<Employee>[] = canDownload
    ? [
        {
          key: "download-pdf",
          label: "Download PDF",
          icon: Download,
          onClick: (_ids, rows) => void downloadCards(rows.slice(0, MAX_BATCH).map(cardFor)),
        },
        {
          key: "print",
          label: "Print",
          icon: Printer,
          onClick: (_ids, rows) => void printCardsNow(rows.slice(0, MAX_BATCH).map(cardFor)),
        },
      ]
    : [];

  const printQueue = printCards ?? exportTargets;

  return (
    <DashboardLayout title="Employee ID Cards" activeKey="employees">
      <BackendStatusBanner status={status} />
      <SectionTabs tabs={tabs} active="employee-cards" />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          {error}{" "}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {overBatchLimit && (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {selectedRows.length} rows selected — only the first {MAX_BATCH} will be exported.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
        <EmployeeDataGrid<Employee>
          storageKey="hrms.employeeCards.grid"
          columns={columns}
          rows={filteredRows}
          rowKey={(e) => e.user_id}
          loading={loading}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search employees…"
          emptyIcon={CreditCard}
          emptyTitle="No employees found"
          emptyDescription={
            search || filters.departmentId || filters.designationId || filters.status
              ? "Try adjusting your search or filters."
              : "Add an employee to print their ID card."
          }
          activeFilterCount={filterChips.length}
          filterChips={filterChips}
          quickFilters={[
            {
              key: "department",
              label: "Department",
              value: filters.departmentId,
              options: departments.map((d) => ({ value: d.departmentId, label: d.name })),
              onChange: (v) => setFilters((f) => ({ ...f, departmentId: v })),
            },
            {
              key: "designation",
              label: "Designation",
              value: filters.designationId,
              options: designations.map((d) => ({ value: d.designationId, label: d.name })),
              onChange: (v) => setFilters((f) => ({ ...f, designationId: v })),
            },
            {
              key: "status",
              label: "Status",
              value: filters.status,
              options: [
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ],
              onChange: (v) => setFilters((f) => ({ ...f, status: v })),
            },
          ]}
          onResetFilters={() => {
            setFilters(EMPTY_FILTERS);
            setSearch("");
          }}
          onExport={handleExport}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          bulkActions={bulkActions}
          onRowClick={(e) => setPreviewId(e.user_id)}
          addButton={
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh employees"
              className="flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          }
          actions={(e) => {
            const busy = busyRowId === e.user_id;
            return (
              <div className="flex items-center justify-end gap-1.5">
                {canDownload && (
                  <>
                    <button
                      type="button"
                      onClick={() => void downloadCards([cardFor(e)], e.user_id)}
                      disabled={busy}
                      aria-label={`Download ID card PDF for ${fullName(e)}`}
                      title="Download PDF"
                      className="flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-gray-600 transition hover:border-brand/60 hover:bg-brand-light/40 hover:text-brand-dark disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => void printCardsNow([cardFor(e)], e.user_id)}
                      disabled={busy}
                      aria-label={`Print ID card for ${fullName(e)}`}
                      title="Print"
                      className="flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-gray-600 transition hover:border-brand/60 hover:bg-brand-light/40 hover:text-brand-dark disabled:opacity-50"
                    >
                      <Printer size={14} />
                      Print
                    </button>
                  </>
                )}
              </div>
            );
          }}
        />

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
                    onClick={() => void downloadCards(exportTargets)}
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
                    onClick={() => void printCardsNow(exportTargets)}
                    disabled={preparingPrint || exportTargets.length === 0}
                    className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    {preparingPrint ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Printer size={15} />
                    )}
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
        {printQueue.map((card, i) => (
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
