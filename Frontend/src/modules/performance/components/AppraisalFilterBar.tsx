import { useEffect, useState } from "react";
import { Filter, X } from "lucide-react";

import {
  departmentsApi,
  designationsApi,
  type Department,
  type Designation,
} from "@/modules/settings/api/settingsApi";
import type {
  AppraisalStatsFilters,
  EvaluationType,
} from "@/modules/appraisal/api/appraisalApi";

type AppraisalFilterBarProps = {
  value: AppraisalStatsFilters;
  onChange: (next: AppraisalStatsFilters) => void;
  /** Hidden on the compare screen, where employees are picked explicitly. */
  showStatus?: boolean;
  /** Extra controls (export buttons) rendered on the right. */
  right?: React.ReactNode;
};

const EVALUATION_TYPES: EvaluationType[] = ["Daily", "Weekly", "Monthly"];
const STATUSES = ["Draft", "Submitted", "Approved", "Rejected"];

/**
 * The filter set shared by Stats, Results and Compare.
 *
 * One component because the backend takes one filter shape for all three: a
 * filter that exists on the stats screen but not on the export beside it would
 * produce a spreadsheet that disagrees with the chart above it.
 *
 * Department and designation lists come from Settings. A failure to load them
 * is deliberately silent — the dropdowns simply stay empty rather than blocking
 * the screen, since every filter here is optional.
 */
export default function AppraisalFilterBar({
  value,
  onChange,
  showStatus = true,
  right,
}: AppraisalFilterBarProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      departmentsApi.list({ pageSize: 200 }).catch(() => ({ data: [], total: 0 })),
      designationsApi.list({ pageSize: 200 }).catch(() => ({ data: [], total: 0 })),
    ]).then(([dept, desig]) => {
      if (cancelled) return;
      setDepartments(dept.data);
      setDesignations(desig.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (patch: Partial<AppraisalStatsFilters>) => onChange({ ...value, ...patch });

  const activeCount = Object.values(value).filter((v) => v !== undefined && v !== "").length;

  const field =
    "rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60";

  return (
    <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Filter size={15} className="text-gray-400" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-medium text-brand-dark">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {right}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => onChange({})}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark"
            >
              <X size={14} />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">From</span>
          <input
            type="date"
            value={value.dateFrom ?? ""}
            onChange={(e) => set({ dateFrom: e.target.value || undefined })}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">To</span>
          <input
            type="date"
            value={value.dateTo ?? ""}
            onChange={(e) => set({ dateTo: e.target.value || undefined })}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Department</span>
          <select
            value={value.departmentId ?? ""}
            onChange={(e) => set({ departmentId: e.target.value || undefined })}
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

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Designation</span>
          <select
            value={value.designationId ?? ""}
            onChange={(e) => set({ designationId: e.target.value || undefined })}
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

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Type</span>
          <select
            value={value.evaluationType ?? ""}
            onChange={(e) =>
              set({ evaluationType: (e.target.value || undefined) as EvaluationType | undefined })
            }
            className={field}
          >
            <option value="">All types</option>
            {EVALUATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {showStatus && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Status</span>
            <select
              value={value.status ?? ""}
              onChange={(e) => set({ status: e.target.value || undefined })}
              className={field}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
