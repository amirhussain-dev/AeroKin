import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, Leaf, ShieldCheck, Wind } from 'lucide-react';
import type { RecommendationItem } from '../../shared/types.ts';

interface RecommendationCardProps {
  item: RecommendationItem;
  selected: boolean;
  onToggle: (id: string) => void;
}

export function RecommendationCard({ item, selected, onToggle }: RecommendationCardProps) {
  const [expanded, setExpanded] = useState(false);

  const costBadgeColor =
    item.costTier === 'Free'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : item.costTier === 'Low-cost ($5–$40)'
        ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
        : 'bg-violet-500/15 text-violet-300 border-violet-500/30';

  return (
    <article
      className={`rounded-2xl border p-4 transition ${
        selected
          ? 'border-teal-500/60 bg-slate-900/90 shadow-lg shadow-teal-950/30'
          : 'border-slate-800/90 bg-slate-900/55 hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {item.timeSlot && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                <Clock className="h-3 w-3" />
                {item.timeSlot}
              </span>
            )}
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${costBadgeColor}`}>
              {item.costTier}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-[11px] text-slate-300">
              {item.effortLevel}
            </span>
          </div>

          <h3 className="text-base font-semibold text-slate-100 leading-snug">{item.title}</h3>
          <p className="text-sm text-slate-300 leading-relaxed">{item.summary}</p>
        </div>

        <button
          type="button"
          onClick={() => onToggle(item.id)}
          aria-pressed={selected}
          title={selected ? 'Included in impact simulation' : 'Add to impact simulation'}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
            selected
              ? 'border-teal-400/70 bg-teal-500/20 text-teal-200'
              : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:border-slate-500'
          }`}
        >
          {selected ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-teal-400" />
              Active
            </>
          ) : (
            <>
              <Circle className="h-4 w-4 text-slate-400" />
              Adopt
            </>
          )}
        </button>
      </div>

      {/* Tailored Context */}
      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
        <span className="font-semibold text-teal-300">Why this fits your home: </span>
        {item.tailoredWhy}
      </div>

      {/* Direct Impact Box */}
      <div className="mt-3 rounded-xl border border-teal-900/50 bg-teal-950/25 p-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {item.directImpact.indoorPm25ReductionPct > 0 && (
            <span className="inline-flex items-center gap-1 font-mono-num font-semibold text-teal-300">
              <Wind className="h-3.5 w-3.5" />
              −{item.directImpact.indoorPm25ReductionPct}% Indoor PM2.5
            </span>
          )}
          {item.directImpact.personalExposureSavedUgPerDay > 0 && (
            <span className="inline-flex items-center gap-1 font-mono-num font-semibold text-sky-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              −{item.directImpact.personalExposureSavedUgPerDay} µg/day Inhaled
            </span>
          )}
          {(item.directImpact.pm25EmissionsPreventedGramsPerDay > 0 ||
            item.directImpact.co2eSavedKgPerMonth > 0) && (
            <span className="inline-flex items-center gap-1 font-mono-num font-semibold text-emerald-300">
              <Leaf className="h-3.5 w-3.5" />
              {item.directImpact.pm25EmissionsPreventedGramsPerDay > 0
                ? `−${item.directImpact.pm25EmissionsPreventedGramsPerDay}g PM2.5/day`
                : ''}
              {item.directImpact.pm25EmissionsPreventedGramsPerDay > 0 &&
              item.directImpact.co2eSavedKgPerMonth > 0
                ? ' · '
                : ''}
              {item.directImpact.co2eSavedKgPerMonth > 0
                ? `−${item.directImpact.co2eSavedKgPerMonth}kg CO₂e/mo`
                : ''}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
          <span className="font-semibold text-slate-200">Direct Impact: </span>
          {item.directImpact.explanation}
        </p>
      </div>

      {/* Expandable Action Steps */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-teal-300 transition cursor-pointer"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? 'Hide step-by-step guide' : `Show ${item.howToSteps.length} actionable steps`}
        </button>

        {expanded && (
          <ol className="mt-2 space-y-1.5 pl-4 list-decimal text-xs text-slate-300">
            {item.howToSteps.map((step, idx) => (
              <li key={idx} className="leading-relaxed">
                {step}
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}
