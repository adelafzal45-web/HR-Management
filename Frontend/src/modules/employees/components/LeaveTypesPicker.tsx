// ============================================================================
// "Allowed Leave Types" — a checkbox list where each ticked type carries its own
// allocation and consumed days, and shows what remains.
//
// Replaces the old single "Leave Type" select. Remaining days are displayed but
// never edited: the value is derived (allocated − used) on the server, and
// offering it as an input would invite three numbers that disagree.
// ============================================================================

import { CalendarCheck } from "lucide-react";

import type {
  LeaveAssignmentPayload,
  LeaveTypeCatalogItem,
} from "@/modules/employees/types/employee.types";
import { validateAllocation } from "@/modules/employees/validation/employeeValidation";

/** One row of editable state, keyed by leave type. */
export type LeaveSelection = {
  leave_type_id: string;
  allocated_days: number;
  used_days: number;
};

type LeaveTypesPickerProps = {
  catalog: LeaveTypeCatalogItem[];
  value: LeaveSelection[];
  onChange: (next: LeaveSelection[]) => void;
  /** Hidden on create — nothing has been consumed yet on a brand-new employee. */
  showUsedDays?: boolean;
  disabled?: boolean;
};

/** Maps UI state to the PATCH /users/:id/leave-types body. */
export const toAssignments = (rows: LeaveSelection[]): LeaveAssignmentPayload[] =>
  rows.map((row) => ({
    leave_type_id: row.leave_type_id,
    allocated_days: row.allocated_days,
    used_days: row.used_days,
  }));

export default function LeaveTypesPicker({
  catalog,
  value,
  onChange,
  showUsedDays = false,
  disabled = false,
}: LeaveTypesPickerProps) {
  const selected = new Map(value.map((row) => [row.leave_type_id, row]));

  const toggle = (type: LeaveTypeCatalogItem, checked: boolean) => {
    if (!checked) {
      onChange(value.filter((row) => row.leave_type_id !== type.leave_type_id));
      return;
    }

    // Seed the allocation from the type's annual entitlement — that is the
    // answer in the overwhelming majority of cases, and typing it again for
    // every type would be busywork.
    onChange([
      ...value,
      {
        leave_type_id: type.leave_type_id,
        allocated_days: type.max_days_per_year ?? 0,
        used_days: 0,
      },
    ]);
  };

  const setField = (
    id: string,
    field: "allocated_days" | "used_days",
    raw: string,
  ) => {
    // Empty input reads as 0 rather than NaN, so the field can be cleared and
    // retyped without the row briefly becoming invalid.
    const parsed = raw === "" ? 0 : Number(raw);
    onChange(
      value.map((row) =>
        row.leave_type_id === id
          ? { ...row, [field]: Number.isNaN(parsed) ? 0 : parsed }
          : row,
      ),
    );
  };

  const active = catalog.filter((type) => type.is_active);

  if (active.length === 0) {
    return (
      <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
        No active leave types are configured. Add them under Settings → Leave
        Types before assigning leave.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {active.map((type) => {
        const row = selected.get(type.leave_type_id);
        const checked = Boolean(row);
        const remaining = row
          ? Math.max(0, row.allocated_days - row.used_days)
          : 0;
        const rowError = row
          ? validateAllocation(row.allocated_days, row.used_days)
          : undefined;

        return (
          <div
            key={type.leave_type_id}
            className={`rounded-xl border p-3 transition ${
              checked ? "border-brand/50 bg-brand-light/15" : "border-gray-200 bg-white"
            }`}
          >
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => toggle(type, e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand focus:ring-brand/60 disabled:cursor-not-allowed"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{type.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      type.is_paid
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {type.is_paid ? "Paid" : "Unpaid"}
                  </span>
                  {type.carry_forward_allowed && (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                      Carry forward up to {type.max_carry_forward_days}
                    </span>
                  )}
                </span>
                {type.description && (
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {type.description}
                  </span>
                )}
              </span>
            </label>

            {checked && row && (
              <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-brand/20 pt-3 pl-7">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Allocated days
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    inputMode="decimal"
                    value={row.allocated_days}
                    disabled={disabled}
                    onChange={(e) =>
                      setField(type.leave_type_id, "allocated_days", e.target.value)
                    }
                    className="w-28 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60 disabled:bg-gray-50"
                  />
                </label>

                {showUsedDays && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Used days
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      inputMode="decimal"
                      value={row.used_days}
                      disabled={disabled}
                      onChange={(e) =>
                        setField(type.leave_type_id, "used_days", e.target.value)
                      }
                      className="w-28 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60 disabled:bg-gray-50"
                    />
                  </label>
                )}

                {/* Derived server-side; shown read-only so the three numbers
                    can never disagree. */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Remaining
                  </span>
                  <span className="inline-flex min-w-[7rem] items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-sm font-semibold text-brand-dark ring-1 ring-brand/30">
                    <CalendarCheck size={14} />
                    {remaining} {remaining === 1 ? "day" : "days"}
                  </span>
                </div>

                {rowError && (
                  <p role="alert" className="w-full text-xs font-medium text-red-600">
                    {rowError}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
