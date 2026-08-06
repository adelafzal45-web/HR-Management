// ============================================================================
// Bar chart wrapper — single or grouped series.
//
// Generic over the row type so `dataKey` is checked against the data actually
// passed: a renamed field on the API type becomes a compile error here rather
// than an empty chart at runtime, which is the failure mode this whole wrapper
// layer exists to prevent.
// ============================================================================

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AXIS_PROPS,
  GRID_PROPS,
  LEGEND_PROPS,
  TOOLTIP_PROPS,
  seriesColor,
  tooltipValue,
} from "./chartTheme";

export type BarSeries<T> = {
  /** Field on the row holding this series' value. */
  dataKey: Extract<keyof T, string>;
  name: string;
  /** Defaults to the palette entry for the series' position. */
  color?: string;
  /** Stack id — series sharing one stack together. */
  stackId?: string;
};

type AppBarChartProps<T> = {
  data: T[];
  /** Field holding the category label on the X (or Y, when horizontal) axis. */
  categoryKey: Extract<keyof T, string>;
  series: BarSeries<T>[];
  height?: number;
  /** Bars run left-to-right — better for long department names. */
  horizontal?: boolean;
  /** Only meaningful with a single series: colours each bar individually. */
  colorByPoint?: (row: T, index: number) => string;
  /** Suppressed automatically when there is only one series. */
  showLegend?: boolean;
  valueFormatter?: (value: number) => string;
  /** Upper bound for the value axis — pass 100 to keep score charts comparable. */
  maxValue?: number;
};

export default function AppBarChart<T extends Record<string, unknown>>({
  data,
  categoryKey,
  series,
  height = 280,
  horizontal = false,
  colorByPoint,
  showLegend,
  valueFormatter,
  maxValue,
}: AppBarChartProps<T>) {
  const legend = showLegend ?? series.length > 1;
  const valueDomain: [number, number] | undefined = maxValue ? [0, maxValue] : undefined;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 4, right: 8, bottom: 4, left: horizontal ? 8 : -16 }}
        barGap={2}
      >
        <CartesianGrid {...GRID_PROPS} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" domain={valueDomain} {...AXIS_PROPS} />
            <YAxis type="category" dataKey={categoryKey} width={110} {...AXIS_PROPS} />
          </>
        ) : (
          <>
            <XAxis type="category" dataKey={categoryKey} {...AXIS_PROPS} interval="preserveStartEnd" />
            <YAxis type="number" domain={valueDomain} {...AXIS_PROPS} />
          </>
        )}
        <Tooltip {...TOOLTIP_PROPS} formatter={tooltipValue(valueFormatter)} />
        {legend && <Legend {...LEGEND_PROPS} />}
        {series.map((s, i) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            stackId={s.stackId}
            fill={s.color ?? seriesColor(i)}
            radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]}
            maxBarSize={44}
          >
            {colorByPoint &&
              data.map((row, index) => (
                <Cell key={index} fill={colorByPoint(row, index)} />
              ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
