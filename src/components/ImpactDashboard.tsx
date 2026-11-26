import { Activity, Users, Wind, Flame } from 'lucide-react';
import type { ImpactSimulationResult } from '../../shared/types.ts';

interface ImpactDashboardProps {
  simulation: ImpactSimulationResult;
  selectedCount: number;
  totalCount: number;
  communityFamilies: number;
  onCommunityFamiliesChange: (count: number) => void;
}

export function ImpactDashboard({
  simulation,
  selectedCount,
  totalCount,
  communityFamilies,
  onCommunityFamiliesChange,
}: ImpactDashboardProps) {
  const pmRatioWidth = Math.min(
    100,
    Math.max(8, Math.round((simulation.projectedIndoorPm25 / Math.max(1, simulation.baselineIndoorPm25)) * 100))
  );

  return (
    <section className="rounded-2xl border border-slate-800/90 bg-gradient-to-br from-slate-900/95 via-slate-900/80 to-teal-950/35 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 inline-flex items-center gap-2">
            <Activity className="h-4 w-4 text-teal-400" />
            Direct Choice-to-Impact Simulator
          </h2>
          <p className="text-xs text-slate-400">
            Toggle routines & swaps below to see real-time indoor exposure and neighborhood emission math ({selectedCount}/{totalCount} adopted).
          </p>
        </div>
        <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-xs font-mono-num font-semibold text-teal-300">
          −{simulation.indoorDropPct}% Indoor PM2.5
        </span>
      </div>

      {/* 3 Primary Impact Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Indoor Exposure */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/65 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Wind className="h-3.5 w-3.5 text-teal-400" />
              Indoor Air Concentration
            </span>
            <span className="font-mono-num text-[11px] text-slate-500">
              WHO 24h: 15 µg/m³
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono-num text-teal-300">
              {simulation.projectedIndoorPm25}
            </span>
            <span className="text-xs text-slate-400">µg/m³</span>
            <span className="text-xs font-mono-num text-slate-500 line-through ml-1">
              {simulation.baselineIndoorPm25}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-300"
              style={{ width: `${pmRatioWidth}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            WHO limit ratio drops from{' '}
            <span className="font-mono-num text-amber-300">{simulation.whoGuidelineRatioBefore}×</span> to{' '}
            <span className="font-mono-num text-teal-300">{simulation.whoGuidelineRatioAfter}×</span>.
          </p>
        </div>

        {/* Personal Lung Dose */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/65 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-sky-400" />
              Personal Exposure Saved
            </span>
            <span className="font-mono-num text-[11px] text-slate-500">per person</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono-num text-sky-300">
              {simulation.cigaretteEquivalentsAvoidedPerWeek}
            </span>
            <span className="text-xs text-slate-300">cig-eq avoided / wk</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Daily inhaled PM2.5 drops from{' '}
            <span className="font-mono-num text-slate-200">{simulation.baselineDailyInhaledUg} µg</span> to{' '}
            <span className="font-mono-num text-sky-300">{simulation.projectedDailyInhaledUg} µg</span>{' '}
            (Berkeley Earth 22 µg/m³ ≈ 1 cig/day model).
          </p>
        </div>

        {/* Community Ripple */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/65 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              Community Ripple ({communityFamilies} homes)
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <div>
              <span className="text-xl font-bold font-mono-num text-emerald-300">
                {simulation.communityRipplePm25GramsPerMonth >= 1000
                  ? `${(simulation.communityRipplePm25GramsPerMonth / 1000).toFixed(1)} kg`
                  : `${simulation.communityRipplePm25GramsPerMonth} g`}
              </span>
              <span className="block text-[10px] text-slate-400">PM2.5 prevented / mo</span>
            </div>
            <div className="border-l border-slate-800 pl-3">
              <span className="text-xl font-bold font-mono-num text-emerald-200">
                {simulation.communityRippleCo2eKgPerMonth >= 1000
                  ? `${(simulation.communityRippleCo2eKgPerMonth / 1000).toFixed(1)} t`
                  : `${simulation.communityRippleCo2eKgPerMonth} kg`}
              </span>
              <span className="block text-[10px] text-slate-400">CO₂e avoided / mo</span>
            </div>
          </div>
          <input
            type="range"
            min={1}
            max={500}
            step={5}
            value={communityFamilies}
            onChange={(e) => onCommunityFamiliesChange(Number(e.target.value))}
            aria-label="Community households adopting plan"
            className="w-full accent-emerald-400"
          />
        </div>
      </div>
    </section>
  );
}
