// ============================================================================
// Sticky filter bar with a collapsible advanced panel.
//
// The appraisal dashboards are long — charts, then a table, then more charts —
// so a filter bar that scrolls away leaves the user reading numbers with no
// visible statement of what produced them. This pins the primary row and pushes
// the rarely-used controls behind a toggle so the pinned strip stays one row
// tall on a phone.
//
// It is a layout shell only: it owns no filter state. Callers pass their own
// controls, which is what lets Stats, Results and the Team Lead reports share
// one chrome while sending different queries.
// ============================================================================

import { useState } from "react";
import { ChevronDown, Filter, RotateCcw } from "lucide-react";

type StickyFilterBarProps = {
  /** Always-visible controls. Keep to 2–3 on the primary row. */
  children: React.ReactNode;
  /** Revealed by the "Advanced" toggle. Omit and the toggle is not rendered. */
  advanced?: React.ReactNode;
  /** Right-aligned actions — export buttons, a refresh. */
  actions?: React.ReactNode;
  /** How many filters are set. Drives the badge and the Reset button. */
  activeCount?: number;
  onReset?: () => void;
  /**
   * Distance from the viewport top. The app shell has a fixed header, so the
   * default clears it; screens rendering inside a scroll container pass 0.
   */
  top?: string;
  className?: string;
};

export default function StickyFilterBar({
  children,
  advanced,
  actions,
  activeCount = 0,
  onReset,
  top = "top-0",
  className = "",
}: StickyFilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`sticky ${top} z-20 mb-5 rounded-2xl bg-white/95 p-4 shadow-sm ring-1 ring-gray-100 backdrop-blur ${className}`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <p className="flex items-center gap-2 pb-2 text-sm font-medium text-gray-700">
          <Filter size={15} className="text-brand-dark" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand-dark">
              {activeCount}
            </span>
          )}
        </p>

        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{children}</div>

        <div className="flex flex-wrap items-center gap-2 pb-0.5">
          {advanced && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="flex min-h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Advanced
              <ChevronDown size={14} className={`transition ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
          {activeCount > 0 && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="flex min-h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          )}
          {actions}
        </div>
      </div>

      {advanced && expanded && (
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {advanced}
        </div>
      )}
    </div>
  );
}
