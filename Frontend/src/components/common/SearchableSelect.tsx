// ============================================================================
// Single-choice searchable dropdown (ARIA combobox).
//
// A native <select> is fine for four statuses; it is not fine for an employee
// or department list, which is why every appraisal screen that needs to pick
// one row out of hundreds uses this instead. The browser's own type-ahead only
// matches from the start of the label and gives no visual feedback, so a list
// of "Muhammad ..." names becomes unnavigable.
//
// Deliberately unmanaged internally: `value` is always the source of truth and
// the search text resets on close, so the control can never show a filter that
// no longer applies to what is selected.
// ============================================================================

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
  /** Secondary line — employee code, department, etc. Also searched. */
  hint?: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  options: SelectOption[];
  /** null / "" renders the placeholder. */
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Visible label rendered above the control and wired up via aria-labelledby. */
  label?: string;
  disabled?: boolean;
  /** Shows a clear (×) affordance once something is selected. */
  clearable?: boolean;
  emptyMessage?: string;
  className?: string;
  /** Marks the trigger invalid for assistive tech and paints the border red. */
  invalid?: boolean;
  id?: string;
};

/** Case-insensitive substring match over the label and the hint. */
function matches(option: SelectOption, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    option.label.toLowerCase().includes(q) ||
    (option.hint?.toLowerCase().includes(q) ?? false)
  );
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  label,
  disabled = false,
  clearable = false,
  emptyMessage = "No matches",
  className = "",
  invalid = false,
  id,
}: SearchableSelectProps) {
  const reactId = useId();
  const controlId = id ?? `sel-${reactId}`;
  const listId = `${controlId}-list`;
  const labelId = `${controlId}-label`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(
    () => options.filter((o) => matches(o, query)),
    [options, query],
  );

  // Closing on an outside click rather than on blur: blur fires when focus moves
  // into the search input inside the panel, which would close it immediately.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Opening focuses the search box and parks the highlight on the current value
  // so Enter re-picks it instead of jumping to the first row.
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const index = options.findIndex((o) => o.value === value);
    setActiveIndex(index >= 0 ? index : 0);
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open, options, value]);

  // A new filter invalidates the old index — clamp instead of letting the
  // highlight point past the end of the list.
  useEffect(() => {
    setActiveIndex((i) => (i >= filtered.length ? 0 : i));
  }, [filtered.length]);

  // Keep the highlighted row inside the scroll viewport during keyboard nav.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const commit = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(Math.max(0, filtered.length - 1));
        break;
      case "Enter":
        event.preventDefault();
        if (filtered[activeIndex]) commit(filtered[activeIndex]);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && (
        <span id={labelId} className="mb-1 block text-xs font-medium text-gray-500">
          {label}
        </span>
      )}

      <button
        type="button"
        id={controlId}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-haspopup="listbox"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : placeholder}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-left text-sm outline-none transition focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 ${
          invalid ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-brand"
        }`}
      >
        <span className={`truncate ${selected ? "text-gray-800" : "text-gray-400"}`}>
          {selected?.label ?? placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {clearable && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                setOpen(false);
              }}
              className="rounded-full p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown
            size={16}
            className={`text-gray-400 transition ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="relative border-b border-gray-100 p-2">
            <Search
              size={14}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-autocomplete="list"
              className="w-full rounded-lg bg-gray-100 py-2 pl-7 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </div>

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            className="max-h-60 overflow-y-auto py-1"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-gray-400">{emptyMessage}</li>
            )}
            {filtered.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(option)}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm transition ${
                    option.disabled
                      ? "cursor-not-allowed text-gray-300"
                      : index === activeIndex
                        ? "bg-brand-light text-brand-dark"
                        : "text-gray-700"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-xs text-gray-400">{option.hint}</span>
                    )}
                  </span>
                  {isSelected && <Check size={15} className="shrink-0 text-brand-dark" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
