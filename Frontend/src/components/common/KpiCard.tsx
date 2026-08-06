// ============================================================================
// The KPI tile.
//
// This shape was re-declared privately on almost every dashboard in the module
// (AppraisalManagement, AppraisalStats, TeamLeadDashboard, …), each with a
// slightly different padding, icon size and label weight. One component so the
// dashboards actually look like one product.
//
// `value` is a ReactNode, not a string: several call sites render a score with
// a smaller "/100" suffix, and stringifying that would lose the styling.
// ============================================================================

import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

/** Named tones rather than raw classes — Tailwind cannot see interpolated names. */
export type KpiTone = "brand" | "green" | "amber" | "red" | "blue" | "slate";

const TONE_CLASS: Record<KpiTone, string> = {
  brand: "bg-brand-light text-brand-dark",
  green: "bg-green-50 text-green-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  blue: "bg-blue-50 text-blue-600",
  slate: "bg-gray-100 text-gray-600",
};

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  tone?: KpiTone;
  /** Small line under the value — "vs. last period", a count, a caveat. */
  hint?: string;
  /**
   * Signed percentage change. Rendered as an arrow + value; the arrow follows
   * the sign, and the colour follows `deltaGood` so a *falling* pending count
   * can still read as green.
   */
  delta?: number | null;
  /** Which direction is the good one. Defaults to up-is-good. */
  deltaGood?: "up" | "down";
  /** Makes the whole tile a button — used for drill-down into a filtered list. */
  onClick?: () => void;
};

export default function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "brand",
  hint,
  delta,
  deltaGood = "up",
  onClick,
}: KpiCardProps) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const rising = hasDelta && delta > 0;
  const positive = hasDelta && (deltaGood === "up" ? delta >= 0 : delta <= 0);
  const DeltaIcon = rising ? TrendingUp : TrendingDown;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        {Icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE_CLASS[tone]}`}
          >
            <Icon size={17} />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {hasDelta && delta !== 0 && (
          <span
            className={`flex items-center gap-0.5 text-xs font-semibold ${
              positive ? "text-green-600" : "text-red-600"
            }`}
          >
            <DeltaIcon size={13} />
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="truncate text-xs text-gray-400">{hint}</span>}
      </div>
    </>
  );

  const shell = "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${shell} w-full text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand/40`}
      >
        {body}
      </button>
    );
  }

  return <div className={shell}>{body}</div>;
}
