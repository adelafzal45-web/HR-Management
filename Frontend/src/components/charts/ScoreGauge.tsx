const TAU = Math.PI * 2;

/** Polar to cartesian, starting at 12 o'clock and running clockwise. */
function pointOnCircle(cx: number, cy: number, radius: number, fraction: number) {
 const angle = fraction * TAU - Math.PI / 2;
 return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

/**
 * Fraction of the full circle the gauge sweeps, and where it starts.
 *
 * 270° leaves a gap at the bottom for the opening, so the two ends read as a
 * scale with a start and a finish rather than a doughnut missing a slice. The
 * sweep is centred on 12 o'clock: half of it either side.
 */
const SWEEP = 0.75;
const START = -SWEEP / 2;

/** Bands are read as "is this person fine, watch, or a problem". */
const GOOD = "rgb(52 211 153)";
const MID = "rgb(251 191 36)";
const LOW = "rgb(248 113 113)";

function bandColor(value: number): string {
 if (value >= 75) return GOOD;
 if (value >= 50) return MID;
 return LOW;
}

type ScoreGaugeProps = {
 /** Percentage, 0–100. Clamped; a non-finite value renders as "—". */
 value: number;
 size?: number;
 /** Caption under the figure, e.g. "average score". */
 label?: string;
 ariaLabel?: string;
};

/**
 * Single-value gauge in plain SVG, for one employee's headline score.
 *
 * Built on the same arc maths as `DoughnutChart` rather than a second geometry
 * helper: a grey track arc with a coloured value arc stroked over it, so the
 * ring thickness stays a single attribute and there are no seams where the two
 * meet. Colour carries the band (green / amber / red) so the figure does not
 * have to be read to know whether it is good news — but the number is always
 * printed too, because colour alone is not an accessible signal.
 */
export default function ScoreGauge({
 value,
 size = 200,
 label,
 ariaLabel,
}: ScoreGaugeProps) {
 const valid = Number.isFinite(value);
 const pct = valid ? Math.min(100, Math.max(0, value)) : 0;

 const cx = size / 2;
 const cy = size / 2;
 const strokeWidth = (size / 2) * 0.18;
 const radius = size / 2 - strokeWidth / 2 - 2;

 const arc = (fromFraction: number, toFraction: number) => {
  const from = pointOnCircle(cx, cy, radius, fromFraction);
  const to = pointOnCircle(cx, cy, radius, toFraction);
  const largeArc = toFraction - fromFraction > 0.5 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArc} 1 ${to.x} ${to.y}`;
 };

 const end = START + SWEEP * (pct / 100);
 const colour = bandColor(pct);
 const figure = valid ? `${Math.round(pct)}%` : "—";

 return (
  <div className="flex flex-col items-center">
   <svg
    viewBox={`0 0 ${size} ${size}`}
    preserveAspectRatio="xMidYMid meet"
    style={{ width: size, height: size, maxWidth: "100%" }}
    role="img"
    aria-label={
     ariaLabel ??
     (valid
      ? `Gauge showing ${Math.round(pct)} percent${label ? ` ${label}` : ""}.`
      : `Gauge with no score recorded${label ? ` for ${label}` : ""}.`)
    }
   >
    <path
     d={arc(START, START + SWEEP)}
     fill="none"
     stroke="rgb(243 244 246)"
     strokeWidth={strokeWidth}
     strokeLinecap="round"
    />

    {/*
      * Zero would otherwise draw a round cap floating at the start of the
      * track, which reads as a small non-zero score.
      */}
    {valid && pct > 0 && (
     <path
      d={arc(START, end)}
      fill="none"
      stroke={colour}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
     >
      <title>{`${Math.round(pct)}%${label ? ` ${label}` : ""}`}</title>
     </path>
    )}

    <text
     x={cx}
     y={label ? cy + 2 : cy + 9}
     textAnchor="middle"
     fontSize={size * 0.24}
     fontWeight={600}
     fill="rgb(17 24 39)"
    >
     {figure}
    </text>
    {label && (
     <text
      x={cx}
      y={cy + size * 0.14}
      textAnchor="middle"
      fontSize={size * 0.062}
      fill="rgb(107 114 128)"
     >
      {label}
     </text>
    )}
   </svg>
  </div>
 );
}
