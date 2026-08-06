// ============================================================================
// Pie / doughnut wrapper — score-band and approval-status breakdowns.
//
// Doughnut by default with a centre total, because these charts always answer
// "how do N things split" and the N is worth stating outright rather than making
// the reader add up the legend.
//
// Zero-count slices are dropped before rendering: recharts still draws a label
// and a legend entry for a 0% slice, which produces overlapping text on a
// distribution where only two of five bands are populated.
// ============================================================================

import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { LEGEND_PROPS, TOOLTIP_PROPS, seriesColor } from "./chartTheme";

export type PieDatum = {
  name: string;
  value: number;
  /** Explicit colour — used for fixed vocabularies (bands, statuses). */
  color?: string;
};

type AppPieChartProps = {
  data: PieDatum[];
  height?: number;
  /** 0 renders a full pie. */
  innerRadius?: number;
  showLegend?: boolean;
  /** Label under the centre total. Omitted on a full pie. */
  centerLabel?: string;
  valueFormatter?: (value: number) => string;
};

export default function AppPieChart({
  data,
  height = 280,
  innerRadius = 64,
  showLegend = true,
  centerLabel,
  valueFormatter,
}: AppPieChartProps) {
  const slices = useMemo(() => data.filter((d) => d.value > 0), [data]);
  const total = useMemo(() => slices.reduce((sum, d) => sum + d.value, 0), [slices]);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip
            {...TOOLTIP_PROPS}
            cursor={false}
            formatter={(value: unknown, name: unknown) => [
              valueFormatter ? valueFormatter(Number(value)) : String(value ?? "—"),
              String(name ?? ""),
            ]}
          />
          {showLegend && <Legend {...LEGEND_PROPS} />}
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={innerRadius}
            outerRadius="80%"
            paddingAngle={slices.length > 1 ? 2 : 0}
            stroke="none"
          >
            {slices.map((slice, i) => (
              <Cell key={slice.name} fill={slice.color ?? seriesColor(i)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {innerRadius > 0 && (
        <div
          // Offset upward by half the legend strip so the total sits in the
          // doughnut hole rather than below it.
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          style={{ paddingBottom: showLegend ? 32 : 0 }}
        >
          <span className="text-2xl font-semibold text-gray-900">{total}</span>
          {centerLabel && (
            <span className="text-xs uppercase tracking-wide text-gray-400">{centerLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
