import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw, Bookmark, Save, Trash2, SlidersHorizontal } from "lucide-react";

export type ProfessionalFilters = {
  departmentId: string;
  designationId: string;
  status: string;
  shiftId: string;
  roleId: string;
  managerId: string;
  employmentType: string;
  dateFrom: string;
  dateTo: string;
};

export const EMPTY_FILTERS: ProfessionalFilters = {
  departmentId: "",
  designationId: "",
  status: "",
  shiftId: "",
  roleId: "",
  managerId: "",
  employmentType: "",
  dateFrom: "",
  dateTo: "",
};

export type SavedFilter = {
  id: string;
  name: string;
  filters: ProfessionalFilters;
  search: string;
};

type Option = { value: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  filters: ProfessionalFilters;
  onApply: (filters: ProfessionalFilters) => void;
  departmentOptions: Option[];
  designationOptions: Option[];
  shiftOptions: Option[];
  roleOptions: Option[];
  managerOptions: Option[];
  employmentTypeOptions: Option[];
  statusOptions: Option[];
  savedFilters: SavedFilter[];
  currentSearch: string;
  onSaveCurrent: (name: string) => void;
  onApplySaved: (saved: SavedFilter) => void;
  onDeleteSaved: (id: string) => void;
};

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Slide-over "advanced filters" panel — the SuccessFactors/Oracle HCM
// pattern of keeping rarely-changed, multi-field filtering out of the main
// toolbar so it doesn't crowd the grid, while still surfacing active
// filters as removable chips back on the page itself.
export default function AdvancedFilterDrawer({
  open,
  onClose,
  filters,
  onApply,
  departmentOptions,
  designationOptions,
  shiftOptions,
  roleOptions,
  managerOptions,
  employmentTypeOptions,
  statusOptions,
  savedFilters,
  currentSearch,
  onSaveCurrent,
  onApplySaved,
  onDeleteSaved,
}: Props) {
  const [draft, setDraft] = useState<ProfessionalFilters>(filters);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(filters);
      setShowSaveInput(false);
      setSaveName("");
    }
  }, [open, filters]);

  if (!open) return null;

  const activeCount = Object.values(draft).filter(Boolean).length;

  const set = <K extends keyof ProfessionalFilters>(key: K, value: ProfessionalFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Advanced filters"
        className="relative flex h-full w-full max-w-sm flex-col overflow-hidden bg-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-light text-brand-dark">
              <SlidersHorizontal size={16} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Advanced Filters</h2>
              {activeCount > 0 && <p className="text-xs text-gray-400">{activeCount} active</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="flex min-h-9 min-w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {savedFilters.length > 0 && (
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Saved Filters</p>
              <div className="flex flex-col gap-1.5">
                {savedFilters.map((sf) => (
                  <div
                    key={sf.id}
                    className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => onApplySaved(sf)}
                      className="flex flex-1 items-center gap-2 text-left text-gray-700 hover:text-brand-dark"
                    >
                      <Bookmark size={13} className="shrink-0 text-gray-400" />
                      <span className="truncate">{sf.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSaved(sf.id)}
                      aria-label={`Delete saved filter ${sf.name}`}
                      className="flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-md text-gray-300 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <FilterSelect label="Department" value={draft.departmentId} onChange={(v) => set("departmentId", v)} options={departmentOptions} placeholder="All Departments" />
            <FilterSelect label="Designation" value={draft.designationId} onChange={(v) => set("designationId", v)} options={designationOptions} placeholder="All Designations" />
            <FilterSelect label="Status" value={draft.status} onChange={(v) => set("status", v)} options={statusOptions} placeholder="All Statuses" />
            <FilterSelect label="Shift" value={draft.shiftId} onChange={(v) => set("shiftId", v)} options={shiftOptions} placeholder="All Shifts" />
            <FilterSelect label="Role" value={draft.roleId} onChange={(v) => set("roleId", v)} options={roleOptions} placeholder="All Roles" />
            <FilterSelect label="Manager" value={draft.managerId} onChange={(v) => set("managerId", v)} options={managerOptions} placeholder="All Managers" />
            <FilterSelect label="Employment Type" value={draft.employmentType} onChange={(v) => set("employmentType", v)} options={employmentTypeOptions} placeholder="All Types" />

            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Joining Date Range</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={draft.dateFrom}
                  onChange={(e) => set("dateFrom", e.target.value)}
                  aria-label="Joining date from"
                  className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2.5 text-sm text-gray-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
                />
                <input
                  type="date"
                  value={draft.dateTo}
                  onChange={(e) => set("dateTo", e.target.value)}
                  aria-label="Joining date to"
                  className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2.5 text-sm text-gray-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-gray-100 pt-5">
            {showSaveInput ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Name this view…"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
                />
                <button
                  type="button"
                  disabled={!saveName.trim()}
                  onClick={() => {
                    onSaveCurrent(saveName.trim());
                    setShowSaveInput(false);
                    setSaveName("");
                  }}
                  className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Save filter view"
                >
                  <Save size={15} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSaveInput(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:underline"
              >
                <Bookmark size={14} /> Save current filters as view
              </button>
            )}
            {currentSearch && <p className="mt-2 text-xs text-gray-400">Includes search term "{currentSearch}"</p>}
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={() => setDraft(EMPTY_FILTERS)}
            className="flex min-h-11 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <RotateCcw size={14} /> Reset
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="min-h-11 flex-1 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
