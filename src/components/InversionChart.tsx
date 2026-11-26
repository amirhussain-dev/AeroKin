import type { HourlySmogPoint } from '../../shared/types.ts';

interface InversionChartProps {
  points: HourlySmogPoint[];
  bestWindowLabel: string;
  baselineIndoorPm25: number;
}

export function InversionChart({
  points,
  bestWindowLabel,
  baselineIndoorPm25,
}: InversionChartProps) {
  if (points.length === 0) return null;

  const width = 560;
  const height = 190;
  const padL = 42;
  const padR = 16;
  const padT = 22;
  const padB = 32;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const maxPm = Math.max(...points.map((p) => p.pm25), baselineIndoorPm25, 45) * 1.12;
  const minPm = 0;

  const xFor = (idx: number) => padL + (idx / Math.max(1, points.length - 1)) * chartW;
  const yFor = (val: number) => padT + chartH - ((val - minPm) / (maxPm - minPm)) * chartH;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.pm25).toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${xFor(points.length - 1).toFixed(1)} ${(padT + chartH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(padT + chartH).toFixed(1)} Z`;

  const bestIdx = points.reduce(
    (best, p, i) => (p.pm25 < points[best].pm25 ? i : best),
    0
  );
  const indoorY = yFor(baselineIndoorPm25);

  return (
    <div className="rounded-xl border border-slate-800/90 bg-slate-900/70 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            24-Hour Winter Thermal Inversion Curve
          </h3>
          <p className="text-xs text-slate-400">
            Best fresh-air purge window: <span className="font-medium text-teal-300">{bestWindowLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Outdoor PM2.5
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-teal-400" />
            Est. Indoor ({baselineIndoorPm25} µg/m³)
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="24-hour winter thermal inversion PM2.5 curve"
      >
        <defs>
          <linearGradient id="smogArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Highlight best ventilation window */}
        <rect
          x={Math.max(padL, xFor(bestIdx) - chartW / 14)}
          y={padT}
          width={chartW / 7}
          height={chartH}
          rx={6}
          fill="rgba(20, 184, 166, 0.14)"
          stroke="rgba(45, 212, 191, 0.35)"
          strokeDasharray="3 3"
        />

        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((frac) => {
          const val = Math.round(maxPm * frac);
          const y = yFor(val);
          return (
            <g key={frac}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="rgba(148, 163, 184, 0.12)"
                strokeWidth="1"
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-500 text-[10px] font-mono-num"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Baseline indoor line */}
        <line
          x1={padL}
          y1={indoorY}
          x2={width - padR}
          y2={indoorY}
          stroke="#2dd4bf"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />

        {/* Area & Line */}
        <path d={areaPath} fill="url(#smogArea)" />
        <path
          d={linePath}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points & X Labels */}
        {points.map((p, i) => {
          const cx = xFor(i);
          const cy = yFor(p.pm25);
          const isBest = i === bestIdx;
          return (
            <g key={p.hour}>
              <circle
                cx={cx}
                cy={cy}
                r={isBest ? 5 : 3.5}
                fill={isBest ? '#2dd4bf' : p.inversionActive ? '#f97316' : '#fbbf24'}
                stroke="#0f172a"
                strokeWidth="1.5"
              />
              <text
                x={cx}
                y={cy - 8}
                textAnchor="middle"
                className={`text-[9.5px] font-mono-num ${isBest ? 'fill-teal-300 font-semibold' : 'fill-slate-300'}`}
              >
                {p.pm25}
              </text>
              <text
                x={cx}
                y={height - 10}
                textAnchor="middle"
                className="fill-slate-400 text-[10px]"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
