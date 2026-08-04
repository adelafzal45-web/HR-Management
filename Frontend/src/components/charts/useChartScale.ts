import { useMemo } from "react";

/**
 * Shared geometry for the hand-rolled SVG charts.
 *
 * There is no charting library in this project on purpose: the appraisal views
 * need to print into jsPDF, and canvas-based libraries rasterise badly there
 * while a plain <svg> is captured cleanly. These helpers are the small amount of
 * maths that the three chart components would otherwise each reimplement.
 *
 * Everything works in a fixed viewBox coordinate space rather than pixels. The
 * charts set `preserveAspectRatio` and scale to their container, so a "width" of
 * 640 here is a ratio, not a promise about rendered size.
 */

export type ChartPadding = {
 top: number;
 right: number;
 bottom: number;
 left: number;
};

const DEFAULT_PADDING: ChartPadding = { top: 12, right: 16, bottom: 28, left: 40 };

export type ChartScaleOptions = {
 values: number[];
 width?: number;
 height?: number;
 padding?: Partial<ChartPadding>;
 /**
  * Force the axis to start at zero. On by default: a bar chart with a truncated
  * baseline exaggerates small differences, and these charts are read as
  * performance comparisons between real people.
  */
 zeroBased?: boolean;
 /** Lower bound for the top of the axis, so an all-zero series still renders. */
 minMax?: number;
};

export type ChartScale = {
 width: number;
 height: number;
 padding: ChartPadding;
 innerWidth: number;
 innerHeight: number;
 max: number;
 min: number;
 /** Maps a value to a y coordinate in viewBox space. */
 y: (value: number) => number;
 /** Maps an index to the centre of its band (bars, categorical points). */
 bandCentre: (index: number, count: number) => number;
 /** Maps an index to an x coordinate spread across the full inner width (lines). */
 pointX: (index: number, count: number) => number;
 bandWidth: (count: number) => number;
 /** Evenly spaced axis values, low to high, for gridlines and labels. */
 ticks: (count?: number) => number[];
};

/** Rounds an axis maximum up to something a human would choose. */
function niceCeiling(value: number): number {
 if (!Number.isFinite(value) || value <= 0) return 0;
 const magnitude = 10 ** Math.floor(Math.log10(value));
 const normalised = value / magnitude;
 const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
 return step * magnitude;
}

export function useChartScale({
 values,
 width = 640,
 height = 240,
 padding: paddingOverride,
 zeroBased = true,
 minMax = 1,
}: ChartScaleOptions): ChartScale {
 return useMemo(() => {
  const padding: ChartPadding = { ...DEFAULT_PADDING, ...paddingOverride };

  const finite = values.filter((value) => Number.isFinite(value));
  const rawMax = finite.length > 0 ? Math.max(...finite) : 0;
  const rawMin = finite.length > 0 ? Math.min(...finite) : 0;

  const min = zeroBased ? Math.min(0, rawMin) : rawMin;
  const max = Math.max(niceCeiling(rawMax), minMax, min + minMax);

  const innerWidth = Math.max(1, width - padding.left - padding.right);
  const innerHeight = Math.max(1, height - padding.top - padding.bottom);

  const span = max - min || 1;

  const y = (value: number): number => {
   const clamped = Number.isFinite(value) ? value : min;
   const ratio = (clamped - min) / span;
   // SVG y grows downward, so a high value has to land near padding.top.
   return padding.top + innerHeight - ratio * innerHeight;
  };

  const bandWidth = (count: number): number => innerWidth / Math.max(1, count);

  const bandCentre = (index: number, count: number): number =>
   padding.left + bandWidth(count) * (index + 0.5);

  const pointX = (index: number, count: number): number =>
   count <= 1
    ? padding.left + innerWidth / 2
    : padding.left + (innerWidth * index) / (count - 1);

  const ticks = (count = 4): number[] =>
   Array.from({ length: count + 1 }, (_, i) => min + (span * i) / count);

  return {
   width,
   height,
   padding,
   innerWidth,
   innerHeight,
   max,
   min,
   y,
   bandCentre,
   pointX,
   bandWidth,
   ticks,
  };
 }, [values, width, height, paddingOverride, zeroBased, minMax]);
}

/**
 * Chart palette.
 *
 * The first entry is the live brand colour so a single-series chart follows
 * Settings > Branding; the rest are fixed muted tones that stay legible against
 * any brand hue a company picks. They are `rgb()` strings rather than Tailwind
 * classes because SVG `fill`/`stroke` need real colour values.
 */
export const CHART_COLORS = [
 "rgb(var(--color-brand))",
 "rgb(96 165 250)",
 "rgb(52 211 153)",
 "rgb(167 139 250)",
 "rgb(251 146 60)",
 "rgb(244 114 182)",
];

export const CHART_GRID = "rgb(243 244 246)";
export const CHART_AXIS_TEXT = "rgb(107 114 128)";

export function chartColor(index: number): string {
 return CHART_COLORS[index % CHART_COLORS.length];
}

/** Formats an axis/tooltip number without trailing noise. */
export function formatChartValue(value: number, suffix = ""): string {
 if (!Number.isFinite(value)) return "-";
 const rounded = Math.round(value * 10) / 10;
 return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}${suffix}`;
}
