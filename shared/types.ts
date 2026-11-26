export type Sensitivity =
  | 'infants'
  | 'school_kids'
  | 'elderly'
  | 'asthma_copd'
  | 'outdoor_workers'
  | 'pets';

export type HousingType =
  | 'apartment_sealed'
  | 'apartment_drafty'
  | 'independent_house'
  | 'multi_gen';

export type HeatingSource =
  | 'gas_boiler'
  | 'electric_heat_pump'
  | 'wood_coal_stove'
  | 'portable_kerosene'
  | 'unheated_blankets';

export type CookingSource =
  | 'induction_electric'
  | 'lpg_piped_gas'
  | 'biomass_solid';

export type CommuteMode =
  | 'car_solo'
  | 'two_wheeler'
  | 'public_transit'
  | 'carpool'
  | 'walk_cycle'
  | 'remote_hybrid';

export type BudgetTier = 'zero_cost' | 'low_budget' | 'full_upgrade';

export interface HourlySmogPoint {
  hour: number;
  label: string;
  pm25: number;
  inversionActive: boolean;
}

export interface LocationProfile {
  id: string;
  name: string;
  regionLabel: string;
  lat: number;
  lon: number;
  pm25: number;
  pm10: number;
  aqi: number;
  tempC: number;
  windKmh: number;
  humidity: number;
  inversionRisk: 'Severe' | 'High' | 'Moderate' | 'Low';
  primarySources: string[];
  seasonalNote: string;
  hourlyPattern: HourlySmogPoint[];
  isLive?: boolean;
}

export interface HouseholdProfile {
  locationId: string;
  customCity: string;
  pm25Override: number | null;
  householdSize: number;
  sensitivities: Sensitivity[];
  housingType: HousingType;
  roomAreaSqm: number;
  heatingSource: HeatingSource;
  cookingSource: CookingSource;
  commuteMode: CommuteMode;
  commuteKmRoundTrip: number;
  hasHepaPurifier: boolean;
  hasN95Masks: boolean;
  budgetTier: BudgetTier;
}

export interface DirectImpact {
  indoorPm25ReductionPct: number;
  personalExposureSavedUgPerDay: number;
  pm25EmissionsPreventedGramsPerDay: number;
  co2eSavedKgPerMonth: number;
  explanation: string;
}

export interface RecommendationItem {
  id: string;
  category: 'routine' | 'iaq_hack' | 'sustainable_alt' | 'community';
  timeSlot?: string;
  title: string;
  summary: string;
  howToSteps: string[];
  costTier: 'Free' | 'Low-cost ($5–$40)' | 'Investment ($50+)';
  tailoredWhy: string;
  directImpact: DirectImpact;
  effortLevel: 'Quick Win' | 'Habit Shift' | 'Weekend DIY';
}

export interface AqiCategoryInfo {
  label: string;
  tone: 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'very_unhealthy' | 'hazardous';
  advice: string;
}

export interface AssistantPlan {
  source: 'gemini' | 'scientific_engine';
  modelName: string;
  generatedAt: string;
  situationBrief: string;
  aqiCategory: AqiCategoryInfo;
  bestVentilationWindow: {
    windowLabel: string;
    outdoorPm25AtWindow: number;
    reason: string;
  };
  baselineIndoorPm25: number;
  routines: RecommendationItem[];
  iaqHacks: RecommendationItem[];
  sustainableAlternatives: RecommendationItem[];
  communityActions: RecommendationItem[];
  communityMessageDraft: {
    channel: string;
    subject: string;
    body: string;
  };
}

export interface ImpactSimulationResult {
  baselineIndoorPm25: number;
  projectedIndoorPm25: number;
  indoorDropPct: number;
  baselineDailyInhaledUg: number;
  projectedDailyInhaledUg: number;
  cigaretteEquivalentsAvoidedPerWeek: number;
  householdPm25EmissionsPreventedGramsPerMonth: number;
  householdCo2eSavedKgPerMonth: number;
  communityRipplePm25GramsPerMonth: number;
  communityRippleCo2eKgPerMonth: number;
  whoGuidelineRatioBefore: number;
  whoGuidelineRatioAfter: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  impactCallout?: {
    exposureDelta: string;
    emissionDelta: string;
    keyAction: string;
  };
  source?: 'gemini' | 'scientific_engine';
  timestamp: string;
}
