// ============================================================================
// Skeleton loaders.
//
// The app has a full-page `LoadingOverlay`, which is right for a route
// transition and wrong for a panel refresh: re-filtering a dashboard would
// blank the whole screen and lose the user's place. These render in the shape
// of the content that is coming instead, so the layout does not jump when data
// lands.
//
// One primitive (`Skeleton`) plus the three shapes the appraisal screens
// actually repeat. Anything more specific is composed at the call site.
// ============================================================================

type SkeletonProps = {
  className?: string;
  /** For pixel heights that must match a chart's `height` prop exactly. */
  style?: React.CSSProperties;
};

/**
 * A single shimmer block. `aria-hidden` because the surrounding region carries
 * `aria-busy` — announcing a dozen empty boxes to a screen reader is noise.
 */
export default function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div aria-hidden style={style} className={`animate-pulse rounded-xl bg-gray-100 ${className}`} />
  );
}

/** Row of KPI tiles, matching KpiCard's height so the swap is seamless. */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-busy
      aria-label="Loading statistics"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[104px] rounded-2xl" />
      ))}
    </div>
  );
}

/** Card-shaped block for a chart panel. */
export function ChartSkeleton({ height = 280, title = true }: { height?: number; title?: boolean }) {
  return (
    <div
      aria-busy
      aria-label="Loading chart"
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
    >
      {title && <Skeleton className="mb-4 h-4 w-40" />}
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
}

/** Stack of table rows, same rhythm as DataTable's own loading state. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy aria-label="Loading" className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  );
}
