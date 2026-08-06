// ============================================================================
// Panel shell every appraisal chart sits in.
//
// Charts have three non-happy states — loading, failed, and "the query matched
// nothing" — and the third is the common one on a filtered dashboard. Handling
// them in the shell means a recharts chart is never handed an empty array (which
// renders as bare axes and reads like a bug) and every panel explains itself
// the same way.
// ============================================================================

import type { LucideIcon } from "lucide-react";
import { BarChart3 } from "lucide-react";

import Skeleton from "@/components/common/Skeleton";

type ChartCardProps = {
  title: string;
  subtitle?: string;
  /** Right-aligned controls — a period toggle, an export button, a legend note. */
  actions?: React.ReactNode;
  loading?: boolean;
  /** Caller-computed: true when the series has nothing to draw. */
  empty?: boolean;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  /** Plot height in px. Passed to the chart's ResponsiveContainer by the caller. */
  height?: number;
  className?: string;
  children: React.ReactNode;
};

export default function ChartCard({
  title,
  subtitle,
  actions,
  loading = false,
  empty = false,
  emptyMessage = "No data for the selected filters",
  emptyIcon: EmptyIcon = BarChart3,
  height = 280,
  className = "",
  children,
}: ChartCardProps) {
  return (
    <section
      aria-busy={loading || undefined}
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {loading ? (
        <Skeleton className="w-full" style={{ height }} />
      ) : empty ? (
        <div
          className="flex flex-col items-center justify-center gap-2 text-center"
          style={{ height }}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
            <EmptyIcon size={20} />
          </span>
          <p className="max-w-xs text-xs text-gray-500">{emptyMessage}</p>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
