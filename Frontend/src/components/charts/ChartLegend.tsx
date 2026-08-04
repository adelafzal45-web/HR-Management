import { chartColor } from "./useChartScale";

export type ChartLegendItem = {
 label: string;
 /** Overrides the palette position. Omit to use `chartColor(index)`. */
 color?: string;
 /** Optional trailing figure, e.g. a count or an average. */
 value?: string | number;
};

type ChartLegendProps = {
 items: ChartLegendItem[];
 className?: string;
};

/**
 * Shared legend for the SVG charts.
 *
 * Kept out of the chart bodies so the same markup serves a doughnut, a grouped
 * bar and a multi-series line, and so a caller can place it beside a chart
 * rather than under it without the chart re-laying out.
 */
export default function ChartLegend({ items, className = "" }: ChartLegendProps) {
 if (items.length === 0) return null;

 return (
  <ul className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${className}`}>
   {items.map((item, index) => (
    <li key={item.label} className="flex items-center gap-2 text-xs text-gray-600">
     <span
      aria-hidden="true"
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: item.color ?? chartColor(index) }}
     />
     <span className="text-gray-700">{item.label}</span>
     {item.value !== undefined && (
      <span className="font-semibold text-gray-900">{item.value}</span>
     )}
    </li>
   ))}
  </ul>
 );
}
