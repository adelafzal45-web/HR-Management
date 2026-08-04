import { useId } from "react";

import ChartLegend from "./ChartLegend";
import {
 CHART_AXIS_TEXT,
 CHART_GRID,
 chartColor,
 formatChartValue,
 useChartScale,
} from "./useChartScale";

export type LineSeries = {
 label: string;
 /** One value per x label. `null` breaks the line rather than drawing through 0. */
 values: Array<number | null>;
 color?: string;
};

type LineChartProps = {
 labels: string[];
 series: LineSeries[];
 height?: number;
 /** Appended to axis and accessible-summary values, e.g. "%". */
 valueSuffix?: string;
 showLegend?: boolean;
 /** Accessible description. Falls back to a generated series summary. */
 ariaLabel?: string;
 emptyMessage?: string;
};

/**
 * Multi-series line chart in plain SVG.
 *
 * Trends here are read chronologically (oldest to newest, which is the order the
 * appraisal endpoints already return), so x is treated as evenly spaced ordinal
 * periods rather than real time — a month with no reviews is still a slot, not a
 * gap, which keeps period-over-period comparison honest.
 */
export default function LineChart({
 labels,
 series,
 height = 240,
 valueSuffix = "",
 showLegend = true,
 ariaLabel,
 emptyMessage = "No data for this range yet.",
}: LineChartProps) {
 const clipId = useId();
 const width = 640;

 const allValues = series.flatMap((s) =>
  s.values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
 );

 const scale = useChartScale({ values: allValues, width, height });

 if (labels.length === 0 || series.length === 0 || allValues.length === 0) {
  return (
   <div
    className="flex items-center justify-center rounded-xl bg-gray-50 px-4 text-sm text-gray-500"
    style={{ minHeight: height / 2 }}
   >
    {emptyMessage}
   </div>
  );
 }

 // With many periods, printing every label overlaps; keep first, last and an
 // even stride between them.
 const labelStride = Math.max(1, Math.ceil(labels.length / 8));

 const summary =
  ariaLabel ??
  `Line chart. ${series
   .map((s) => {
    const nums = s.values.filter(
     (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
    const last = nums[nums.length - 1];
    return `${s.label}: latest ${formatChartValue(last ?? 0, valueSuffix)}`;
   })
   .join("; ")}.`;

 return (
  <div>
   <svg
    viewBox={`0 0 ${width} ${height}`}
    preserveAspectRatio="xMidYMid meet"
    className="w-full"
    style={{ height }}
    role="img"
    aria-label={summary}
   >
    <defs>
     <clipPath id={clipId}>
      <rect
       x={scale.padding.left}
       y={scale.padding.top}
       width={scale.innerWidth}
       height={scale.innerHeight}
      />
     </clipPath>
    </defs>

    {scale.ticks(4).map((tick) => {
     const y = scale.y(tick);
     return (
      <g key={tick}>
       <line
        x1={scale.padding.left}
        x2={width - scale.padding.right}
        y1={y}
        y2={y}
        stroke={CHART_GRID}
        strokeWidth={1}
       />
       <text
        x={scale.padding.left - 8}
        y={y + 3}
        textAnchor="end"
        fontSize={10}
        fill={CHART_AXIS_TEXT}
       >
        {formatChartValue(tick, valueSuffix)}
       </text>
      </g>
     );
    })}

    {labels.map((label, index) =>
     index % labelStride === 0 || index === labels.length - 1 ? (
      <text
       key={`${label}-${index}`}
       x={scale.pointX(index, labels.length)}
       y={height - scale.padding.bottom + 16}
       textAnchor="middle"
       fontSize={10}
       fill={CHART_AXIS_TEXT}
      >
       {label}
      </text>
     ) : null,
    )}

    <g clipPath={`url(#${clipId})`}>
     {series.map((s, seriesIndex) => {
      const colour = s.color ?? chartColor(seriesIndex);

      // Split into contiguous runs so a null renders as a break in the line
      // instead of a segment sloping through it.
      const runs: Array<Array<{ x: number; y: number }>> = [];
      let current: Array<{ x: number; y: number }> = [];
      s.values.forEach((value, index) => {
       if (typeof value === "number" && Number.isFinite(value)) {
        current.push({ x: scale.pointX(index, labels.length), y: scale.y(value) });
       } else if (current.length > 0) {
        runs.push(current);
        current = [];
       }
      });
      if (current.length > 0) runs.push(current);

      return (
       <g key={s.label}>
        {runs.map((run, runIndex) => (
         <polyline
          key={runIndex}
          points={run.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={colour}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
         />
        ))}
        {runs.flat().map((p, pointIndex) => (
         <circle
          key={pointIndex}
          cx={p.x}
          cy={p.y}
          r={2.5}
          fill="#fff"
          stroke={colour}
          strokeWidth={2}
         />
        ))}
       </g>
      );
     })}
    </g>

    <line
     x1={scale.padding.left}
     x2={width - scale.padding.right}
     y1={scale.y(scale.min)}
     y2={scale.y(scale.min)}
     stroke="rgb(229 231 235)"
     strokeWidth={1}
    />
   </svg>

   {showLegend && series.length > 1 && (
    <ChartLegend
     className="mt-3"
     items={series.map((s, i) => ({ label: s.label, color: s.color ?? chartColor(i) }))}
    />
   )}
  </div>
 );
}
