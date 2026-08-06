// ============================================================================
// Global filter panel.
//
// Three connected columns — categories, checklist, selection — plus the page
// switcher above them. The whole thing is data-driven: a page declares its
// categories and this renders them, so Employees can filter on Department /
// Designation / Status / Location while Payroll filters on Pay Period /
// Department without either page owning filter UI of its own.
//
// Two deliberate behaviours worth knowing before changing anything here:
//
//  · Edits are staged. Everything the user ticks lands in `draft`, and nothing
//    leaves this component until Apply is pressed. That is what makes a wide
//    multi-category selection cheap — one request instead of one per tick — and
//    it is why Apply carries a dirty check rather than being always-live.
//  · `required` is enforced, not decorated. A required category with nothing
//    selected blocks Apply and says so. The lock glyph is the visible half of a
//    rule the button actually applies; a lock that only looked locked would be
//    worse than no lock at all.
//
// Visual register is deliberately restrained: hairline borders instead of
// shadows, one solid button on the panel, tinted-not-saturated active states.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Lock, Search, SlidersHorizontal, X } from "lucide-react";

export type FilterOption = {
  value: string;
  label: string;
  /** Matching-record count. Advisory — rendered muted and right-aligned. */
  count?: number;
  /** Sub-items. A parent with children toggles the whole branch. */
  children?: FilterOption[];
};

export type FilterCategory = {
  key: string;
  label: string;
  /** Blocks Apply while empty, and shows the lock. */
  required?: boolean;
  options: FilterOption[];
  searchPlaceholder?: string;
};

export type FilterPage = {
  key: string;
  label: string;
  categories: FilterCategory[];
};

/** Selected option values, keyed by category. */
export type FilterSelection = Record<string, string[]>;

type GlobalFilterPanelProps = {
  pages: FilterPage[];
  activePageKey: string;
  onPageChange: (pageKey: string) => void;
  /** Currently applied selection for the active page. */
  value: FilterSelection;
  /** What "Reset to defaults" restores. Empty when omitted. */
  defaults?: FilterSelection;
  onApply: (selection: FilterSelection) => void;
  className?: string;
};

// --- helpers ---------------------------------------------------------------

function flatten(options: FilterOption[]): FilterOption[] {
  return options.flatMap((option) => [option, ...flatten(option.children ?? [])]);
}

/** Leaves only. A parent is a container for its children, not a value itself. */
function leavesOf(option: FilterOption): FilterOption[] {
  if (!option.children?.length) return [option];
  return option.children.flatMap(leavesOf);
}

function matches(option: FilterOption, query: string): boolean {
  return option.label.toLowerCase().includes(query.toLowerCase());
}

/**
 * Keeps a parent whose own label misses the query but whose children hit it —
 * otherwise searching "Platform" would hide the Engineering row that contains
 * it and the result would look like no match at all.
 */
function filterTree(options: FilterOption[], query: string): FilterOption[] {
  if (!query.trim()) return options;
  return options.flatMap((option) => {
    const children = filterTree(option.children ?? [], query);
    if (matches(option, query)) return [{ ...option, children: option.children }];
    if (children.length) return [{ ...option, children }];
    return [];
  });
}

function sameSelection(a: FilterSelection, b: FilterSelection): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = [...(a[key] ?? [])].sort();
    const right = [...(b[key] ?? [])].sort();
    if (left.length !== right.length) return false;
    if (left.some((v, i) => v !== right[i])) return false;
  }
  return true;
}

// --- checkbox --------------------------------------------------------------

/**
 * A real input kept off-screen so keyboard, focus and the mixed state are the
 * browser's problem rather than ours; the square beside it is the visible half.
 */
function CheckboxRow({
  checked,
  indeterminate,
  label,
  count,
  onToggle,
}: {
  checked: boolean;
  indeterminate: boolean;
  label: string;
  count?: number;
  onToggle: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2">
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 peer-focus-visible:ring-offset-1 ${
          checked
            ? "border-brand-dark bg-brand-dark text-brand-contrast"
            : indeterminate
              ? "border-brand-dark bg-brand-dark/15 text-brand-dark"
              : "border-gray-300 bg-white group-hover:border-gray-400"
        }`}
      >
        {checked && <Check size={10} strokeWidth={3} />}
        {!checked && indeterminate && <span className="h-[1.5px] w-[7px] rounded-full bg-current" />}
      </span>

      <span className="truncate text-[13px] leading-5 text-gray-700">{label}</span>

      {count !== undefined && (
        <span className="ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-gray-400">
          {count.toLocaleString()}
        </span>
      )}
    </label>
  );
}

// --- panel -----------------------------------------------------------------

export default function GlobalFilterPanel({
  pages,
  activePageKey,
  onPageChange,
  value,
  defaults = {},
  onApply,
  className = "",
}: GlobalFilterPanelProps) {
  const page = useMemo(
    () => pages.find((p) => p.key === activePageKey) ?? pages[0],
    [pages, activePageKey],
  );

  const [draft, setDraft] = useState<FilterSelection>(value);
  const [activeCategoryKey, setActiveCategoryKey] = useState(page?.categories[0]?.key ?? "");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Switching page swaps the entire category set, so a draft carried across
  // would hold selections for categories that no longer exist.
  useEffect(() => {
    setDraft(value);
    setActiveCategoryKey(page?.categories[0]?.key ?? "");
    setQuery("");
    setExpanded(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.key]);

  const category = useMemo(
    () => page?.categories.find((c) => c.key === activeCategoryKey) ?? page?.categories[0],
    [page, activeCategoryKey],
  );

  const visibleOptions = useMemo(
    () => filterTree(category?.options ?? [], query),
    [category, query],
  );

  const selectedIn = (key: string) => draft[key] ?? [];
  const totalSelected = Object.values(draft).reduce((sum, list) => sum + list.length, 0);

  const missingRequired = useMemo(
    () => (page?.categories ?? []).filter((c) => c.required && selectedIn(c.key).length === 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, draft],
  );

  const dirty = !sameSelection(draft, value);
  const canApply = dirty && missingRequired.length === 0;

  const setCategorySelection = (key: string, next: string[]) =>
    setDraft((prev) => ({ ...prev, [key]: next }));

  /** A parent toggles its whole branch; only leaves are ever stored. */
  const toggleOption = (option: FilterOption) => {
    if (!category) return;
    const leaves = leavesOf(option).map((l) => l.value);
    const current = new Set(selectedIn(category.key));
    const allOn = leaves.every((v) => current.has(v));
    leaves.forEach((v) => (allOn ? current.delete(v) : current.add(v)));
    setCategorySelection(category.key, [...current]);
  };

  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const removeValue = (categoryKey: string, optionValue: string) =>
    setCategorySelection(
      categoryKey,
      selectedIn(categoryKey).filter((v) => v !== optionValue),
    );

  const labelFor = (categoryKey: string, optionValue: string) => {
    const source = page?.categories.find((c) => c.key === categoryKey);
    return flatten(source?.options ?? []).find((o) => o.value === optionValue)?.label ?? optionValue;
  };

  const renderOption = (option: FilterOption, depth: number) => {
    const leaves = leavesOf(option).map((l) => l.value);
    const selected = new Set(selectedIn(category?.key ?? ""));
    const hit = leaves.filter((v) => selected.has(v)).length;
    const hasChildren = Boolean(option.children?.length);
    // Searching collapses the question of what is open: every surviving branch
    // is open, because the user is looking at a result set, not browsing.
    const isOpen = expanded.has(option.value) || Boolean(query.trim());

    return (
      <li key={option.value}>
        <div
          className="flex items-center gap-1.5 py-[3px] pr-3 transition-colors hover:bg-gray-50/80"
          style={{ paddingLeft: `${12 + depth * 18}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpanded(option.value)}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? "Collapse" : "Expand"} ${option.label}`}
              className="-ml-0.5 shrink-0 rounded-[3px] p-0.5 text-gray-400 transition hover:bg-gray-200/70 hover:text-gray-600"
            >
              <ChevronRight size={12} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>
          ) : (
            <span aria-hidden className="w-[17px] shrink-0" />
          )}

          <CheckboxRow
            checked={hit > 0 && hit === leaves.length}
            indeterminate={hit > 0 && hit < leaves.length}
            label={option.label}
            count={option.count}
            onToggle={() => toggleOption(option)}
          />
        </div>

        {hasChildren && isOpen && (
          <ul>{option.children!.map((child) => renderOption(child, depth + 1))}</ul>
        )}
      </li>
    );
  };

  if (!page || !category) return null;

  const groupsWithSelection = page.categories.filter((c) => selectedIn(c.key).length > 0);

  return (
    <div className={className}>
      {/* Page switcher. Deliberately outside the panel's border: it changes what
          the panel is about, rather than being one of its controls. */}
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {pages.map((p) => {
          const isActive = p.key === page.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onPageChange(p.key)}
              aria-current={isActive ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 text-[12.5px] transition-colors ${
                isActive
                  ? "bg-brand-light/60 font-medium text-brand-dark ring-1 ring-inset ring-brand/25"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <section
        aria-label={`${page.label} filters`}
        className="overflow-hidden rounded-lg border border-gray-200 bg-white"
      >
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-3.5 py-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={13} className="text-gray-400" />
            <h2 className="text-[13px] font-semibold tracking-tight text-gray-800">Filters</h2>
            {totalSelected > 0 && (
              <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-px text-[11px] font-medium tabular-nums text-gray-500">
                {totalSelected}
              </span>
            )}
          </div>
          <span className="truncate text-[12px] text-gray-400">{page.label}</span>
        </header>

        <div className="grid divide-y divide-gray-200 md:grid-cols-[12.5rem_minmax(0,1fr)_15.5rem] md:divide-x md:divide-y-0">
          {/* 1 — categories ------------------------------------------------ */}
          <nav aria-label="Filter categories" className="bg-gray-50/40 py-1.5">
            {page.categories.map((c) => {
              const isActive = c.key === category.key;
              const n = selectedIn(c.key).length;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setActiveCategoryKey(c.key);
                    setQuery("");
                  }}
                  aria-current={isActive ? "true" : undefined}
                  className={`relative flex w-full items-center gap-1.5 py-[7px] pl-3.5 pr-3 text-left transition-colors ${
                    isActive
                      ? "bg-brand-light/45 text-brand-dark"
                      : "text-gray-600 hover:bg-gray-100/70"
                  }`}
                >
                  {isActive && (
                    <span aria-hidden className="absolute inset-y-1 left-0 w-[2px] rounded-r-sm bg-brand-dark" />
                  )}
                  <span
                    className={`truncate text-[13px] ${isActive ? "font-medium" : ""}`}
                  >
                    {c.label}
                  </span>
                  {c.required && (
                    <Lock
                      size={10}
                      aria-label="Required"
                      className={isActive ? "shrink-0 text-brand-dark/60" : "shrink-0 text-gray-400"}
                    />
                  )}
                  <span className="ml-auto pl-1.5 text-[11px] tabular-nums text-gray-400">
                    {n > 0 ? n : ""}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* 2 — search + checklist ---------------------------------------- */}
          <div className="flex min-w-0 flex-col">
            <div className="p-2.5">
              <div className="relative">
                <Search
                  size={13}
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={category.searchPlaceholder ?? `Search ${category.label.toLowerCase()}…`}
                  aria-label={`Search ${category.label}`}
                  className="w-full rounded-md border border-gray-200 bg-white py-[5px] pl-7 pr-7 text-[13px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-brand focus:ring-1 focus:ring-brand/25"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[3px] p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-y border-gray-100 bg-gray-50/40 px-3.5 py-1">
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {category.label}
                {category.required && <Lock size={9} aria-label="Required" />}
              </span>
              <button
                type="button"
                onClick={() => setCategorySelection(category.key, [])}
                disabled={selectedIn(category.key).length === 0}
                className="text-[11px] text-gray-500 transition hover:text-gray-800 disabled:text-gray-300 disabled:hover:text-gray-300"
              >
                Clear
              </button>
            </div>

            <ul className="max-h-[15.5rem] min-h-[9rem] overflow-y-auto py-1">
              {visibleOptions.length === 0 ? (
                <li className="px-3.5 py-8 text-center text-[12px] text-gray-400">
                  No {category.label.toLowerCase()} matches “{query}”.
                </li>
              ) : (
                visibleOptions.map((option) => renderOption(option, 0))
              )}
            </ul>
          </div>

          {/* 3 — selected summary ------------------------------------------ */}
          <div className="flex flex-col bg-gray-50/30">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-[7px]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Selected
              </span>
              <span className="text-[11px] tabular-nums text-gray-400">{totalSelected}</span>
            </div>

            <div className="max-h-[15.5rem] min-h-[9rem] flex-1 overflow-y-auto px-3 py-2.5">
              {groupsWithSelection.length === 0 ? (
                <p className="px-0.5 pt-6 text-center text-[12px] leading-5 text-gray-400">
                  Nothing selected yet.
                  <br />
                  Pick a category to narrow the view.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {groupsWithSelection.map((c) => (
                    <div key={c.key}>
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        <span className="truncate">{c.label}</span>
                        {c.required && <Lock size={9} aria-label="Required" />}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedIn(c.key).map((v) => (
                          <span
                            key={v}
                            className="inline-flex max-w-full items-center gap-1 rounded border border-gray-200 bg-white py-[2px] pl-2 pr-1 text-[12px] leading-4 text-gray-700"
                          >
                            <span className="truncate">{labelFor(c.key, v)}</span>
                            <button
                              type="button"
                              onClick={() => removeValue(c.key, v)}
                              aria-label={`Remove ${labelFor(c.key, v)}`}
                              className="shrink-0 rounded-[2px] text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* The one place the lock cashes out: Apply is genuinely blocked. */}
            {missingRequired.length > 0 && (
              <p className="flex items-start gap-1.5 border-t border-gray-100 bg-amber-50/60 px-3 py-1.5 text-[11px] leading-4 text-amber-800">
                <Lock size={10} className="mt-0.5 shrink-0" />
                <span>
                  {missingRequired.map((c) => c.label).join(", ")}{" "}
                  {missingRequired.length === 1 ? "is" : "are"} required.
                </span>
              </p>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-3 py-2.5">
              <button
                type="button"
                onClick={() => setDraft(defaults)}
                className="rounded text-[12px] text-gray-500 underline-offset-2 transition hover:text-gray-800 hover:underline"
              >
                Reset to defaults
              </button>
              <button
                type="button"
                onClick={() => onApply(draft)}
                disabled={!canApply}
                title={
                  missingRequired.length > 0
                    ? "Select every required category first"
                    : dirty
                      ? undefined
                      : "No changes to apply"
                }
                className="rounded-md bg-brand-dark px-3 py-[6px] text-[12.5px] font-semibold text-brand-contrast transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
