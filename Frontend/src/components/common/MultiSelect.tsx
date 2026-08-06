// ============================================================================
// Multi-choice searchable dropdown with chips.
//
// Exists for one concrete backend rule: `/appraisal/compare` accepts between 2
// and 6 `employeeIds` (COMPARE_MIN / COMPARE_MAX) and 409s outside that band.
// `min`/`max` are surfaced here so the constraint is visible in the control —
// the count is shown, over-selection is blocked at the source, and the caller
// only has to disable its submit while `value.length < min`.
//
// Shares SelectOption with SearchableSelect so a caller can feed the same list
// to either control.
// ============================================================================

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import type { SelectOption } from "./SearchableSelect";

type MultiSelectProps = {
  options: SelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  label?: string;
  disabled?: boolean;
  emptyMessage?: string;
  className?: string;
  /** Advisory only — rendered in the counter so the caller's rule is visible. */
  min?: number;
  /** Hard cap: rows beyond it are disabled rather than silently dropped. */
  max?: number;
  id?: string;
};

function matches(option: SelectOption, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    option.label.toLowerCase().includes(q) ||
    (option.hint?.toLowerCase().includes(q) ?? false)
  );
}

export default function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  label,
  disabled = false,
  emptyMessage = "No matches",
  className = "",
  min,
  max,
  id,
}: MultiSelectProps) {
  const reactId = useId();
  const controlId = id ?? `msel-${reactId}`;
  const listId = `${controlId}-list`;
  const labelId = `${controlId}-label`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const atMax = max !== undefined && value.length >= max;

  const selectedOptions = useMemo(
    // Mapped from `value` rather than filtered from `options` so the chips keep
    // the user's selection order, which is the order the comparison renders in.
    () =>
      value
        .map((v) => options.find((o) => o.value === v))
        .filter((o): o is SelectOption => Boolean(o)),
    [value, options],
  );

  const filtered = useMemo(() => options.filter((o) => matches(o, query)), [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    setActiveIndex(0);
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    setActiveIndex((i) => (i >= filtered.length ? 0 : i));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const toggle = (option: SelectOption) => {
    if (option.disabled) return;
    if (selectedSet.has(option.value)) {
      onChange(value.filter((v) => v !== option.value));
      return;
    }
    // Silently ignoring the click at the cap would read as a broken control, so
    // the row is rendered disabled and this is only a backstop for keyboard use.
    if (atMax) return;
    onChange([...value, option.value]);
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
      case "Enter":
        // No close on Enter — picking several in a row is the whole point.
        event.preventDefault();
        if (filtered[activeIndex]) toggle(filtered[activeIndex]);
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

  const counter =
    max !== undefined
      ? `${value.length}/${max}`
      : value.length > 0
        ? String(value.length)
        : "";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && (
        <span id={labelId} className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-500">{label}</span>
          {counter && (
            <span
              className={`text-xs font-semibold ${
                min !== undefined && value.length < min ? "text-amber-600" : "text-gray-400"
              }`}
            >
              {counter}
            </span>
          )}
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
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:bg-gray-50"
      >
        {selectedOptions.length === 0 ? (
          <span className="truncate text-gray-400">{placeholder}</span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {selectedOptions.map((option) => (
              <span
                key={option.value}
                className="flex max-w-[12rem] items-center gap-1 rounded-full bg-brand-light px-2 py-0.5 text-xs font-medium text-brand-dark"
              >
                <span className="truncate">{option.label}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Remove ${option.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(value.filter((v) => v !== option.value));
                  }}
                  className="rounded-full transition hover:text-red-600"
                >
                  <X size={12} />
                </span>
              </span>
            ))}
          </span>
        )}
        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition ${open ? "rotate-180" : ""}`}
        />
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
            aria-multiselectable
            aria-labelledby={label ? labelId : undefined}
            className="max-h-60 overflow-y-auto py-1"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-gray-400">{emptyMessage}</li>
            )}
            {filtered.map((option, index) => {
              const isSelected = selectedSet.has(option.value);
              const blocked = option.disabled || (atMax && !isSelected);
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={blocked || undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => toggle(option)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition ${
                    blocked
                      ? "cursor-not-allowed text-gray-300"
                      : index === activeIndex
                        ? "bg-brand-light text-brand-dark"
                        : "text-gray-700"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                      isSelected ? "border-brand-dark bg-brand-dark text-white" : "border-gray-300"
                    }`}
                  >
                    {isSelected && <Check size={11} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-xs text-gray-400">{option.hint}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          {atMax && (
            <p className="border-t border-gray-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Maximum of {max} selected. Remove one to choose another.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
