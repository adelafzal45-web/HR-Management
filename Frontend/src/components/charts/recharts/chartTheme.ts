// ============================================================================
// One palette + one set of axis/tooltip/legend defaults for every appraisal
// chart, so the dashboards read as a single product rather than four.
//
// The brand colour is a runtime CSS custom property (see lib/theme.ts), and SVG
// *presentation attributes* — which is what recharts writes for `fill` and
// `stroke` — do not resolve `var()`. So the value is read off <html> once and
// handed to recharts as a concrete `rgb()` string. `readBrand()` is called
// lazily rather than at module scope because branding is fetched after first
// paint; calling it during render means the first chart still picks up the
// tenant's colour instead of the seed default.
// ============================================================================

/** Mirrors the seed in index.css, used until branding resolves. */
const FALLBACK_BRAND = "241 179 68";

function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return `rgb(${fallback})`;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `rgb(${raw || fallback})`;
}

export function brandColor(): string {
  return readVar("--color-brand", FALLBACK_BRAND);
}

export function brandDarkColor(): string {
  return readVar("--color-brand-dark", "224 138 62");
}

/**
 * Categorical series colours. Six entries because `/appraisal/compare` caps at
 * six employees (COMPARE_MAX) — the longest categorical series in the module,
 * so nothing ever has to wrap around and repeat a colour.
 */
export const SERIES_COLORS = [
  "#E08A3E", // brand-dark
  "#3B82F6", // blue-500
  "#10B981", // emerald-500
  "#8B5CF6", // violet-500
  "#EF4444", // red-500
  "#0EA5E9", // sky-500
] as const;

/** Score bands share fixed colours across every chart: red is always the worst band. */
export const BAND_COLORS: Record<string, string> = {
  "0-20": "#EF4444",
  "21-40": "#F97316",
  "41-60": "#F1B344",
  "61-80": "#3B82F6",
  "81-100": "#10B981",
};

/** Approval-status colours, matching StatusBadge's vocabulary. */
export const STATUS_COLORS: Record<string, string> = {
  Draft: "#9CA3AF",
  Submitted: "#3B82F6",
  Approved: "#10B981",
  Rejected: "#EF4444",
};

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

/** Shared axis styling. Spread onto <XAxis>/<YAxis>. */
export const AXIS_PROPS = {
  tick: { fontSize: 11, fill: "#6B7280" },
  tickLine: false,
  axisLine: { stroke: "#E5E7EB" },
} as const;

/** Shared tooltip chrome — matches the app's card treatment. */
export const TOOLTIP_PROPS = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
    fontSize: 12,
    padding: "8px 12px",
  },
  labelStyle: { fontWeight: 600, color: "#111827", marginBottom: 2 },
  cursor: { fill: "rgba(0,0,0,0.04)" },
} as const;

export const LEGEND_PROPS = {
  wrapperStyle: { fontSize: 12, paddingTop: 8 },
  iconType: "circle",
  iconSize: 8,
} as const;

export const GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: "#F3F4F6",
  vertical: false,
} as const;

/**
 * Adapt a plain `(number) => string` into the signature `<Tooltip formatter>`
 * expects.
 *
 * Recharts 3 types the value as `ValueType | undefined`, so a formatter written
 * as `(value: number | string) => string` fails to type-check even though it is
 * called with a number in practice. Widening to `unknown` here keeps every call
 * site writing the simple, honest signature, and gives an undefined payload a
 * dash rather than the string "NaN".
 */
export function tooltipValue(format?: (value: number) => string) {
  if (!format) return undefined;
  return (value: unknown) =>
    value === undefined || value === null ? "—" : format(Number(value));
}
