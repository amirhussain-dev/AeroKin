import {
  buildScientificPlan,
  calculateBaselineIndoorPm25,
  calculateRequiredCadr,
  classifyAqi,
} from '../shared/smogEngine.ts';
import type {
  AssistantPlan,
  ChatMessage,
  HouseholdProfile,
  LocationProfile,
  RecommendationItem,
} from '../shared/types.ts';

export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

interface InteractionContentBlock {
  type?: string;
  text?: string;
}

interface InteractionStep {
  type?: string;
  content?: InteractionContentBlock[];
}

interface InteractionsApiResponse {
  id?: string;
  status?: string;
  output_text?: string;
  steps?: InteractionStep[];
  outputs?: Array<{
    type?: string;
    text?: string;
    content?: InteractionContentBlock[];
  }>;
  error?: { message?: string };
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

export function extractTextFromGeminiPayload(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const resp = data as InteractionsApiResponse & GenerateContentResponse;

  if (typeof resp.output_text === 'string' && resp.output_text.trim()) {
    return resp.output_text.trim();
  }

  if (Array.isArray(resp.steps)) {
    const parts: string[] = [];
    for (const step of resp.steps) {
      if (step.type === 'model_output' && Array.isArray(step.content)) {
        for (const block of step.content) {
          if (typeof block.text === 'string' && block.text.trim()) {
            parts.push(block.text);
          }
        }
      }
    }
    if (parts.length > 0) return parts.join('\n').trim();
  }

  if (Array.isArray(resp.outputs)) {
    const parts: string[] = [];
    for (const out of resp.outputs) {
      if (typeof out.text === 'string' && out.text.trim()) {
        parts.push(out.text);
      } else if (Array.isArray(out.content)) {
        for (const block of out.content) {
          if (typeof block.text === 'string' && block.text.trim()) {
            parts.push(block.text);
          }
        }
      }
    }
    if (parts.length > 0) return parts.join('\n').trim();
  }

  const candidateText = resp.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || '')
    .join('\n')
    .trim();
  if (candidateText) return candidateText;

  return '';
}

export function parseJsonLenient<T>(rawText: string): T {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(jsonText) as T;
}

async function postGeminiJson<T>(
  url: string,
  apiKey: string,
  payload: unknown
): Promise<{ ok: boolean; status: number; data: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = (await res.json()) as T;
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiInteractions(
  apiKey: string,
  model: string,
  systemInstruction: string,
  input: string,
  expectJson = true
): Promise<{ text: string; interactionId?: string }> {
  const body: Record<string, unknown> = {
    model,
    system_instruction: systemInstruction,
    input,
    store: false,
  };

  if (expectJson) {
    body.response_format = {
      type: 'text',
      mime_type: 'application/json',
    };
  }

  const { ok, status, data } = await postGeminiJson<InteractionsApiResponse>(
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    apiKey,
    body
  );

  if (!ok) {
    // Fallback to generateContent if an older custom model doesn't support Interactions API
    if (status === 404 || (data.error?.message || '').toLowerCase().includes('interactions')) {
      const legacyText = await callGeminiGenerateContent(apiKey, model, systemInstruction, input, expectJson);
      return { text: legacyText };
    }
    throw new Error(data.error?.message || `Gemini Interactions API returned HTTP ${status}`);
  }

  const text = extractTextFromGeminiPayload(data);
  if (!text) {
    throw new Error('Empty response from Gemini Interactions API');
  }
  return { text, interactionId: data.id };
}

async function callGeminiGenerateContent(
  apiKey: string,
  model: string,
  systemInstruction: string,
  input: string,
  expectJson: boolean
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const { ok, status, data } = await postGeminiJson<GenerateContentResponse>(url, apiKey, {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig: expectJson
      ? { temperature: 0.4, responseMimeType: 'application/json' }
      : { temperature: 0.4 },
  });

  if (!ok) {
    throw new Error(data.error?.message || `Gemini API returned HTTP ${status}`);
  }

  const text = extractTextFromGeminiPayload(data);
  if (!text) {
    throw new Error('Empty response from Gemini API');
  }
  return text;
}

function sanitizeItems(
  incoming: Partial<RecommendationItem>[] | undefined,
  fallback: RecommendationItem[],
  category: RecommendationItem['category']
): RecommendationItem[] {
  if (!Array.isArray(incoming) || incoming.length === 0) return fallback;
  return incoming.slice(0, 4).map((item, idx) => {
    const base = fallback[idx % fallback.length];
    return {
      id: item.id || `${category}-${idx + 1}`,
      category,
      timeSlot: item.timeSlot || base.timeSlot,
      title: item.title || base.title,
      summary: item.summary || base.summary,
      howToSteps:
        Array.isArray(item.howToSteps) && item.howToSteps.length > 0
          ? item.howToSteps.slice(0, 4)
          : base.howToSteps,
      costTier:
        item.costTier === 'Free' ||
        item.costTier === 'Low-cost ($5–$40)' ||
        item.costTier === 'Investment ($50+)'
          ? item.costTier
          : base.costTier,
      tailoredWhy: item.tailoredWhy || base.tailoredWhy,
      directImpact: {
        indoorPm25ReductionPct:
          typeof item.directImpact?.indoorPm25ReductionPct === 'number'
            ? Math.max(0, Math.min(60, Math.round(item.directImpact.indoorPm25ReductionPct)))
            : base.directImpact.indoorPm25ReductionPct,
        personalExposureSavedUgPerDay:
          typeof item.directImpact?.personalExposureSavedUgPerDay === 'number'
            ? Math.max(0, Math.round(item.directImpact.personalExposureSavedUgPerDay))
            : base.directImpact.personalExposureSavedUgPerDay,
        pm25EmissionsPreventedGramsPerDay:
          typeof item.directImpact?.pm25EmissionsPreventedGramsPerDay === 'number'
            ? Math.max(0, Math.round(item.directImpact.pm25EmissionsPreventedGramsPerDay * 10) / 10)
            : base.directImpact.pm25EmissionsPreventedGramsPerDay,
        co2eSavedKgPerMonth:
          typeof item.directImpact?.co2eSavedKgPerMonth === 'number'
            ? Math.max(0, Math.round(item.directImpact.co2eSavedKgPerMonth))
            : base.directImpact.co2eSavedKgPerMonth,
        explanation: item.directImpact?.explanation || base.directImpact.explanation,
      },
      effortLevel:
        item.effortLevel === 'Quick Win' ||
        item.effortLevel === 'Habit Shift' ||
        item.effortLevel === 'Weekend DIY'
          ? item.effortLevel
          : base.effortLevel,
    };
  });
}

export async function generateTailoredPlan(
  profile: HouseholdProfile,
  location: LocationProfile,
  apiKey?: string,
  model = DEFAULT_GEMINI_MODEL
): Promise<{ plan: AssistantPlan; warning?: string }> {
  const baselinePlan = buildScientificPlan(profile, location);
  const effectiveKey = (apiKey || process.env.GEMINI_API_KEY || '').trim();
  const activeModel = (model || DEFAULT_GEMINI_MODEL).trim();

  if (!effectiveKey) {
    return { plan: baselinePlan };
  }

  const requiredCadr = calculateRequiredCadr(profile.roomAreaSqm);
  const baselineIndoor = calculateBaselineIndoorPm25(profile, location);

  const systemInstruction = `You are AeroKin, an environmental health scientist and warm practical coach helping families and neighborhoods navigate severe winter smog and urban air pollution.
Return ONLY valid JSON matching the exact schema requested (no markdown code fences).
Be deeply specific to the user's location, winter thermal inversion hourly pattern, housing type, heating/cooking fuel, commute, budget tier, and vulnerable family members.
Never recommend ozone generators, ionizers, or unsafe heating hacks. Always quantify direct impact honestly and explain the cause-and-effect clearly.`;

  const prompt = `Generate a personalized winter smog action plan in JSON for this household:
Location: ${location.name} (${location.regionLabel})
Outdoor Conditions: PM2.5 = ${location.pm25} µg/m³, PM10 = ${location.pm10} µg/m³, US AQI = ${location.aqi}, Temp = ${location.tempC}°C, Wind = ${location.windKmh} km/h, Humidity = ${location.humidity}%, Inversion Risk = ${location.inversionRisk}
Primary Local Sources: ${location.primarySources.join('; ')}
Hourly PM2.5 Curve: ${location.hourlyPattern.map((p) => `${p.label}:${p.pm25}µg/m³`).join(', ')}

Household Profile:
- Size: ${profile.householdSize} people
- Sensitivities: ${profile.sensitivities.join(', ') || 'general family'}
- Housing: ${profile.housingType}, main living area ${profile.roomAreaSqm} m² (target CADR ${requiredCadr} m³/h), estimated baseline indoor PM2.5 = ${baselineIndoor} µg/m³
- Heating: ${profile.heatingSource}, Cooking: ${profile.cookingSource}
- Commute: ${profile.commuteMode} (${profile.commuteKmRoundTrip} km/day round-trip)
- Equipment: HEPA purifier = ${profile.hasHepaPurifier}, N95/FFP2 masks = ${profile.hasN95Masks}
- Budget tier: ${profile.budgetTier}

Output JSON with these exact keys:
{
  "situationBrief": "2-3 sentence empathetic, concrete situation summary citing numbers",
  "bestVentilationWindow": { "windowLabel": "e.g. 1:00 PM – 4:00 PM", "outdoorPm25AtWindow": number, "reason": "string" },
  "routines": [4 items covering Morning, Midday, Evening, Night with timeSlot, title, summary, howToSteps (3 strings), costTier ("Free"|"Low-cost ($5–$40)"|"Investment ($50+)"), tailoredWhy, effortLevel ("Quick Win"|"Habit Shift"|"Weekend DIY"), directImpact: { indoorPm25ReductionPct, personalExposureSavedUgPerDay, pm25EmissionsPreventedGramsPerDay, co2eSavedKgPerMonth, explanation }],
  "iaqHacks": [3 indoor air quality hack items matching same item schema],
  "sustainableAlternatives": [3 sustainable commute/heating/waste alternative items matching same item schema],
  "communityActions": [2 community/neighborhood action items matching same item schema],
  "communityMessageDraft": { "channel": "Neighborhood / Parent Chat", "subject": "string", "body": "concise ready-to-copy message with 3 clear steps" }
}`;

  try {
    const { text } = await callGeminiInteractions(effectiveKey, activeModel, systemInstruction, prompt, true);
    const parsed = parseJsonLenient<Partial<AssistantPlan>>(text);

    const merged: AssistantPlan = {
      source: 'gemini',
      modelName: activeModel,
      generatedAt: new Date().toISOString(),
      situationBrief: parsed.situationBrief || baselinePlan.situationBrief,
      aqiCategory: classifyAqi(location.aqi),
      bestVentilationWindow: parsed.bestVentilationWindow?.windowLabel
        ? parsed.bestVentilationWindow
        : baselinePlan.bestVentilationWindow,
      baselineIndoorPm25: baselineIndoor,
      routines: sanitizeItems(parsed.routines, baselinePlan.routines, 'routine'),
      iaqHacks: sanitizeItems(parsed.iaqHacks, baselinePlan.iaqHacks, 'iaq_hack'),
      sustainableAlternatives: sanitizeItems(
        parsed.sustainableAlternatives,
        baselinePlan.sustainableAlternatives,
        'sustainable_alt'
      ),
      communityActions: sanitizeItems(parsed.communityActions, baselinePlan.communityActions, 'community'),
      communityMessageDraft:
        parsed.communityMessageDraft?.body ? parsed.communityMessageDraft : baselinePlan.communityMessageDraft,
    };

    return { plan: merged };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Gemini API error';
    return {
      plan: baselinePlan,
      warning: `Gemini unavailable (${message}); displaying AeroKin Scientific Engine plan.`,
    };
  }
}

function buildLocalChatReply(
  question: string,
  profile: HouseholdProfile,
  location: LocationProfile,
  plan: AssistantPlan
): { content: string; impactCallout: { exposureDelta: string; emissionDelta: string; keyAction: string } } {
  const q = question.toLowerCase();
  const requiredCadr = calculateRequiredCadr(profile.roomAreaSqm);

  if (q.includes('diy') || q.includes('cors') || q.includes('filter') || q.includes('purifier') || q.includes('cheap')) {
    return {
      content: `For your ${profile.roomAreaSqm} m² room in ${location.name} (outdoor PM2.5 ~${location.pm25} µg/m³), a **Corsi-Rosenthal Box** is the highest-impact low-cost hack:\n\n• **Parts (~$35–$40):** 4× MERV-13 pleated filters (20×20×1 in), 1× standard 20" box fan, cardboard base, and duct tape.\n• **Why it works:** It moves ~350–500 m³/h of clean air, exceeding your room’s **${requiredCadr} m³/h** target (4.8 air changes/hour).\n• **Tip:** Tape every corner seam tightly and point filter arrows INWARD toward the fan blowing upward. Run on Low overnight in bedrooms.`,
      impactCallout: {
        exposureDelta: `−45% to −55% indoor PM2.5 (~${Math.round(plan.baselineIndoorPm25 * 0.48)} µg/m³ drop)`,
        emissionDelta: '0 g direct PM2.5 · uses ~45W (~18 kg CO₂e/mo vs running AC/furnace fan)',
        keyAction: 'Build 4-filter MERV-13 box fan cleaner & run in sleeping zone',
      },
    };
  }

  if (q.includes('kid') || q.includes('school') || q.includes('sport') || q.includes('practice') || q.includes('outdoor') || q.includes('run')) {
    return {
      content: `At **AQI ${location.aqi} (${location.pm25} µg/m³)** in ${location.name}, children inhale ~2× more air per kg of body weight during exercise:\n\n• **Morning/Evening (6–10 AM, after 5 PM):** Move practice or play indoors—inversion traps PM2.5 near ground level.\n• **Best window (${plan.bestVentilationWindow.windowLabel}):** Air dips to ~${plan.bestVentilationWindow.outdoorPm25AtWindow} µg/m³; light outdoor recess is safer than dawn/dusk, though if PM2.5 > 55 µg/m³ keep vigorous cardio indoors.\n• **Pickup zone:** Ask parents to switch engines off at the school gate and use a well-fitting N95/KF94 mask for transit.`,
      impactCallout: {
        exposureDelta: `Avoids ~${Math.round(location.pm25 * 0.8)} µg inhaled PM2.5 per skipped peak-hour workout`,
        emissionDelta: 'No-idling pickup across 10 cars saves ~120 g PM2.5/month at gate level',
        keyAction: `Reschedule active play to indoor or ${plan.bestVentilationWindow.windowLabel} window`,
      },
    };
  }

  if (q.includes('message') || q.includes('neighbor') || q.includes('community') || q.includes('whatsapp') || q.includes('apartment')) {
    return {
      content: `Here is a neighbor-friendly message you can copy and share right now:\n\n> **${plan.communityMessageDraft.subject}**\n> ${plan.communityMessageDraft.body.replace(/\n/g, '\n> ')}\n\nFocusing on **specific windows** and **shared savings** (bulk filters, carpool rotation) gets 3× better neighborhood adoption than scolding.`,
      impactCallout: {
        exposureDelta: 'Shared clean-air alert helps neighbors seal before 5 PM peak',
        emissionDelta: '50 families cutting idling + leaf burning prevents ~12+ kg PM2.5/month',
        keyAction: 'Post the 3-step clean-air note in your building/school group',
      },
    };
  }

  if (q.includes('cook') || q.includes('heat') || q.includes('wood') || q.includes('stove') || q.includes('window')) {
    return {
      content: `In a **${profile.housingType.replace('_', ' ')}** home using **${profile.cookingSource.replace('_', ' ')}** cooking and **${profile.heatingSource.replace('_', ' ')}** heating:\n\n• **Window rule:** Only crack opposite windows for 15 min during **${plan.bestVentilationWindow.windowLabel}** (~${plan.bestVentilationWindow.outdoorPm25AtWindow} µg/m³), then seal drafts before 4:30 PM.\n• **Kitchen rule:** Put lids on pots, use pressure/steam cooking over open frying, and run exhaust for 15 min afterward.\n• **Heating swap:** Weatherstripping + thermal curtains drop heat loss ~18%, reducing both fuel emissions and smog infiltration.`,
      impactCallout: {
        exposureDelta: `Cuts cooking & infiltration peaks by ~${Math.round(plan.baselineIndoorPm25 * 0.35)} µg/m³`,
        emissionDelta: 'Saves ~28–45 kg CO₂e/month from reduced heating & clean cooking',
        keyAction: 'Seal door/window gaps + enforce lids-on evening cooking',
      },
    };
  }

  return {
    content: `Based on **${location.name}** (AQI **${location.aqi}**, PM2.5 **${location.pm25} µg/m³**, ${location.inversionRisk} inversion risk) and your **${profile.householdSize}-person** household:\n\n• **Highest-leverage move today:** Keep windows sealed outside **${plan.bestVentilationWindow.windowLabel}** and run a ${requiredCadr} m³/h HEPA or DIY MERV-13 purifier in bedrooms.\n• **Lowest-effort routine shift:** Switch evening cooking to covered/steamed meals and wet-mop floors instead of dry sweeping.\n• **Emission & community impact:** Replacing solo ${profile.commuteMode.replace('_', ' ')} trips 3 days/week + zero open burning cuts neighborhood PM2.5 directly at breathing height.`,
    impactCallout: {
      exposureDelta: `Up to −55% indoor PM2.5 (~${Math.round(plan.baselineIndoorPm25 * 0.55)} µg/m³ reduction)`,
      emissionDelta: `~${Math.round(profile.commuteKmRoundTrip * 3.8)} kg CO₂e/month + street-level NOx avoided`,
      keyAction: 'Adopt bedroom clean-zone + midday-only ventilation',
    },
  };
}

export async function generateChatResponse(
  profile: HouseholdProfile,
  location: LocationProfile,
  plan: AssistantPlan,
  history: ChatMessage[],
  userMessage: string,
  apiKey?: string,
  model = DEFAULT_GEMINI_MODEL
): Promise<{ reply: ChatMessage; warning?: string }> {
  const effectiveKey = (apiKey || process.env.GEMINI_API_KEY || '').trim();
  const activeModel = (model || DEFAULT_GEMINI_MODEL).trim();
  const timestamp = new Date().toISOString();

  if (!effectiveKey) {
    const local = buildLocalChatReply(userMessage, profile, location, plan);
    return {
      reply: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: local.content,
        impactCallout: local.impactCallout,
        source: 'scientific_engine',
        timestamp,
      },
    };
  }

  const systemInstruction = `You are AeroKin, a GenAI winter smog & indoor air quality assistant for families and communities.
Context:
- City: ${location.name}, PM2.5: ${location.pm25} µg/m³, US AQI: ${location.aqi}, Inversion Risk: ${location.inversionRisk}, Temp: ${location.tempC}°C, Wind: ${location.windKmh} km/h
- Best ventilation window: ${plan.bestVentilationWindow.windowLabel} (~${plan.bestVentilationWindow.outdoorPm25AtWindow} µg/m³)
- Household: ${profile.householdSize} people, sensitivities: ${profile.sensitivities.join(', ') || 'none specified'}, housing: ${profile.housingType} (${profile.roomAreaSqm} m², baseline indoor PM2.5 ~${plan.baselineIndoorPm25} µg/m³), heating: ${profile.heatingSource}, cooking: ${profile.cookingSource}, commute: ${profile.commuteMode} (${profile.commuteKmRoundTrip} km/day).

Respond with valid JSON ONLY (no markdown fences):
{
  "content": "Concise, practical markdown advice (max ~170 words) with clear bullet points tailored to this family and winter smog conditions.",
  "impactCallout": {
    "exposureDelta": "quantified personal PM2.5/exposure effect",
    "emissionDelta": "quantified PM2.5/CO2e emission impact",
    "keyAction": "one short 5-8 word imperative takeaway"
  }
}`;

  const historyTranscript = history
    .slice(-6)
    .map((m) => `${m.role === 'assistant' ? 'AeroKin' : 'User'}: ${m.content}`)
    .join('\n\n');

  const inputPrompt = historyTranscript
    ? `Recent conversation:\n${historyTranscript}\n\nUser's new question: ${userMessage}`
    : userMessage;

  try {
    const { text } = await callGeminiInteractions(effectiveKey, activeModel, systemInstruction, inputPrompt, true);
    const parsed = parseJsonLenient<{
      content?: string;
      impactCallout?: { exposureDelta: string; emissionDelta: string; keyAction: string };
    }>(text);

    return {
      reply: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: parsed.content || buildLocalChatReply(userMessage, profile, location, plan).content,
        impactCallout: parsed.impactCallout,
        source: 'gemini',
        timestamp,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Gemini API error';
    const local = buildLocalChatReply(userMessage, profile, location, plan);
    return {
      warning: `Gemini chat fallback (${message})`,
      reply: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: local.content,
        impactCallout: local.impactCallout,
        source: 'scientific_engine',
        timestamp,
      },
    };
  }
}
