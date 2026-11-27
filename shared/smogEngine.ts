import type {
  AqiCategoryInfo,
  AssistantPlan,
  HouseholdProfile,
  HourlySmogPoint,
  ImpactSimulationResult,
  LocationProfile,
  RecommendationItem,
} from './types.ts';

/**
 * Converts PM2.5 concentration (µg/m³) to US EPA AQI using standard 2024 breakpoints.
 */
export function pm25ToUsAqi(pm25: number): number {
  const c = Math.max(0, Math.round(pm25 * 10) / 10);
  const breakpoints: Array<[number, number, number, number]> = [
    [0.0, 9.0, 0, 50],
    [9.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 125.4, 151, 200],
    [125.5, 225.4, 201, 300],
    [225.5, 325.4, 301, 400],
    [325.5, 500.4, 401, 500],
  ];

  for (const [cLow, cHigh, iLow, iHigh] of breakpoints) {
    if (c <= cHigh) {
      return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (c - cLow) + iLow);
    }
  }
  return Math.min(999, Math.round(500 + (c - 500.4) * 0.8));
}

export function classifyAqi(aqi: number): AqiCategoryInfo {
  if (aqi <= 50) {
    return {
      label: 'Good',
      tone: 'good',
      advice: 'Air quality is clean; open windows freely and prioritize low-emission habits.',
    };
  }
  if (aqi <= 100) {
    return {
      label: 'Moderate',
      tone: 'moderate',
      advice: 'Sensitive family members should reduce prolonged roadside exertion.',
    };
  }
  if (aqi <= 150) {
    return {
      label: 'Unhealthy for Sensitive Groups',
      tone: 'sensitive',
      advice: 'Children, seniors, and asthma/COPD members should shift workouts indoors.',
    };
  }
  if (aqi <= 200) {
    return {
      label: 'Unhealthy',
      tone: 'unhealthy',
      advice: 'Keep windows sealed during inversion peaks and run HEPA or DIY filtration.',
    };
  }
  if (aqi <= 300) {
    return {
      label: 'Very Unhealthy',
      tone: 'very_unhealthy',
      advice: 'Severe winter smog alert: wear N95/FFP2 masks outdoors and avoid morning peak exposure.',
    };
  }
  return {
    label: 'Hazardous',
    tone: 'hazardous',
    advice: 'Emergency clean-air shelter mode: seal drafts, run continuous filtration, eliminate indoor combustion.',
  };
}

/**
 * Generates a realistic 24-hour winter thermal inversion PM2.5 curve around a daily mean PM2.5.
 * Winter boundary-layer inversions trap emissions between 6-10 AM and 7 PM-midnight,
 * while solar heating breaks the inversion briefly around 1-4 PM.
 */
export function buildWinterHourlyCurve(basePm25: number, inversionRisk: LocationProfile['inversionRisk']): HourlySmogPoint[] {
  const amp =
    inversionRisk === 'Severe' ? 0.38 : inversionRisk === 'High' ? 0.30 : inversionRisk === 'Moderate' ? 0.22 : 0.14;

  // Multipliers for 8 3-hour windows
  const slots: Array<{ hour: number; label: string; factor: number; inversionActive: boolean }> = [
    { hour: 0, label: '12 AM', factor: 1 + amp * 0.85, inversionActive: true },
    { hour: 3, label: '3 AM', factor: 1 + amp * 0.65, inversionActive: true },
    { hour: 6, label: '6 AM', factor: 1 + amp * 1.05, inversionActive: true },
    { hour: 9, label: '9 AM', factor: 1 + amp * 0.7, inversionActive: true },
    { hour: 12, label: '12 PM', factor: 1 - amp * 0.55, inversionActive: false },
    { hour: 15, label: '3 PM', factor: 1 - amp * 0.72, inversionActive: false },
    { hour: 18, label: '6 PM', factor: 1 + amp * 0.55, inversionActive: true },
    { hour: 21, label: '9 PM', factor: 1 + amp * 1.1, inversionActive: true },
  ];

  return slots.map((s) => ({
    hour: s.hour,
    label: s.label,
    pm25: Math.max(8, Math.round(basePm25 * s.factor)),
    inversionActive: s.inversionActive,
  }));
}

export const LOCATION_PRESETS: LocationProfile[] = [
  {
    id: 'delhi',
    name: 'Delhi-NCR',
    regionLabel: 'Indo-Gangetic Plain · Severe Winter Smog',
    lat: 28.6139,
    lon: 77.209,
    pm25: 235,
    pm10: 365,
    aqi: pm25ToUsAqi(235),
    tempC: 11,
    windKmh: 4,
    humidity: 76,
    inversionRisk: 'Severe',
    primarySources: [
      'Calm boundary-layer inversion trapping',
      'Diesel & two-wheeler traffic',
      'Biomass & open waste/leaf burning',
      'Road & construction dust',
    ],
    seasonalNote:
      'Low wind speeds (<5 km/h) and cool nights trap ground-level PM2.5 from evening until late morning; brief dispersion typically occurs 1:00–4:00 PM.',
    hourlyPattern: buildWinterHourlyCurve(235, 'Severe'),
  },
  {
    id: 'lahore',
    name: 'Lahore',
    regionLabel: 'Punjab Basin · Dense Winter Haze',
    lat: 31.5204,
    lon: 74.3587,
    pm25: 260,
    pm10: 390,
    aqi: pm25ToUsAqi(260),
    tempC: 12,
    windKmh: 3,
    humidity: 81,
    inversionRisk: 'Severe',
    primarySources: [
      'Dense fog + particulate smog formation',
      'Two-stroke & diesel urban commute',
      'Industrial & brick-kiln plumes',
      'Solid fuel & trash burning',
    ],
    seasonalNote:
      'High nocturnal humidity causes hygroscopic particle swelling, amplifying visibility loss and respiratory irritation between dusk and 10 AM.',
    hourlyPattern: buildWinterHourlyCurve(260, 'Severe'),
  },
  {
    id: 'krakow',
    name: 'Kraków',
    regionLabel: 'Vistula Valley · Winter Heating Smog',
    lat: 50.0647,
    lon: 19.945,
    pm25: 88,
    pm10: 122,
    aqi: pm25ToUsAqi(88),
    tempC: -1,
    windKmh: 6,
    humidity: 78,
    inversionRisk: 'High',
    primarySources: [
      'Peri-urban solid-fuel & wood heating',
      'Valley cold-air pooling',
      'Cold-start winter vehicle exhaust',
    ],
    seasonalNote:
      'Sub-zero valley inversions concentrate residential wood/coal smoke after 5 PM. Draft-sealing plus switching away from solid fuel has huge neighborhood impact.',
    hourlyPattern: buildWinterHourlyCurve(88, 'High'),
  },
  {
    id: 'salt-lake',
    name: 'Salt Lake Valley',
    regionLabel: 'Wasatch Basin · Cold-Air Pool Inversion',
    lat: 40.7608,
    lon: -111.891,
    pm25: 58,
    pm10: 76,
    aqi: pm25ToUsAqi(58),
    tempC: -3,
    windKmh: 4,
    humidity: 72,
    inversionRisk: 'High',
    primarySources: [
      'Multi-day mountain basin cold-air pool',
      'Vehicle cold-start NOx → ammonium nitrate PM2.5',
      'Residential wood-burning fireplaces',
    ],
    seasonalNote:
      'Snow cover reflects sunlight, locking cold air under warm air aloft. Cutting cold-start car trips and skipping wood fireplaces prevents secondary PM2.5 spikes.',
    hourlyPattern: buildWinterHourlyCurve(58, 'High'),
  },
  {
    id: 'milan',
    name: 'Milan (Po Valley)',
    regionLabel: 'Alpine Basin · Stagnant Winter Air',
    lat: 45.4642,
    lon: 9.19,
    pm25: 66,
    pm10: 94,
    aqi: pm25ToUsAqi(66),
    tempC: 4,
    windKmh: 5,
    humidity: 80,
    inversionRisk: 'High',
    primarySources: [
      'Po Valley high-pressure stagnation',
      'Older diesel commutes & urban congestion',
      'Biomass & boiler heating emissions',
    ],
    seasonalNote:
      'The Alps block winter winds, creating multi-day stagnation events where indoor air quickly matches outdoor PM2.5 unless windows are timed carefully.',
    hourlyPattern: buildWinterHourlyCurve(66, 'High'),
  },
  {
    id: 'london',
    name: 'London',
    regionLabel: 'Thames Basin · Cold Anticyclone Haze',
    lat: 51.5072,
    lon: -0.1276,
    pm25: 38,
    pm10: 54,
    aqi: pm25ToUsAqi(38),
    tempC: 5,
    windKmh: 9,
    humidity: 79,
    inversionRisk: 'Moderate',
    primarySources: [
      'Domestic wood-burning stoves (evening spike)',
      'Road traffic & brake/tire wear',
      'Calm winter anticyclone stagnation',
    ],
    seasonalNote:
      'Domestic wood stoves now account for a major share of winter urban PM2.5 peaks between 6 PM and 11 PM.',
    hourlyPattern: buildWinterHourlyCurve(38, 'Moderate'),
  },
];

export const DEFAULT_PROFILE: HouseholdProfile = {
  locationId: 'delhi',
  customCity: '',
  pm25Override: null,
  householdSize: 4,
  sensitivities: ['school_kids', 'elderly'],
  housingType: 'apartment_drafty',
  roomAreaSqm: 35,
  heatingSource: 'electric_heat_pump',
  cookingSource: 'lpg_piped_gas',
  commuteMode: 'car_solo',
  commuteKmRoundTrip: 18,
  hasHepaPurifier: false,
  hasN95Masks: true,
  budgetTier: 'low_budget',
};

export function resolveOutdoorPm25(profile: HouseholdProfile, baseLocation?: LocationProfile): number {
  const base = baseLocation ?? LOCATION_PRESETS.find((l) => l.id === profile.locationId) ?? LOCATION_PRESETS[0];
  return profile.pm25Override !== null && Number.isFinite(profile.pm25Override)
    ? Math.max(5, Math.min(600, Math.round(profile.pm25Override)))
    : base.pm25;
}

export function resolveLocation(profile: HouseholdProfile): LocationProfile {
  const base = LOCATION_PRESETS.find((l) => l.id === profile.locationId) ?? LOCATION_PRESETS[0];
  const effectivePm25 = resolveOutdoorPm25(profile, base);

  const effectiveInversion: LocationProfile['inversionRisk'] =
    effectivePm25 >= 150 ? 'Severe' : effectivePm25 >= 65 ? 'High' : effectivePm25 >= 35 ? 'Moderate' : 'Low';

  const ratio = effectivePm25 / Math.max(1, base.pm25);

  return {
    ...base,
    name: profile.locationId === 'custom' && profile.customCity.trim() ? profile.customCity.trim() : base.name,
    regionLabel:
      profile.locationId === 'custom' ? 'Custom Urban Microclimate · Winter Smog Profile' : base.regionLabel,
    pm25: effectivePm25,
    pm10: Math.round(base.pm10 * ratio),
    aqi: pm25ToUsAqi(effectivePm25),
    inversionRisk: effectiveInversion,
    hourlyPattern: buildWinterHourlyCurve(effectivePm25, effectiveInversion),
  };
}

/**
 * Estimates baseline indoor PM2.5 (µg/m³) using an infiltration + indoor-source mass balance approximation.
 * Typical winter infiltration factor (Finf): sealed ~0.42, drafty ~0.68, independent ~0.60, multi-gen ~0.64.
 */
export function calculateBaselineIndoorPm25(profile: HouseholdProfile, location: LocationProfile): number {
  const finfMap: Record<HouseholdProfile['housingType'], number> = {
    apartment_sealed: 0.42,
    apartment_drafty: 0.68,
    independent_house: 0.60,
    multi_gen: 0.64,
  };

  let finf = finfMap[profile.housingType];
  if (profile.hasHepaPurifier) {
    finf *= 0.58; // Running one room HEPA unit cuts steady-state concentration ~42%
  }

  let indoorSourceAdd = 0;
  if (profile.cookingSource === 'lpg_piped_gas') indoorSourceAdd += 12;
  if (profile.cookingSource === 'biomass_solid') indoorSourceAdd += 45;
  if (profile.cookingSource === 'induction_electric') indoorSourceAdd += 4;

  if (profile.heatingSource === 'wood_coal_stove') indoorSourceAdd += 32;
  if (profile.heatingSource === 'portable_kerosene') indoorSourceAdd += 24;

  return Math.max(5, Math.round(location.pm25 * finf + indoorSourceAdd));
}

/**
 * Calculates required CADR (m³/h) for 4.8 Air Changes per Hour (ACH) assuming 2.6m ceiling height.
 */
export function calculateRequiredCadr(roomAreaSqm: number, ceilingM = 2.6, targetAch = 4.8): number {
  const volumeM3 = Math.max(10, roomAreaSqm) * ceilingM;
  return Math.round(volumeM3 * targetAch);
}

/**
 * Builds deterministic, scientifically grounded recommendations tailored to household & smog conditions.
 * Used both standalone (when no Gemini API key is configured) and as grounded context for Gemini.
 */
export function buildScientificPlan(profile: HouseholdProfile, liveLocation?: LocationProfile): AssistantPlan {
  const location = liveLocation ?? resolveLocation(profile);
  const aqiCategory = classifyAqi(location.aqi);
  const baselineIndoorPm25 = calculateBaselineIndoorPm25(profile, location);
  const requiredCadr = calculateRequiredCadr(profile.roomAreaSqm);

  // Best ventilation window from hourly curve
  const bestSlot = [...location.hourlyPattern].sort((a, b) => a.pm25 - b.pm25)[0];
  const bestWindowEndHour = (bestSlot.hour + 3) % 24;
  const formatHour = (h: number) => {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr}:00 ${suffix}`;
  };

  const hasVulnerable =
    profile.sensitivities.includes('infants') ||
    profile.sensitivities.includes('elderly') ||
    profile.sensitivities.includes('asthma_copd');
  const hasKids = profile.sensitivities.includes('school_kids') || profile.sensitivities.includes('infants');
  const isDrafty = profile.housingType === 'apartment_drafty' || profile.housingType === 'independent_house';

  const routines: RecommendationItem[] = [
    {
      id: 'routine-morning-shift',
      category: 'routine',
      timeSlot: 'Morning (6–10 AM)',
      title: 'Shift Morning Exercise & School Prep Indoors',
      summary: `Delay vigorous outdoor movement until after ${formatHour(bestSlot.hour)} when thermal inversion weakens; keep ${hasKids ? 'children’s' : 'family'} morning breathing rate low.`,
      howToSteps: [
        `Avoid 6–9 AM outdoor walks/runs when ${location.name} PM2.5 peaks near ~${Math.round(location.pm25 * 1.3)} µg/m³.`,
        hasKids
          ? 'Wait inside until the school bus or car arrives rather than standing 10 minutes beside idling tailpipes.'
          : 'Swap morning outdoor cardio for 20 min indoor mobility/yoga away from street-facing windows.',
        profile.hasN95Masks
          ? 'Fit-check well-sealing N95/FFP2 masks before stepping out (pinch nose bridge so glasses do not fog).'
          : 'Keep a breathable N95/FFP2 mask at the front door for days when AQI exceeds 150.',
      ],
      costTier: 'Free',
      tailoredWhy: `During winter inversions in ${location.name}, morning minute-ventilation increases PM2.5 lung deposition 3–5× during brisk exercise.`,
      directImpact: {
        indoorPm25ReductionPct: 4,
        personalExposureSavedUgPerDay: Math.round(location.pm25 * 0.65),
        pm25EmissionsPreventedGramsPerDay: 0,
        co2eSavedKgPerMonth: 0,
        explanation: `Avoiding 30 min of morning peak exertion at ~${Math.round(location.pm25 * 1.25)} µg/m³ cuts daily inhaled PM2.5 dose by ~${Math.round(location.pm25 * 0.65)} µg per person.`,
      },
      effortLevel: 'Quick Win',
    },
    {
      id: 'routine-midday-vent',
      category: 'routine',
      timeSlot: 'Midday Window (12–4 PM)',
      title: `Precision Cross-Ventilation (${formatHour(bestSlot.hour)}–${formatHour(bestWindowEndHour)})`,
      summary:
        bestSlot.pm25 < baselineIndoorPm25
          ? `Outdoor air dips to ~${bestSlot.pm25} µg/m³ midday—flush stale CO₂ for 15–20 minutes, then reseal.`
          : `Outdoor PM2.5 stays above indoor (${bestSlot.pm25} vs ${baselineIndoorPm25} µg/m³)—keep windows closed and rely on filtered recirculation.`,
      howToSteps: [
        bestSlot.pm25 < baselineIndoorPm25
          ? `Open opposite-side windows briefly between ${formatHour(bestSlot.hour)} and ${formatHour(bestWindowEndHour)} for 15 min to clear indoor CO₂ and cooking fumes.`
          : 'Check hyperlocal PM2.5 before opening windows; only purge air briefly right after smoky cooking.',
        'Close windows firmly before 4:30 PM when sunset re-establishes the cold surface inversion.',
        'Wipe high-touch sills and floors right after ventilation so settled coarse dust is not re-suspended.',
      ],
      costTier: 'Free',
      tailoredWhy: `Winter boundary-layer depth peaks mid-afternoon in ${location.name}, making ${formatHour(bestSlot.hour)}–${formatHour(bestWindowEndHour)} the lowest-smog window of the 24-hour cycle.`,
      directImpact: {
        indoorPm25ReductionPct: bestSlot.pm25 < baselineIndoorPm25 ? 14 : 18,
        personalExposureSavedUgPerDay: Math.round(baselineIndoorPm25 * 1.8),
        pm25EmissionsPreventedGramsPerDay: 0,
        co2eSavedKgPerMonth: 2,
        explanation: `Timing ventilation to the ${formatHour(bestSlot.hour)} inversion break prevents trapping evening ~${Math.round(location.pm25 * 1.2)} µg/m³ smog indoors overnight.`,
      },
      effortLevel: 'Quick Win',
    },
    {
      id: 'routine-evening-cook',
      category: 'routine',
      timeSlot: 'Evening Commute (5–8 PM)',
      title: 'Batch Low-Fume Meals & Lock Down Smog Entry',
      summary:
        profile.cookingSource === 'induction_electric'
          ? 'Use lids and high-smoke-point oils to prevent indoor ultrafine spikes while evening outdoor smog surges.'
          : 'Eliminate high-heat indoor frying/combustion fumes during the 6–9 PM inversion lockdown.',
      howToSteps: [
        'Use pressure cookers, lids, or steaming instead of open pan-frying during evening hours (cuts cooking PM2.5 by 60–80%).',
        profile.cookingSource !== 'induction_electric'
          ? 'Run kitchen exhaust fan during and 15 min after cooking, and crack only the kitchen window while keeping bedroom doors shut.'
          : 'Run kitchen hood on medium during cooking to capture cooking-oil aerosols (organic PM2.5).',
        'Leave shoes and outer winter coats in an entryway zone to avoid tracking road-dust heavy metals onto indoor rugs.',
      ],
      costTier: 'Free',
      tailoredWhy: `In ${profile.housingType.replace('_', ' ')} homes, evening cooking + closed winter windows can spike indoor PM2.5 above outdoor levels within 15 minutes.`,
      directImpact: {
        indoorPm25ReductionPct: profile.cookingSource === 'biomass_solid' ? 32 : 16,
        personalExposureSavedUgPerDay: Math.round(baselineIndoorPm25 * 2.1),
        pm25EmissionsPreventedGramsPerDay: profile.cookingSource === 'biomass_solid' ? 8.5 : 0.8,
        co2eSavedKgPerMonth: profile.cookingSource === 'biomass_solid' ? 42 : 6,
        explanation: `Lids + moisture cooking cut kitchen aerosol peaks by ~70%, saving ~${Math.round(baselineIndoorPm25 * 2.1)} µg/day of indoor exposure for all ${profile.householdSize} family members.`,
      },
      effortLevel: 'Habit Shift',
    },
    {
      id: 'routine-night-zone',
      category: 'routine',
      timeSlot: 'Night Sleep (9 PM–6 AM)',
      title: 'Create a Clean-Air Bedroom Sanctuary',
      summary: `Concentrate filtration and draft-blocking in sleeping rooms where your family spends 8+ continuous hours${hasVulnerable ? ' (critical for vulnerable lungs)' : ''}.`,
      howToSteps: [
        'Keep bedroom doors closed at night so filtration only has to clean ~15–20 m² instead of the whole home.',
        'Switch off incense, scented candles, and mosquito coils—one stick of incense can push indoor PM2.5 past 200 µg/m³.',
        'Place a damp towel or foam sweep along exterior gaps and keep indoor humidity between 40–50% to soothe dry airways.',
      ],
      costTier: 'Free',
      tailoredWhy: `Overnight inversion in ${location.name} peaks near 9–11 PM; protecting 8 sleep hours cuts 33% of total 24-hour cumulative exposure.`,
      directImpact: {
        indoorPm25ReductionPct: 15,
        personalExposureSavedUgPerDay: Math.round(baselineIndoorPm25 * 2.4),
        pm25EmissionsPreventedGramsPerDay: 0.4,
        co2eSavedKgPerMonth: 0,
        explanation: `Securing an 8-hour low-PM2.5 sleep zone gives airways overnight recovery time and lowers daily inhaled dose by ~${Math.round(baselineIndoorPm25 * 2.4)} µg.`,
      },
      effortLevel: 'Quick Win',
    },
  ];

  const iaqHacks: RecommendationItem[] = [
    {
      id: 'iaq-corsi-rosenthal',
      category: 'iaq_hack',
      title: profile.hasHepaPurifier
        ? `Supplement Room HEPA with DIY Corsi-Rosenthal Box (${requiredCadr} m³/h target)`
        : `Build a Low-Cost DIY Corsi-Rosenthal Air Cleaner (${requiredCadr} m³/h target)`,
      summary: `Tape MERV-13 pleated furnace filters to a standard 20-inch box fan to match a \$300 HEPA purifier at 1/5th the cost.`,
      howToSteps: [
        `For your ${profile.roomAreaSqm} m² main room, aim for ${requiredCadr} m³/h CADR (4.8 air changes/hour).`,
        'Buy 4× MERV-13 filters (20×20×1 in) + 1× standard 20-inch box fan + cardboard base + duct tape.',
        'Tape filters into a cube with airflow arrows pointing INWARD, place the fan blowing UPWARD on top, and seal all corner seams.',
        'Run on Low/Medium continuously during winter smog alerts; replace filters every 3–5 months when gray.',
      ],
      costTier: 'Low-cost ($5–$40)',
      tailoredWhy: `Delivers ~350–500 m³/h Clean Air Delivery Rate, easily covering your ${profile.roomAreaSqm} m² room without proprietary filter lock-in.`,
      directImpact: {
        indoorPm25ReductionPct: profile.hasHepaPurifier ? 28 : 48,
        personalExposureSavedUgPerDay: Math.round(baselineIndoorPm25 * 5.2),
        pm25EmissionsPreventedGramsPerDay: 0,
        co2eSavedKgPerMonth: 0,
        explanation: `High-CADR MERV-13 recirculation cuts indoor PM2.5 by ~${profile.hasHepaPurifier ? 28 : 48}% within 45 minutes, removing ~${Math.round(baselineIndoorPm25 * 0.45)} µg/m³ continuously.`,
      },
      effortLevel: 'Weekend DIY',
    },
    {
      id: 'iaq-wet-mopping',
      category: 'iaq_hack',
      title: 'Wet-Mop & Damp-Dust Rule (Zero Dry Sweeping)',
      summary: 'Replace dry brooms and feather dusters with damp microfiber mops to stop settled PM2.5 & road dust from re-entering lungs.',
      howToSteps: [
        'Wet-mop hard floors with plain water or mild soap every 1–2 days during severe smog.',
        'Use a damp microfiber cloth on window tracks, ceiling fans, and children’s play surfaces.',
        'If vacuuming, only use a HEPA-sealed vacuum; unsealed vacuums blow fine PM2.5 straight back into breathing height.',
      ],
      costTier: 'Free',
      tailoredWhy: `Resuspended floor dust accounts for 20–35% of toddler and pet breathing-zone exposure near the ground.`,
      directImpact: {
        indoorPm25ReductionPct: 12,
        personalExposureSavedUgPerDay: Math.round(baselineIndoorPm25 * 1.1),
        pm25EmissionsPreventedGramsPerDay: 0,
        co2eSavedKgPerMonth: 0,
        explanation: `Eliminating dry sweeping prevents short-term 40–100 µg/m³ indoor resuspension spikes that linger for 2+ hours.`,
      },
      effortLevel: 'Quick Win',
    },
    {
      id: 'iaq-draft-seal',
      category: 'iaq_hack',
      title: isDrafty ? 'Seal Window & Door Drafts (Cut Infiltration + Heating Load)' : 'Check Exhaust Backdrafts & Door Sweeps',
      summary: 'Weatherstrip sliding window tracks, balcony doors, and AC sleeves to stop outdoor smog from seeping in overnight.',
      howToSteps: [
        'Apply adhesive EVA/silicone foam weatherstripping along rattling window frames and balcony doors.',
        'Slide a DIY fabric sand/rice snake or rubber door-sweep under the main entry door.',
        'Tape plastic film or magnetic cover over unused window AC vents during winter months.',
      ],
      costTier: 'Low-cost ($5–$40)',
      tailoredWhy: `Your housing profile (${profile.housingType.replace('_', ' ')}) loses clean air rapidly without perimeter sealing—raising both indoor PM2.5 and winter heating bills.`,
      directImpact: {
        indoorPm25ReductionPct: isDrafty ? 22 : 11,
        personalExposureSavedUgPerDay: Math.round(location.pm25 * (isDrafty ? 1.9 : 0.9)),
        pm25EmissionsPreventedGramsPerDay: profile.heatingSource === 'electric_heat_pump' ? 0.3 : 1.4,
        co2eSavedKgPerMonth: 28,
        explanation: `Cutting air leakage from ~0.9 to ~0.45 ACH slashes smog infiltration AND lowers winter heating energy demand by ~18% (~28 kg CO₂e/month).`,
      },
      effortLevel: 'Weekend DIY',
    },
  ];

  const commuteIsDriving = profile.commuteMode === 'car_solo' || profile.commuteMode === 'two_wheeler';
  const isSolidHeatOrCook =
    profile.heatingSource === 'wood_coal_stove' ||
    profile.heatingSource === 'portable_kerosene' ||
    profile.cookingSource === 'biomass_solid';

  const sustainableAlternatives: RecommendationItem[] = [
    {
      id: 'alt-commute-shift',
      category: 'sustainable_alt',
      title: commuteIsDriving
        ? `Replace Solo ${profile.commuteMode === 'two_wheeler' ? 'Two-Wheeler' : 'Car'} Trips with Carpool / Transit 3 Days/Wk`
        : 'Trip-Chain Errands & Avoid Cold-Start Idling',
      summary: commuteIsDriving
        ? `Shift ${Math.round(profile.commuteKmRoundTrip * 0.6)} km/day to shared transit or 3-family carpool rotation; set car HVAC to Recirculate during traffic.`
        : 'Combine winter errands into one warm-engine loop and switch off engines if stopped >30 seconds.',
      howToSteps: [
        commuteIsDriving
          ? `Pair with 2 neighborhood families for school/office runs (${profile.commuteKmRoundTrip} km/day round trip).`
          : 'Keep transit or shared-EV commutes prioritized during morning/evening inversion windows.',
        'Always press the dashboard Recirculate button in heavy traffic—cabin PM2.5 drops 50–75% vs outside-air intake.',
        'Eliminate 3-minute driveway "warm-up" idling; modern engines warm faster under gentle driving and cold-start idling emits peak NOx/VOCs.',
      ],
      costTier: 'Free',
      tailoredWhy: `Cold winter starts produce 3–5× higher tailpipe hydrocarbons and secondary PM2.5 precursors in ${location.name}’s stagnant air.`,
      directImpact: {
        indoorPm25ReductionPct: 3,
        personalExposureSavedUgPerDay: commuteIsDriving ? 24 : 10,
        pm25EmissionsPreventedGramsPerDay: commuteIsDriving ? Math.round(profile.commuteKmRoundTrip * 0.18 * 10) / 10 : 1.1,
        co2eSavedKgPerMonth: commuteIsDriving ? Math.round(profile.commuteKmRoundTrip * 3.8) : 18,
        explanation: commuteIsDriving
          ? `Cutting solo driving by 3 days/week prevents ~${Math.round(profile.commuteKmRoundTrip * 3.8)} kg CO₂e/month and removes tailpipe PM2.5 + NOx directly at street breathing height.`
          : `Cutting cold-start idling prevents ~18 kg CO₂e/month and reduces street-level NOx & ultrafine particle plumes near schools.`,
      },
      effortLevel: 'Habit Shift',
    },
    {
      id: 'alt-clean-heat-cook',
      category: 'sustainable_alt',
      title: isSolidHeatOrCook
        ? 'Transition Off Wood/Biomass/Kerosene to Induction & Electric Warmth'
        : 'Layer Thermal Fabrics + Induction Kettle/Cooker to Cut Combustion',
      summary: isSolidHeatOrCook
        ? 'Swapping one solid-fuel stove for an electric induction cooktop + thermal layering eliminates the #1 household PM2.5 source.'
        : 'Use electric kettle/induction & heated throws instead of gas ovens or supplemental space heaters.',
      howToSteps: [
        isSolidHeatOrCook
          ? 'Prioritize an inexpensive single-burner induction plate (~$35) for daily tea, boiling, and simmering—zero indoor PM2.5 or CO.'
          : 'Pre-boil water in an electric kettle rather than an open gas flame to cut indoor NO₂ and ultrafine particles.',
        'Use thermal curtains + rugs + layered woolens so rooms feel 2°C warmer without burning additional fuel.',
        'Service gas burners/boilers annually so flames burn crisp blue (yellow tips indicate soot and CO formation).',
      ],
      costTier: isSolidHeatOrCook ? 'Low-cost ($5–$40)' : 'Free',
      tailoredWhy: `In winter smog events, a single indoor wood/coal fireplace emits as much PM2.5 in 1 hour as ~18 diesel cars driving past your street.`,
      directImpact: {
        indoorPm25ReductionPct: isSolidHeatOrCook ? 36 : 8,
        personalExposureSavedUgPerDay: isSolidHeatOrCook ? 95 : 18,
        pm25EmissionsPreventedGramsPerDay: isSolidHeatOrCook ? 42 : 1.6,
        co2eSavedKgPerMonth: isSolidHeatOrCook ? 85 : 14,
        explanation: isSolidHeatOrCook
          ? `Replacing indoor biomass/wood combustion prevents ~42 g of direct PM2.5/day and cuts indoor smoke exposure dramatically.`
          : `Shifting boiling & simmering off open flames reduces indoor NO₂/PM2.5 peaks and saves ~14 kg CO₂e/month.`,
      },
      effortLevel: 'Habit Shift',
    },
    {
      id: 'alt-zero-burn-compost',
      category: 'sustainable_alt',
      title: 'Zero-Burn Winter Yard & Household Waste Pledge',
      summary: 'Compost fallen winter leaves and dry garden trimmings instead of evening bonfires or roadside trash burning.',
      howToSteps: [
        'Bag dry leaves for municipal green-waste pickup or start a covered leaf-mold bin (free garden mulch by spring).',
        'Never burn cardboard, plastic packaging, or damp wood for outdoor warmth—open smoldering burns emit 10–20× more PM2.5 per kg than clean combustion.',
        'Report recurring neighborhood waste fires to local municipal clean-air helplines with geotagged photos.',
      ],
      costTier: 'Free',
      tailoredWhy: `Open winter leaf/trash burning at dusk happens right as the inversion layer drops, creating localized 400+ µg/m³ smoke plumes across whole blocks.`,
      directImpact: {
        indoorPm25ReductionPct: 5,
        personalExposureSavedUgPerDay: 14,
        pm25EmissionsPreventedGramsPerDay: 6.5,
        co2eSavedKgPerMonth: 22,
        explanation: `Stopping just 1 kg/day of open smoldering leaf/waste burning prevents ~6.5 g of toxic fine PM2.5 and dioxins from blanketing nearby homes.`,
      },
      effortLevel: 'Quick Win',
    },
  ];

  const communityActions: RecommendationItem[] = [
    {
      id: 'comm-school-no-idle',
      category: 'community',
      title: 'Launch a School-Gate "No-Idling" & Walking-Bus Group',
      summary: 'Coordinate 5–10 local parents to turn off engines at pickup and rotate supervised short walks or carpools.',
      howToSteps: [
        'Share a 3-sentence "Engines Off for Little Lungs" note in your class parent chat.',
        'Designate a 300m drop-off point away from the crowded school gate so kids avoid concentrated tailpipe clouds.',
        'Use the ready-to-send neighborhood message template below to invite 4 nearby families.',
      ],
      costTier: 'Free',
      tailoredWhy: `School pickup lines create micro-hotspots 3–4× worse than background AQI right at children’s breathing height.`,
      directImpact: {
        indoorPm25ReductionPct: 2,
        personalExposureSavedUgPerDay: 16,
        pm25EmissionsPreventedGramsPerDay: 4.2,
        co2eSavedKgPerMonth: 35,
        explanation: `Just 10 parents turning off engines for 10 min/day plus 3 carpools prevents ~35 kg CO₂e and ~126 g PM2.5/month right at the school gate.`,
      },
      effortLevel: 'Habit Shift',
    },
    {
      id: 'comm-diy-workshop',
      category: 'community',
      title: 'Host a 60-Minute Neighborhood Corsi-Rosenthal Build Night',
      summary: 'Pool bulk MERV-13 filter packs with 4–6 neighbors or your resident association to equip elderly homes & classrooms.',
      howToSteps: [
        'Order bulk 12-packs of MERV-13 filters (cuts per-filter cost by ~30%).',
        'Build 3–4 DIY air cleaners together in an hour—prioritize households with infants, seniors, or asthma.',
        'Share hyperlocal AQI inversion alerts so everyone closes windows together by 4:30 PM.',
      ],
      costTier: 'Low-cost ($5–$40)',
      tailoredWhy: `Community filter pools bring clean indoor air to vulnerable neighbors and turn passive anxiety into measurable local protection.`,
      directImpact: {
        indoorPm25ReductionPct: 4,
        personalExposureSavedUgPerDay: 12,
        pm25EmissionsPreventedGramsPerDay: 0,
        co2eSavedKgPerMonth: 0,
        explanation: `Equipping 5 vulnerable neighborhood rooms protects ~15 residents during severe winter smog episodes at <$35/room.`,
      },
      effortLevel: 'Weekend DIY',
    },
  ];

  const communityMessageDraft = {
    channel: 'Neighborhood / Parent Chat',
    subject: `Quick Winter Clean-Air Plan for Our Block (${location.name} AQI ${location.aqi})`,
    body: `Hi neighbors! With ${location.name} hitting AQI ${location.aqi} (${Math.round(location.pm25)} µg/m³ PM2.5) this week, a few small shifts together can make a big difference for our kids and seniors:\n1) Best fresh-air window today is ${formatHour(bestSlot.hour)}–${formatHour(bestWindowEndHour)} (~${bestSlot.pm25} µg/m³); let’s close windows before 5 PM when smog locks in.\n2) Engines off while waiting at school/gate pickup & zero evening leaf/waste burning.\n3) Anyone interested in splitting a bulk MERV-13 filter pack for DIY room air cleaners (<$35/room)? Reply if you’d like in!`,
  };

  const vulnText =
    profile.sensitivities.length > 0
      ? `tailored for ${profile.sensitivities.map((s) => s.replace('_', ' ')).join(', ')}`
      : 'tailored for your household';

  return {
    source: 'scientific_engine',
    modelName: 'AeroKin Winter Smog Mass-Balance Engine v1',
    generatedAt: new Date().toISOString(),
    situationBrief: `${location.name} is experiencing ${aqiCategory.label.toLowerCase()} winter air (${location.pm25} µg/m³ PM2.5 · AQI ${location.aqi}) with ${location.inversionRisk.toLowerCase()} thermal inversion risk. Without intervention, indoor PM2.5 in your ${profile.housingType.replace('_', ' ')} home averages ~${baselineIndoorPm25} µg/m³. Below is your personalized plan ${vulnText}.`,
    aqiCategory,
    bestVentilationWindow: {
      windowLabel: `${formatHour(bestSlot.hour)} – ${formatHour(bestWindowEndHour)}`,
      outdoorPm25AtWindow: bestSlot.pm25,
      reason: `Solar warming briefly lifts the winter boundary layer in ${location.name}, dipping outdoor PM2.5 to ~${bestSlot.pm25} µg/m³ before evening inversion resumes.`,
    },
    baselineIndoorPm25,
    routines,
    iaqHacks,
    sustainableAlternatives,
    communityActions,
    communityMessageDraft,
  };
}

/**
 * Computes real-time combined impact of selected recommendations + community adoption multiplier.
 * Uses multiplicative reduction for indoor PM2.5 (bounded at 88% max realistic reduction)
 * and Berkeley Earth conversion (~22 µg/m³ daily exposure ≈ 1 cigarette/day).
 */
export function simulateImpact(
  profile: HouseholdProfile,
  plan: AssistantPlan,
  selectedIds: string[],
  communityFamiliesCount: number
): ImpactSimulationResult {
  const allItems = [
    ...plan.routines,
    ...plan.iaqHacks,
    ...plan.sustainableAlternatives,
    ...plan.communityActions,
  ];
  const selectedSet = new Set(selectedIds);
  const selected = allItems.filter((item) => selectedSet.has(item.id));

  let remainingIndoorFraction = 1;
  let extraExposureSavedUg = 0;
  let dailyPm25PreventedGrams = 0;
  let monthlyCo2eSavedKg = 0;

  for (const item of selected) {
    const pct = Math.max(0, Math.min(60, item.directImpact.indoorPm25ReductionPct)) / 100;
    remainingIndoorFraction *= 1 - pct;
    extraExposureSavedUg += item.directImpact.personalExposureSavedUgPerDay;
    dailyPm25PreventedGrams += item.directImpact.pm25EmissionsPreventedGramsPerDay;
    monthlyCo2eSavedKg += item.directImpact.co2eSavedKgPerMonth;
  }

  remainingIndoorFraction = Math.max(0.12, remainingIndoorFraction);
  const baselineIndoor = plan.baselineIndoorPm25;
  const projectedIndoor = Math.max(4, Math.round(baselineIndoor * remainingIndoorFraction));
  const indoorDropPct = Math.round(((baselineIndoor - projectedIndoor) / Math.max(1, baselineIndoor)) * 100);

  // Average adult/child daily inhaled volume ~14 m³/day (weighted ~11 m³ indoors + ~3 m³ outdoors)
  const outdoorPm25 = resolveOutdoorPm25(profile);
  const baselineDailyInhaledUg = Math.round(baselineIndoor * 11 + outdoorPm25 * 3);
  const indoorSavedUg = Math.max(0, (baselineIndoor - projectedIndoor) * 11);
  const totalSavedUg = Math.min(baselineDailyInhaledUg * 0.85, indoorSavedUg + extraExposureSavedUg * 0.45);
  const projectedDailyInhaledUg = Math.max(25, Math.round(baselineDailyInhaledUg - totalSavedUg));

  // Berkeley Earth equivalence: 22 µg/m³ 24h concentration ≈ 1 cigarette/day (≈ 308 µg inhaled/day)
  const cigaretteEquivalentsAvoidedPerWeek = Math.round(((totalSavedUg / 308) * 7) * 10) / 10;

  const householdPm25EmissionsPreventedGramsPerMonth = Math.round(dailyPm25PreventedGrams * 30);
  const householdCo2eSavedKgPerMonth = Math.round(monthlyCo2eSavedKg);

  const rippleCount = Math.max(1, communityFamiliesCount);
  const communityRipplePm25GramsPerMonth = Math.round(householdPm25EmissionsPreventedGramsPerMonth * rippleCount);
  const communityRippleCo2eKgPerMonth = Math.round(householdCo2eSavedKgPerMonth * rippleCount);

  // WHO 24-hour guideline for PM2.5 is 15 µg/m³
  const whoGuidelineRatioBefore = Math.round((baselineIndoor / 15) * 10) / 10;
  const whoGuidelineRatioAfter = Math.round((projectedIndoor / 15) * 10) / 10;

  return {
    baselineIndoorPm25: baselineIndoor,
    projectedIndoorPm25: projectedIndoor,
    indoorDropPct,
    baselineDailyInhaledUg,
    projectedDailyInhaledUg,
    cigaretteEquivalentsAvoidedPerWeek,
    householdPm25EmissionsPreventedGramsPerMonth,
    householdCo2eSavedKgPerMonth,
    communityRipplePm25GramsPerMonth,
    communityRippleCo2eKgPerMonth,
    whoGuidelineRatioBefore,
    whoGuidelineRatioAfter,
  };
}
