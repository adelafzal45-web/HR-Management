// ============================================================================
// Radar wrapper — category profiles.
//
// Used where the question is "what shape is this person's performance", not
// "what is the number": the employee's own category breakdown, and the compare
// screen overlaying up to six people on one axis set.
//
// The radius axis is fixed to 0–`maxValue` (100 by default) rather than
// auto-scaled. Recharts would otherwise fit the axis to the data, so a profile
// of 82/85/88 fills the whole web and looks identical to one of 20/50/95 —
// which is exactly the comparison the chart is there to make.
// ============================================================================

import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { LEGEND_PROPS, TOOLTIP_PROPS, seriesColor, tooltipValue } from "./chartTheme";

export type RadarSeries<T> = {
  dataKey: Extract<keyof T, string>;
  name: string;
  color?: string;
};

type AppRadarChartProps<T> = {
  /** One row per axis (category), one field per series. */
  data: T[];
  /** Field holding the axis label. */
  categoryKey: Extract<keyof T, string>;
  series: RadarSeries<T>[];
  height?: number;
  maxValue?: number;
  showLegend?: boolean;
  valueFormatter?: (value: number) => string;
};

export default function AppRadarChart<T extends Record<string, unknown>>({
  data,
  categoryKey,
  series,
  height = 300,
  maxValue = 100,
  showLegend,
  valueFormatter,
}: AppRadarChartProps<T>) {
  const legend = showLegend ?? series.length > 1;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#E5E7EB" />
        <PolarAngleAxis
          dataKey={categoryKey}
          tick={{ fontSize: 11, fill: "#6B7280" }}
        />
        <PolarRadiusAxis
          domain={[0, maxValue]}
          tick={{ fontSize: 10, fill: "#9CA3AF" }}
          axisLine={false}
          tickCount={5}
        />
        <Tooltip {...TOOLTIP_PROPS} cursor={false} formatter={tooltipValue(valueFormatter)} />
        {legend && <Legend {...LEGEND_PROPS} />}
        {series.map((s, i) => {
          const color = s.color ?? seriesColor(i);
          return (
            <Radar
              key={s.dataKey}
              dataKey={s.dataKey}
              name={s.name}
              stroke={color}
              strokeWidth={2}
              fill={color}
              // Low opacity so overlapping profiles stay individually readable
              // at the compare screen's six-series maximum.
              fillOpacity={series.length > 1 ? 0.12 : 0.24}
            />
          );
        })}
      </RadarChart>
    </ResponsiveContainer>
  );
}
