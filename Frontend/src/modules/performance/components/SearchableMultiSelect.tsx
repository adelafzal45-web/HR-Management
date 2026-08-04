import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Info, Search, X } from "lucide-react";

import InfoTip from "@/components/common/InfoTip";

export type SelectItem = {
  id: string;
  label: string;
  /** Secondary text shown dimmed on the right of the row. */
  sublabel?: string;
  /** Longer explanation shown under the label. Used by the schedule picker. */
  detail?: string;
};

type BaseProps = {
  label: string;
  /** Shown under the control. Explains what the selection actually does. */
  hint?: string;
  items: SelectItem[];
  disabled?: boolean;
  /** Shown inside the panel when `items` is empty. */
  emptyText?: string;
  placeholder?: string;
};

type MultiProps = BaseProps & {
  multiple?: true;
  selected: string[];
  onChange: (ids: string[]) => void;
};

type SingleProps = BaseProps & {
  multiple: false;
  selected: string;
  onChange: (id: string) => void;
};

type Props = MultiProps | SingleProps;

/**
 * One control for every audience and cadence choice on the form editor: a
 * closed-by-default dropdown that contains its own search box and a checkbox
 * (or radio) row per item, with the current selection shown as chips on the
 * trigger.
 *
 * Built inline because the project has no shared UI kit. It replaces both the
 * always-expanded checkbox list that used to sit in the page flow — which cost
 * a fixed ~250px per picker whether or not anyone was choosing — and the
 * side-by-side schedule cards, so all three selections now read the same way.
 */
export default function SearchableMultiSelect(props: Props) {
  const {
    label,
    hint,
    items,
    disabled = false,
    emptyText = "Nothing to choose from yet.",
    placeholder = "Select…",
  } = props;
  const isMulti = props.multiple !== false;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedIds = useMemo(
    () =>
      props.multiple === false
        ? props.selected
          ? [props.selected]
          : []
        : props.selected,
    [props.multiple, props.selected],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(
    () => items.filter((i) => selectedSet.has(i.id)),
    [items, selectedSet],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(needle) ||
        i.sublabel?.toLowerCase().includes(needle) ||
        i.detail?.toLowerCase().includes(needle),
    );
  }, [items, search]);

  // Closing on an outside click is what makes this feel like a dropdown rather
  // than an inline panel; without it the only way out is re-clicking the
  // trigger, which reads as stuck.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // The search box is the reason the panel exists, so focus lands there rather
  // than on the first row.
  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setSearch("");
  }, [open]);

  const pick = (id: string) => {
    if (props.multiple === false) {
      props.onChange(id);
      setOpen(false);
      return;
    }
    props.onChange(
      selectedSet.has(id)
        ? props.selected.filter((s) => s !== id)
        : [...props.selected, id],
    );
  };

  const clearAll = () => {
    if (props.multiple === false) props.onChange("");
    else props.onChange([]);
  };

  const chosenDetail =
    props.multiple === false ? selectedItems[0]?.detail : undefined;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-1 text-sm font-medium text-gray-900">
          {label}
          {isMulti && (
            <span className="font-normal text-gray-400">
              ({selectedIds.length} selected)
            </span>
          )}
          {/*
           * The explanation moved off the page and behind the ⓘ. Three pickers
           * each carrying two lines of prose pushed the questions below the
           * fold, and the text is only ever read once — on a first visit.
           */}
          {hint && <InfoTip text={hint} label={`About ${label}`} />}
        </span>
        {isMulti && selectedIds.length > 0 && !disabled && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium text-gray-500 transition hover:text-red-600"
          >
            Clear all
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition focus:ring-2 focus:ring-brand/60 ${
          disabled
            ? "cursor-not-allowed bg-gray-50 text-gray-400"
            : "bg-gray-100 text-gray-800 hover:bg-gray-200/70"
        }`}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selectedItems.length === 0 ? (
            <span className="text-gray-400">{placeholder}</span>
          ) : isMulti ? (
            selectedItems.map((item) => (
              <span
                key={item.id}
                className="flex max-w-full items-center gap-1 rounded-md bg-white px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200"
              >
                <span className="truncate">{item.label}</span>
                {!disabled && (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${item.label}`}
                    onClick={(e) => {
                      // Otherwise the click bubbles to the trigger and reopens
                      // the panel the user was closing by removing a chip.
                      e.stopPropagation();
                      pick(item.id);
                    }}
                    className="shrink-0 rounded text-gray-400 transition hover:text-red-600"
                  >
                    <X size={11} />
                  </span>
                )}
              </span>
            ))
          ) : (
            <span className="truncate font-medium text-gray-800">
              {selectedItems[0].label}
            </span>
          )}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-gray-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-gray-200">
          <div className="relative border-b border-gray-100">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full bg-white py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-gray-400"
            />
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5">
            {items.length === 0 ? (
              <p className="px-2 py-3 text-xs text-gray-400">{emptyText}</p>
            ) : filtered.length === 0 ? (
              <p className="px-2 py-3 text-xs text-gray-400">
                Nothing matches "{search}".
              </p>
            ) : (
              filtered.map((item) => {
                const checked = selectedSet.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => pick(item.id)}
                    className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-gray-50 ${
                      checked ? "bg-brand-light/40" : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border transition ${
                        isMulti ? "rounded" : "rounded-full"
                      } ${
                        checked
                          ? "border-brand-dark bg-brand-dark text-white"
                          : "border-gray-300 bg-white"
                      }`}
                    >
                      {checked && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-gray-800">
                        {item.label}
                      </span>
                      {item.detail && (
                        <span className="mt-0.5 block text-xs leading-relaxed text-gray-400">
                          {item.detail}
                        </span>
                      )}
                    </span>
                    {item.sublabel && (
                      <span className="shrink-0 text-xs text-gray-400">
                        {item.sublabel}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {isMulti && filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
              <span className="text-xs text-gray-400">
                {selectedIds.length} of {items.length} selected
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-dark transition hover:bg-brand-light/50"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}

      {/*
        * `detail` stays inline: it describes the *current* choice ("generates on
        * the last working day of the month"), so it changes as the selection
        * changes and is worth seeing without a hover.
        */}
      {chosenDetail && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-500">
          <Info size={12} className="mt-0.5 shrink-0 text-gray-400" />
          <span>{chosenDetail}</span>
        </p>
      )}
    </div>
  );
}
