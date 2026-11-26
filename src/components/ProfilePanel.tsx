import { MapPin, RefreshCw, ShieldAlert, SlidersHorizontal, Sparkles } from 'lucide-react';
import { LOCATION_PRESETS } from '../../shared/smogEngine.ts';
import type {
  BudgetTier,
  CommuteMode,
  CookingSource,
  HeatingSource,
  HouseholdProfile,
  HousingType,
  Sensitivity,
} from '../../shared/types.ts';

interface ProfilePanelProps {
  profile: HouseholdProfile;
  useLiveFeed: boolean;
  isGenerating: boolean;
  onChange: (next: HouseholdProfile) => void;
  onToggleLiveFeed: (next: boolean) => void;
  onRegenerate: () => void;
}

const SENSITIVITY_OPTIONS: Array<{ id: Sensitivity; label: string }> = [
  { id: 'infants', label: 'Infants / Toddlers' },
  { id: 'school_kids', label: 'School Kids' },
  { id: 'elderly', label: 'Seniors (65+)' },
  { id: 'asthma_copd', label: 'Asthma / COPD' },
  { id: 'outdoor_workers', label: 'Outdoor Commuter' },
  { id: 'pets', label: 'Pets' },
];

export function ProfilePanel({
  profile,
  useLiveFeed,
  isGenerating,
  onChange,
  onToggleLiveFeed,
  onRegenerate,
}: ProfilePanelProps) {
  const toggleSensitivity = (id: Sensitivity) => {
    const exists = profile.sensitivities.includes(id);
    const next = exists
      ? profile.sensitivities.filter((s) => s !== id)
      : [...profile.sensitivities, id];
    onChange({ ...profile, sensitivities: next });
  };

  return (
    <aside className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 backdrop-blur-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-teal-400" />
          <h2 className="text-sm font-semibold text-slate-100">Location & Household Profile</h2>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-teal-400 disabled:opacity-50 cursor-pointer"
        >
          {isGenerating ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isGenerating ? 'Tailoring...' : 'Tailor Plan'}
        </button>
      </div>

      {/* City & PM2.5 */}
      <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
        <label className="block text-xs font-medium text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-amber-400" />
            Winter Smog Region / City
          </span>
        </label>
        <select
          value={profile.locationId}
          onChange={(e) => onChange({ ...profile, locationId: e.target.value })}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 focus:border-teal-400 focus:outline-none"
        >
          {LOCATION_PRESETS.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name} (Typical winter PM2.5: {loc.pm25} µg/m³)
            </option>
          ))}
          <option value="custom">Custom City / Town...</option>
        </select>

        {profile.locationId === 'custom' && (
          <input
            type="text"
            placeholder="Enter city name (e.g., Sarajevo, Almaty, Beijing)"
            value={profile.customCity}
            onChange={(e) => onChange({ ...profile, customCity: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
          />
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              PM2.5 Override (µg/m³)
            </label>
            <input
              type="number"
              min={5}
              max={600}
              placeholder="Auto"
              value={profile.pm25Override ?? ''}
              onChange={(e) =>
                onChange({
                  ...profile,
                  pm25Override: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-mono-num text-slate-100 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none"
            />
          </div>
          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-200 cursor-pointer hover:border-teal-500/60">
              <input
                type="checkbox"
                checked={useLiveFeed}
                onChange={(e) => onToggleLiveFeed(e.target.checked)}
                className="accent-teal-400"
              />
              Live Open-Meteo AQI
            </label>
          </div>
        </div>
      </div>

      {/* Household & Sensitivities */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-300 inline-flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
            Vulnerabilities & Size
          </span>
          <span className="font-mono-num text-slate-400">{profile.householdSize} people</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={profile.householdSize}
          onChange={(e) => onChange({ ...profile, householdSize: Number(e.target.value) })}
          className="w-full accent-teal-400"
        />
        <div className="flex flex-wrap gap-1.5">
          {SENSITIVITY_OPTIONS.map((opt) => {
            const active = profile.sensitivities.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleSensitivity(opt.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                  active
                    ? 'bg-teal-500/20 text-teal-200 border border-teal-400/60'
                    : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Home & Fuels */}
      <div className="grid grid-cols-1 gap-2.5 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Home Envelope</label>
            <select
              value={profile.housingType}
              onChange={(e) =>
                onChange({ ...profile, housingType: e.target.value as HousingType })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:border-teal-400 focus:outline-none"
            >
              <option value="apartment_sealed">Sealed Apartment</option>
              <option value="apartment_drafty">Drafty Apartment</option>
              <option value="independent_house">Independent House</option>
              <option value="multi_gen">Multi-Gen Home</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Main Room (m²)</label>
            <input
              type="number"
              min={10}
              max={200}
              value={profile.roomAreaSqm}
              onChange={(e) =>
                onChange({ ...profile, roomAreaSqm: Math.max(10, Number(e.target.value) || 30) })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-mono-num text-slate-100 focus:border-teal-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Winter Heating</label>
            <select
              value={profile.heatingSource}
              onChange={(e) =>
                onChange({ ...profile, heatingSource: e.target.value as HeatingSource })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:border-teal-400 focus:outline-none"
            >
              <option value="electric_heat_pump">Electric / Heat Pump</option>
              <option value="gas_boiler">Gas Radiator / Boiler</option>
              <option value="wood_coal_stove">Wood / Coal Stove</option>
              <option value="portable_kerosene">Kerosene / Portable</option>
              <option value="unheated_blankets">Unheated / Layering</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Cooking Fuel</label>
            <select
              value={profile.cookingSource}
              onChange={(e) =>
                onChange({ ...profile, cookingSource: e.target.value as CookingSource })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:border-teal-400 focus:outline-none"
            >
              <option value="induction_electric">Induction / Electric</option>
              <option value="lpg_piped_gas">LPG / Piped Gas</option>
              <option value="biomass_solid">Wood / Biomass</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Daily Commute</label>
            <select
              value={profile.commuteMode}
              onChange={(e) =>
                onChange({ ...profile, commuteMode: e.target.value as CommuteMode })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:border-teal-400 focus:outline-none"
            >
              <option value="car_solo">Solo Car / SUV</option>
              <option value="two_wheeler">Two-Wheeler</option>
              <option value="carpool">Carpool</option>
              <option value="public_transit">Metro / Bus</option>
              <option value="walk_cycle">Walk / Cycle</option>
              <option value="remote_hybrid">Work From Home</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Round Trip (km)</label>
            <input
              type="number"
              min={0}
              max={150}
              value={profile.commuteKmRoundTrip}
              onChange={(e) =>
                onChange({
                  ...profile,
                  commuteKmRoundTrip: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-mono-num text-slate-100 focus:border-teal-400 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] text-slate-400 mb-1">Budget Focus</label>
          <select
            value={profile.budgetTier}
            onChange={(e) => onChange({ ...profile, budgetTier: e.target.value as BudgetTier })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:border-teal-400 focus:outline-none"
          >
            <option value="zero_cost">Zero-Cost Habits First</option>
            <option value="low_budget">Low-Cost DIY ($5–$40)</option>
            <option value="full_upgrade">Full Clean-Air Upgrade</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={profile.hasHepaPurifier}
              onChange={(e) => onChange({ ...profile, hasHepaPurifier: e.target.checked })}
              className="accent-teal-400"
            />
            Have HEPA Purifier
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={profile.hasN95Masks}
              onChange={(e) => onChange({ ...profile, hasN95Masks: e.target.checked })}
              className="accent-teal-400"
            />
            Have N95 / FFP2 Masks
          </label>
        </div>
      </div>
    </aside>
  );
}
