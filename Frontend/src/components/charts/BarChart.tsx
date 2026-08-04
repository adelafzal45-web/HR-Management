import ChartLegend from "./ChartLegend";
import {
 CHART_AXIS_TEXT,
 CHART_GRID,
 chartColor,
 formatChartValue,
 useChartScale,
} from "./useChartScale";

export type BarSeries = {
 label: string;
 values: number[];
 color?: string;
};

type BarChartProps = {
 labels: string[];
 /** One series draws plain bars; several draw grouped bars per label. */
 series: BarSeries[];
 height?: number;
 valueSuffix?: string;
 showLegend?: boolean;
 /** Draws each bar's figure above it. Off for dense charts. */
 showValues?: boolean;
 ariaLabel?: string;
 emptyMessage?: string;
};

/**
 * Grouped bar chart in plain SVG.
 *
 * The axis is always zero-based (see `useChartScale`) because these bars compare
 * people's scores against one another, and a cropped baseline would make a two
 * point difference look like a landslide.
 */
export default function BarChart({
 labels,
 series,
 height = 240,
 valueSuffix = "",
 showLegend = true,
 showValues = false,
 ariaLabel,
 emptyMessage = "No data for this range yet.",
}: BarChartProps) {
 const width = 640;
 const allValues = series.flatMap((s) => s.values.filter((v) => Number.isFinite(v)));
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

 const band = scale.bandWidth(labels.length);
 // Leave a gutter between groups, then split what's left between the series.
 const groupWidth = band * 0.7;
 const barWidth = Math.max(2, groupWidth / series.length);
 const labelStride = Math.max(1, Math.ceil(labels.length / 10));

 const summary =
  ariaLabel ??
  `Bar chart comparing ${labels.length} ${labels.length === 1 ? "category" : "categories"} across ${series
   .map((s) => s.label)
   .join(", ")}.`;

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

    {labels.map((label, labelIndex) => {
     const centre = scale.bandCentre(labelIndex, labels.length);
     const groupLeft = centre - groupWidth / 2;
     const baseline = scale.y(scale.min);

     return (
      <g key={`${label}-${labelIndex}`}>
       {series.map((s, seriesIndex) => {
        const value = Number.isFinite(s.values[labelIndex]) ? s.values[labelIndex] : 0;
        const top = scale.y(value);
        const barHeight = Math.max(0, baseline - top);
        const x = groupLeft + barWidth * seriesIndex;

        return (
         <g key={s.label}>
          <rect
           x={x}
           y={top}
           width={Math.max(1, barWidth - 2)}
           height={barHeight}
           rx={Math.min(3, barWidth / 2)}
           fill={s.color ?? chartColor(seriesIndex)}
          >
           <title>{`${label} · ${s.label}: ${formatChartValue(value, valueSuffix)}`}</title>
          </rect>
          {showValues && barHeight > 0 && (
           <text
            x={x + (barWidth - 2) / 2}
            y={top - 4}
            textAnchor="middle"
            fontSize={9}
            fill={CHART_AXIS_TEXT}
           >
            {formatChartValue(value, valueSuffix)}
           </text>
          )}
         </g>
        );
       })}

       {(labelIndex % labelStride === 0 || labelIndex === labels.length - 1) && (
        <text
         x={centre}
         y={height - scale.padding.bottom + 16}
         textAnchor="middle"
         fontSize={10}
         fill={CHART_AXIS_TEXT}
        >
         {label.length > 14 ? `${label.slice(0, 13)}…` : label}
        </text>
       )}
      </g>
     );
    })}

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
