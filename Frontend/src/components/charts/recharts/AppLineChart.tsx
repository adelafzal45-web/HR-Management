// ============================================================================
// Line / area chart wrapper — score trends over review periods.
//
// `connectNulls` is on by default because the backend's series only emits a
// point for periods that actually had an evaluation. Without it, an employee
// reviewed weekly with one week skipped renders as two disconnected fragments,
// which reads as missing data rather than as a gap.
// ============================================================================

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

export type LineSeries<T> = {
  dataKey: Extract<keyof T, string>;
  name: string;
  color?: string;
  /** Dashed — used for a reference/target line beside the real one. */
  dashed?: boolean;
};

type AppLineChartProps<T> = {
  data: T[];
  categoryKey: Extract<keyof T, string>;
  series: LineSeries<T>[];
  height?: number;
  /** Fills under the line. Only sensible with a single series. */
  area?: boolean;
  showLegend?: boolean;
  showDots?: boolean;
  valueFormatter?: (value: number) => string;
  maxValue?: number;
  connectNulls?: boolean;
};

export default function AppLineChart<T extends Record<string, unknown>>({
  data,
  categoryKey,
  series,
  height = 280,
  area = false,
  showLegend,
  showDots = true,
  valueFormatter,
  maxValue,
  connectNulls = true,
}: AppLineChartProps<T>) {
  const legend = showLegend ?? series.length > 1;
  const domain: [number, number] | undefined = maxValue ? [0, maxValue] : undefined;
  const tooltipFormatter = tooltipValue(valueFormatter);

  if (area) {
    const color = series[0]?.color ?? seriesColor(0);
    const gradientId = `area-${String(series[0]?.dataKey ?? "value")}`;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey={categoryKey} {...AXIS_PROPS} interval="preserveStartEnd" />
          <YAxis domain={domain} {...AXIS_PROPS} />
          <Tooltip {...TOOLTIP_PROPS} formatter={tooltipFormatter} />
          {legend && <Legend {...LEGEND_PROPS} />}
          {series.map((s, i) => (
            <Area
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name}
              stroke={s.color ?? seriesColor(i)}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              connectNulls={connectNulls}
              dot={showDots ? { r: 3, strokeWidth: 0 } : false}
              activeDot={{ r: 5 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey={categoryKey} {...AXIS_PROPS} interval="preserveStartEnd" />
        <YAxis domain={domain} {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_PROPS} formatter={tooltipFormatter} />
        {legend && <Legend {...LEGEND_PROPS} />}
        {series.map((s, i) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.color ?? seriesColor(i)}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            connectNulls={connectNulls}
            dot={showDots ? { r: 3, strokeWidth: 0 } : false}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
