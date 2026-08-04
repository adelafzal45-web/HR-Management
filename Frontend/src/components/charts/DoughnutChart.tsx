import ChartLegend from "./ChartLegend";
import { chartColor, formatChartValue } from "./useChartScale";

export type DoughnutSlice = {
 label: string;
 value: number;
 color?: string;
};

type DoughnutChartProps = {
 slices: DoughnutSlice[];
 size?: number;
 /** Ring thickness as a fraction of the radius. */
 thickness?: number;
 /** Large figure in the middle. Defaults to the total. */
 centreValue?: string | number;
 centreLabel?: string;
 showLegend?: boolean;
 /** Shows each slice's share in the legend. */
 showPercentages?: boolean;
 ariaLabel?: string;
 emptyMessage?: string;
};

const TAU = Math.PI * 2;

/** Polar to cartesian, starting at 12 o'clock and running clockwise. */
function pointOnCircle(cx: number, cy: number, radius: number, fraction: number) {
 const angle = fraction * TAU - Math.PI / 2;
 return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

/**
 * Doughnut chart in plain SVG, used for status and department breakdowns.
 *
 * Slices are drawn as stroked arcs rather than filled wedge paths: one attribute
 * controls the ring thickness, and there are no hairline seams between adjacent
 * slices the way filled paths produce at some zoom levels.
 */
export default function DoughnutChart({
 slices,
 size = 220,
 thickness = 0.32,
 centreValue,
 centreLabel,
 showLegend = true,
 showPercentages = true,
 ariaLabel,
 emptyMessage = "No data yet.",
}: DoughnutChartProps) {
 const usable = slices.filter((s) => Number.isFinite(s.value) && s.value > 0);
 const total = usable.reduce((sum, s) => sum + s.value, 0);

 if (usable.length === 0 || total <= 0) {
  return (
   <div
    className="flex items-center justify-center rounded-xl bg-gray-50 px-4 text-sm text-gray-500"
    style={{ minHeight: size / 2 }}
   >
    {emptyMessage}
   </div>
  );
 }

 const cx = size / 2;
 const cy = size / 2;
 const strokeWidth = (size / 2) * thickness;
 const radius = size / 2 - strokeWidth / 2 - 2;

 let cursor = 0;
 const arcs = usable.map((slice, index) => {
  const fraction = slice.value / total;
  const start = cursor;
  const end = cursor + fraction;
  cursor = end;

  const from = pointOnCircle(cx, cy, radius, start);
  const to = pointOnCircle(cx, cy, radius, end);
  const largeArc = fraction > 0.5 ? 1 : 0;

  return {
   ...slice,
   fraction,
   color: slice.color ?? chartColor(index),
   // A single slice covers the full circle, where an arc's start and end
   // points coincide and the path renders as nothing. Draw a plain circle.
   isFull: fraction >= 0.9999,
   d: `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArc} 1 ${to.x} ${to.y}`,
  };
 });

 const summary =
  ariaLabel ??
  `Doughnut chart. ${arcs
   .map((a) => `${a.label} ${Math.round(a.fraction * 100)}%`)
   .join(", ")}.`;

 return (
  <div className="flex flex-col items-center gap-4">
   <svg
    viewBox={`0 0 ${size} ${size}`}
    preserveAspectRatio="xMidYMid meet"
    style={{ width: size, height: size, maxWidth: "100%" }}
    role="img"
    aria-label={summary}
   >
    <circle
     cx={cx}
     cy={cy}
     r={radius}
     fill="none"
     stroke="rgb(243 244 246)"
     strokeWidth={strokeWidth}
    />

    {arcs.map((arc) =>
     arc.isFull ? (
      <circle
       key={arc.label}
       cx={cx}
       cy={cy}
       r={radius}
       fill="none"
       stroke={arc.color}
       strokeWidth={strokeWidth}
      >
       <title>{`${arc.label}: ${formatChartValue(arc.value)} (100%)`}</title>
      </circle>
     ) : (
      <path
       key={arc.label}
       d={arc.d}
       fill="none"
       stroke={arc.color}
       strokeWidth={strokeWidth}
       strokeLinecap="butt"
      >
       <title>{`${arc.label}: ${formatChartValue(arc.value)} (${Math.round(
        arc.fraction * 100,
       )}%)`}</title>
      </path>
     ),
    )}

    <text
     x={cx}
     y={centreLabel ? cy - 2 : cy + 5}
     textAnchor="middle"
     fontSize={20}
     fontWeight={600}
     fill="rgb(17 24 39)"
    >
     {centreValue ?? formatChartValue(total)}
    </text>
    {centreLabel && (
     <text x={cx} y={cy + 16} textAnchor="middle" fontSize={10} fill="rgb(107 114 128)">
      {centreLabel}
     </text>
    )}
   </svg>

   {showLegend && (
    <ChartLegend
     items={arcs.map((arc) => ({
      label: arc.label,
      color: arc.color,
      value: showPercentages
       ? `${formatChartValue(arc.value)} (${Math.round(arc.fraction * 100)}%)`
       : formatChartValue(arc.value),
     }))}
    />
   )}
  </div>
 );
}
