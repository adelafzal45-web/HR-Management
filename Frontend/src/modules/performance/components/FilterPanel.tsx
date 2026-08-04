import { useMemo, useState } from "react";
import { Filter, X } from "lucide-react";

import Modal from "@/components/dialogs/Modal";
import type { EvaluationType } from "@/modules/appraisal/api/appraisalApi";
import type { Department, Designation } from "@/modules/settings/api/settingsApi";

export type FilterOption = { value: string; label: string };

/**
 * Which controls a given screen wants. Everything is opt-in so a table only
 * offers filters that actually narrow its rows — an inert dropdown is worse
 * than a missing one.
 */
export type FilterConfig = {
  search?: boolean;
  searchPlaceholder?: string;
  sortOptions?: FilterOption[];
  statusOptions?: FilterOption[];
  /** Free-form extra select, used for the question bank's type filter. */
  kindLabel?: string;
  kindOptions?: FilterOption[];
  department?: boolean;
  designation?: boolean;
  evaluationType?: boolean;
  dateRange?: boolean;
};

export type FilterValues = {
  search?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  status?: string;
  kind?: string;
  departmentId?: string;
  designationId?: string;
  evaluationType?: EvaluationType;
  dateFrom?: string;
  dateTo?: string;
};

type FilterPanelProps = {
  config: FilterConfig;
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  departments?: Department[];
  designations?: Designation[];
  /** Primary actions for the screen — rendered beside the trigger. */
  toolbarRight?: React.ReactNode;
};

const EVALUATION_TYPES: EvaluationType[] = ["Daily", "Weekly", "Monthly"];

const EMPTY: FilterValues = {};

/**
 * One Filter button per table, opening a panel that holds every filter for that
 * screen.
 *
 * Replaces the pattern this module had grown into — a standalone search box, a
 * row of per-column dropdowns and a separate sort control, each in a different
 * place on each tab. The active count on the trigger and the chip row beneath it
 * are what make a collapsed panel safe: a filter you cannot see is otherwise a
 * filter you forget is on.
 */
export default function FilterPanel({
  config,
  values,
  onChange,
  departments = [],
  designations = [],
  toolbarRight,
}: FilterPanelProps) {
  const [open, setOpen] = useState(false);

  const set = (patch: Partial<FilterValues>) => onChange({ ...values, ...patch });

  /*
   * Every active filter, as a labelled chip that can be dismissed on its own.
   * Sort is included — it changes what the first page shows, so it belongs with
   * the filters rather than hidden behind the panel.
   */
  const chips = useMemo(() => {
    const out: Array<{ key: string; label: string; clear: Partial<FilterValues> }> = [];

    if (values.search?.trim())
      out.push({
        key: "search",
        label: `"${values.search.trim()}"`,
        clear: { search: "" },
      });

    if (values.sortBy) {
      const label =
        config.sortOptions?.find((o) => o.value === values.sortBy)?.label ?? values.sortBy;
      out.push({
        key: "sort",
        label: `Sorted by ${label} ${values.sortOrder === "ASC" ? "↑" : "↓"}`,
        clear: { sortBy: undefined, sortOrder: undefined },
      });
    }

    if (values.status) {
      const label =
        config.statusOptions?.find((o) => o.value === values.status)?.label ?? values.status;
      out.push({ key: "status", label, clear: { status: "" } });
    }

    if (values.kind) {
      const label =
        config.kindOptions?.find((o) => o.value === values.kind)?.label ?? values.kind;
      out.push({ key: "kind", label, clear: { kind: "" } });
    }

    if (values.departmentId) {
      const name =
        departments.find((d) => d.departmentId === values.departmentId)?.name ?? "Department";
      out.push({ key: "department", label: name, clear: { departmentId: "" } });
    }

    if (values.designationId) {
      const name =
        designations.find((d) => d.designationId === values.designationId)?.name ??
        "Designation";
      out.push({ key: "designation", label: name, clear: { designationId: "" } });
    }

    if (values.evaluationType)
      out.push({
        key: "evaluationType",
        label: values.evaluationType,
        clear: { evaluationType: undefined },
      });

    if (values.dateFrom)
      out.push({ key: "dateFrom", label: `From ${values.dateFrom}`, clear: { dateFrom: "" } });
    if (values.dateTo)
      out.push({ key: "dateTo", label: `To ${values.dateTo}`, clear: { dateTo: "" } });

    return out;
  }, [values, config, departments, designations]);

  const field =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60";
  const labelText =
    "mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400";

  return (
    <div className="border-b border-gray-100 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open filters"
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              chips.length > 0
                ? "border-brand/60 bg-brand-light/40 text-brand-dark"
                : "border-gray-200 bg-white text-gray-700 hover:border-brand/60 hover:text-brand-dark"
            }`}
          >
            <Filter size={15} />
            Filter
            {chips.length > 0 && (
              <span className="rounded-full bg-brand-dark px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                {chips.length}
              </span>
            )}
          </button>

          {chips.length > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY)}
              className="text-xs font-medium text-gray-500 transition hover:text-red-600"
            >
              Clear all
            </button>
          )}
        </div>

        {toolbarRight && (
          <div className="flex shrink-0 items-center gap-2">{toolbarRight}</div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-2.5 pr-1.5 text-xs font-medium text-gray-700"
            >
              <span className="max-w-[200px] truncate">{chip.label}</span>
              <button
                type="button"
                onClick={() => set(chip.clear)}
                aria-label={`Remove filter ${chip.label}`}
                className="rounded-full p-0.5 text-gray-400 transition hover:bg-white hover:text-red-600"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title="Filters"
        description="Narrow this table down. Everything here applies together."
        onClose={() => setOpen(false)}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          {config.search && (
            <label className="block">
              <span className={labelText}>Search</span>
              <input
                type="search"
                value={values.search ?? ""}
                onChange={(e) => set({ search: e.target.value })}
                placeholder={config.searchPlaceholder ?? "Search…"}
                className={field}
              />
            </label>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {config.sortOptions && config.sortOptions.length > 0 && (
              <>
                <label className="block">
                  <span className={labelText}>Sort by</span>
                  <select
                    value={values.sortBy ?? ""}
                    onChange={(e) =>
                      set({
                        sortBy: e.target.value || undefined,
                        // A sort field with no direction would read as ascending
                        // on one screen and descending on the next.
                        sortOrder: e.target.value ? (values.sortOrder ?? "DESC") : undefined,
                      })
                    }
                    className={field}
                  >
                    <option value="">Default order</option>
                    {config.sortOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={labelText}>Direction</span>
                  <select
                    value={values.sortOrder ?? "DESC"}
                    onChange={(e) => set({ sortOrder: e.target.value as "ASC" | "DESC" })}
                    disabled={!values.sortBy}
                    className={`${field} disabled:bg-gray-50 disabled:text-gray-400`}
                  >
                    <option value="DESC">Descending</option>
                    <option value="ASC">Ascending</option>
                  </select>
                </label>
              </>
            )}

            {config.statusOptions && config.statusOptions.length > 0 && (
              <label className="block">
                <span className={labelText}>Status</span>
                <select
                  value={values.status ?? ""}
                  onChange={(e) => set({ status: e.target.value })}
                  className={field}
                >
                  <option value="">All statuses</option>
                  {config.statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {config.kindOptions && config.kindOptions.length > 0 && (
              <label className="block">
                <span className={labelText}>{config.kindLabel ?? "Type"}</span>
                <select
                  value={values.kind ?? ""}
                  onChange={(e) => set({ kind: e.target.value })}
                  className={field}
                >
                  <option value="">All</option>
                  {config.kindOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {config.evaluationType && (
              <label className="block">
                <span className={labelText}>Schedule</span>
                <select
                  value={values.evaluationType ?? ""}
                  onChange={(e) =>
                    set({
                      evaluationType: (e.target.value || undefined) as
                        | EvaluationType
                        | undefined,
                    })
                  }
                  className={field}
                >
                  <option value="">All schedules</option>
                  {EVALUATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {config.department && (
              <label className="block">
                <span className={labelText}>Department</span>
                <select
                  value={values.departmentId ?? ""}
                  onChange={(e) => set({ departmentId: e.target.value })}
                  className={field}
                >
                  <option value="">All departments</option>
                  {departments.map((d) => (
                    <option key={d.departmentId} value={d.departmentId}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {config.designation && (
              <label className="block">
                <span className={labelText}>Designation</span>
                <select
                  value={values.designationId ?? ""}
                  onChange={(e) => set({ designationId: e.target.value })}
                  className={field}
                >
                  <option value="">All designations</option>
                  {designations.map((d) => (
                    <option key={d.designationId} value={d.designationId}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {config.dateRange && (
              <>
                <label className="block">
                  <span className={labelText}>From</span>
                  <input
                    type="date"
                    value={values.dateFrom ?? ""}
                    onChange={(e) => set({ dateFrom: e.target.value || undefined })}
                    className={field}
                  />
                </label>
                <label className="block">
                  <span className={labelText}>To</span>
                  <input
                    type="date"
                    value={values.dateTo ?? ""}
                    onChange={(e) => set({ dateTo: e.target.value || undefined })}
                    className={field}
                  />
                </label>
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <span className="text-sm text-gray-500">
              {chips.length === 0
                ? "No filters applied"
                : `${chips.length} filter${chips.length === 1 ? "" : "s"} active`}
            </span>
            <div className="flex gap-2">
              {chips.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange(EMPTY)}
                  className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-gradient-to-r from-brand to-brand-dark px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
