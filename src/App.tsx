import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  Check,
  Copy,
  Droplets,
  Home,
  KeyRound,
  Leaf,
  Sparkles,
  Thermometer,
  Users,
  Wind,
} from 'lucide-react';
import {
  buildScientificPlan,
  calculateRequiredCadr,
  DEFAULT_PROFILE,
  resolveLocation,
  simulateImpact,
} from '../shared/smogEngine.ts';
import type {
  AssistantPlan,
  ChatMessage,
  HouseholdProfile,
  LocationProfile,
} from '../shared/types.ts';
import { ChatAssistant } from './components/ChatAssistant.tsx';
import { GeminiKeyModal } from './components/GeminiKeyModal.tsx';
import { ImpactDashboard } from './components/ImpactDashboard.tsx';
import { InversionChart } from './components/InversionChart.tsx';
import { ProfilePanel } from './components/ProfilePanel.tsx';
import { RecommendationCard } from './components/RecommendationCard.tsx';

type TabId = 'routines' | 'iaq' | 'sustainable' | 'community' | 'chat';

const TONE_BADGE: Record<string, string> = {
  good: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  moderate: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  sensitive: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  unhealthy: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  very_unhealthy: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  hazardous: 'bg-red-600/25 text-red-200 border-red-500/60',
};

export function App() {
  const [profile, setProfile] = useState<HouseholdProfile>(DEFAULT_PROFILE);
  const [useLiveFeed, setUseLiveFeed] = useState(false);
  const [initialState] = useState(() => {
    const initLocation = resolveLocation(DEFAULT_PROFILE);
    const initPlan = buildScientificPlan(DEFAULT_PROFILE, initLocation);
    const initSelected = [
      initPlan.routines[0]?.id,
      initPlan.routines[1]?.id,
      initPlan.iaqHacks[0]?.id,
      initPlan.sustainableAlternatives[0]?.id,
    ].filter((id): id is string => Boolean(id));
    return { initLocation, initPlan, initSelected };
  });
  const [location, setLocation] = useState<LocationProfile>(initialState.initLocation);
  const [plan, setPlan] = useState<AssistantPlan>(initialState.initPlan);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialState.initSelected);
  const [communityFamilies, setCommunityFamilies] = useState(25);
  const [activeTab, setActiveTab] = useState<TabId>('routines');

  const [geminiKey, setGeminiKey] = useState<string>(() => {
    try {
      return sessionStorage.getItem('aerokin_gemini_key') || '';
    } catch {
      return '';
    }
  });
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    try {
      return sessionStorage.getItem('aerokin_gemini_model') || 'gemini-3.8-flash';
    } catch {
      return 'gemini-3.8-flash';
    }
  });
  const [serverHasEnvKey, setServerHasEnvKey] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [statusNote, setStatusNote] = useState<string>('Using curated regional winter smog model.');
  const [warningNote, setWarningNote] = useState<string>('');
  const [geminiSuccessNote, setGeminiSuccessNote] = useState<string>('');
  const planAbortRef = useRef<AbortController | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatSending, setIsChatSending] = useState(false);
  const [copiedDraft, setCopiedDraft] = useState(false);

  const fetchHealth = useCallback(async (keyOverride?: string, modelOverride?: string): Promise<boolean> => {
    try {
      const headers: Record<string, string> = {};
      const effective = keyOverride ?? geminiKey;
      const effectiveModel = modelOverride ?? geminiModel;
      if (effective) headers['x-gemini-api-key'] = effective;
      if (effectiveModel) headers['x-gemini-model'] = effectiveModel;
      const res = await fetch('/api/health', { headers });
      if (res.ok) {
        const data = (await res.json()) as { geminiSource?: string; geminiConfigured?: boolean };
        setServerHasEnvKey(data.geminiSource === 'env');
        return Boolean(data.geminiConfigured);
      }
    } catch {
      // Offline / static fallback
    }
    return false;
  }, [geminiKey, geminiModel]);

  const regeneratePlan = useCallback(
    async (nextProfile: HouseholdProfile, liveFlag: boolean, keyOverride?: string, modelOverride?: string) => {
      planAbortRef.current?.abort();
      const controller = new AbortController();
      planAbortRef.current = controller;

      setIsGenerating(true);
      setWarningNote('');
      setGeminiSuccessNote('');
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const effective = keyOverride ?? geminiKey;
        const effectiveModel = modelOverride ?? geminiModel;
        if (effective) headers['x-gemini-api-key'] = effective;
        if (effectiveModel) headers['x-gemini-model'] = effectiveModel;

        const res = await fetch('/api/plan', {
          method: 'POST',
          headers,
          body: JSON.stringify({ profile: nextProfile, useLiveFeed: liveFlag }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          location: LocationProfile;
          plan: AssistantPlan;
          airFeedNote?: string;
          warning?: string;
        };

        setLocation(data.location);
        setPlan(data.plan);
        setStatusNote(data.airFeedNote || '');
        if (data.warning) {
          setWarningNote(data.warning);
        } else if (data.plan.source === 'gemini') {
          setGeminiSuccessNote(`Live Gemini connected! Plan tailored using ${data.plan.modelName}.`);
        }

        // Keep valid selections or pre-select top recommendations
        const allIds = new Set([
          ...data.plan.routines.map((r) => r.id),
          ...data.plan.iaqHacks.map((r) => r.id),
          ...data.plan.sustainableAlternatives.map((r) => r.id),
          ...data.plan.communityActions.map((r) => r.id),
        ]);
        setSelectedIds((prev) => {
          const kept = prev.filter((id) => allIds.has(id));
          if (kept.length > 0) return kept;
          return [
            data.plan.routines[0]?.id,
            data.plan.routines[1]?.id,
            data.plan.iaqHacks[0]?.id,
            data.plan.sustainableAlternatives[0]?.id,
          ].filter((id): id is string => Boolean(id));
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const fallbackLoc = resolveLocation(nextProfile);
        const fallbackPlan = buildScientificPlan(nextProfile, fallbackLoc);
        setLocation(fallbackLoc);
        setPlan(fallbackPlan);
        setStatusNote('Running local scientific smog model.');
      } finally {
        if (planAbortRef.current === controller) {
          setIsGenerating(false);
        }
      }
    },
    [geminiKey, geminiModel]
  );

  useEffect(() => {
    void (async () => {
      const geminiConfigured = await fetchHealth();
      if (geminiConfigured || geminiKey) {
        void regeneratePlan(DEFAULT_PROFILE, false);
      }
    })();
    return () => {
      planAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSaveKey = (nextKey: string, nextModel: string) => {
    setGeminiKey(nextKey);
    setGeminiModel(nextModel);
    try {
      if (nextKey) {
        sessionStorage.setItem('aerokin_gemini_key', nextKey);
      } else {
        sessionStorage.removeItem('aerokin_gemini_key');
      }
      sessionStorage.setItem('aerokin_gemini_model', nextModel);
    } catch {
      // Ignore storage errors
    }
    void fetchHealth(nextKey, nextModel);
    void regeneratePlan(profile, useLiveFeed, nextKey, nextModel);
  };

  const handleSendChat = async (text: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...chatMessages, userMsg];
    setChatMessages(nextHistory);
    setIsChatSending(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (geminiKey) headers['x-gemini-api-key'] = geminiKey;
      if (geminiModel) headers['x-gemini-model'] = geminiModel;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          profile,
          location,
          plan,
          history: chatMessages,
          message: text,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { reply: ChatMessage };
      setChatMessages([...nextHistory, data.reply]);
    } catch {
      setChatMessages([
        ...nextHistory,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content:
            'Could not reach the assistant API right now. Please make sure the AeroKin backend server is running.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsChatSending(false);
    }
  };

  const handleCopyDraft = async () => {
    try {
      await navigator.clipboard.writeText(
        `${plan.communityMessageDraft.subject}\n\n${plan.communityMessageDraft.body}`
      );
      setCopiedDraft(true);
      setTimeout(() => setCopiedDraft(false), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  const allItems = useMemo(
    () => [
      ...plan.routines,
      ...plan.iaqHacks,
      ...plan.sustainableAlternatives,
      ...plan.communityActions,
    ],
    [plan]
  );

  const simulation = useMemo(
    () => simulateImpact(profile, plan, selectedIds, communityFamilies),
    [profile, plan, selectedIds, communityFamilies]
  );

  const requiredCadr = calculateRequiredCadr(profile.roomAreaSqm);
  const badgeStyle = TONE_BADGE[plan.aqiCategory.tone] || TONE_BADGE.unhealthy;

  const tabs: Array<{ id: TabId; label: string; count?: number; icon: typeof CalendarClock }> = [
    { id: 'routines', label: 'Daily Routines', count: plan.routines.length, icon: CalendarClock },
    { id: 'iaq', label: 'Indoor Air Hacks', count: plan.iaqHacks.length, icon: Home },
    { id: 'sustainable', label: 'Sustainable Swaps', count: plan.sustainableAlternatives.length, icon: Leaf },
    { id: 'community', label: 'Community & Drafts', count: plan.communityActions.length, icon: Users },
    { id: 'chat', label: 'Ask AeroKin AI', icon: Bot },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#070d14] to-slate-950 text-slate-100">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-sky-500 text-slate-950 shadow-lg shadow-teal-500/20">
              <Wind className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-50">
                AeroKin
              </h1>
              <p className="text-[11px] text-slate-400">
                GenAI Winter Smog, Indoor Air & Community Impact Assistant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium ${
                plan.source === 'gemini'
                  ? 'border-teal-500/50 bg-teal-500/15 text-teal-200'
                  : 'border-sky-500/40 bg-sky-500/10 text-sky-200'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              {plan.source === 'gemini' ? `Live Gemini (${plan.modelName})` : 'Scientific Smog Engine'}
            </span>

            <button
              type="button"
              onClick={() => setIsKeyModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-teal-400/60 hover:text-teal-200 transition cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5 text-teal-400" />
              {geminiKey || serverHasEnvKey ? 'Gemini Connected' : 'Connect Gemini Key'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Profile */}
        <div className="lg:col-span-4 lg:sticky lg:top-20">
          <ProfilePanel
            profile={profile}
            useLiveFeed={useLiveFeed}
            isGenerating={isGenerating}
            onChange={(next) => setProfile(next)}
            onToggleLiveFeed={(nextLive) => {
              setUseLiveFeed(nextLive);
              void regeneratePlan(profile, nextLive);
            }}
            onRegenerate={() => void regeneratePlan(profile, useLiveFeed)}
          />
        </div>

        {/* Right Main Column */}
        <div className="lg:col-span-8 space-y-5">
          {warningNote && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>{warningNote}</span>
            </div>
          )}

          {geminiSuccessNote && (
            <div className="rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-2.5 text-xs text-teal-200 flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-teal-400" />
              <span>{geminiSuccessNote}</span>
            </div>
          )}

          {/* Location & Situation Hero */}
          <section className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-50">{location.name}</h2>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeStyle}`}>
                    US AQI {location.aqi} · {plan.aqiCategory.label}
                  </span>
                  {location.isLive && (
                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                      LIVE FEED
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {location.regionLabel}
                  {statusNote ? ` · ${statusNote}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-mono-num">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-center">
                  <div className="text-[10px] text-slate-400">PM2.5</div>
                  <div className="font-semibold text-amber-300">{location.pm25} µg/m³</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-center">
                  <div className="text-[10px] text-slate-400">Inversion</div>
                  <div className="font-semibold text-rose-300">{location.inversionRisk}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-1.5 flex items-center gap-3 text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <Thermometer className="h-3.5 w-3.5 text-sky-400" />
                    {location.tempC}°C
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Wind className="h-3.5 w-3.5 text-teal-400" />
                    {location.windKmh} km/h
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Droplets className="h-3.5 w-3.5 text-indigo-400" />
                    {location.humidity}%
                  </span>
                </div>
              </div>
            </div>

            <p className="text-sm text-slate-200 leading-relaxed">{plan.situationBrief}</p>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-slate-400 font-medium">Primary winter sources:</span>
              {location.primarySources.map((src) => (
                <span
                  key={src}
                  className="rounded-md border border-slate-800 bg-slate-950/70 px-2 py-0.5 text-slate-300"
                >
                  {src}
                </span>
              ))}
            </div>
          </section>

          {/* 24h Inversion Chart */}
          <InversionChart
            points={location.hourlyPattern}
            bestWindowLabel={plan.bestVentilationWindow.windowLabel}
            baselineIndoorPm25={plan.baselineIndoorPm25}
          />

          {/* Live Impact Simulator */}
          <ImpactDashboard
            simulation={simulation}
            selectedCount={selectedIds.length}
            totalCount={allItems.length}
            communityFamilies={communityFamilies}
            onCommunityFamiliesChange={setCommunityFamilies}
          />

          {/* Tabs Navigation */}
          <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/70 p-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 min-w-[130px] inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition cursor-pointer ${
                    active
                      ? 'bg-teal-500 text-slate-950 shadow'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono-num ${
                        active ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Tab Content */}
          {activeTab === 'routines' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-teal-900/50 bg-teal-950/20 px-4 py-2.5 text-xs text-teal-200">
                <span className="font-semibold">Optimal Fresh-Air Window: </span>
                {plan.bestVentilationWindow.windowLabel} (~{plan.bestVentilationWindow.outdoorPm25AtWindow} µg/m³) —{' '}
                {plan.bestVentilationWindow.reason}
              </div>
              {plan.routines.map((item) => (
                <RecommendationCard
                  key={item.id}
                  item={item}
                  selected={selectedIds.includes(item.id)}
                  onToggle={handleToggleItem}
                />
              ))}
            </div>
          )}

          {activeTab === 'iaq' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-sky-900/50 bg-sky-950/25 px-4 py-3 text-xs text-sky-100 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-sky-300">Room Filtration Sizing Formula: </span>
                  Your {profile.roomAreaSqm} m² main space requires{' '}
                  <span className="font-mono-num font-bold text-teal-300">{requiredCadr} m³/h CADR</span>{' '}
                  for 4.8 air changes/hour (ASHRAE/Lancet clean-air benchmark).
                </div>
              </div>
              {plan.iaqHacks.map((item) => (
                <RecommendationCard
                  key={item.id}
                  item={item}
                  selected={selectedIds.includes(item.id)}
                  onToggle={handleToggleItem}
                />
              ))}
            </div>
          )}

          {activeTab === 'sustainable' && (
            <div className="space-y-3">
              {plan.sustainableAlternatives.map((item) => (
                <RecommendationCard
                  key={item.id}
                  item={item}
                  selected={selectedIds.includes(item.id)}
                  onToggle={handleToggleItem}
                />
              ))}
            </div>
          )}

          {activeTab === 'community' && (
            <div className="space-y-4">
              {plan.communityActions.map((item) => (
                <RecommendationCard
                  key={item.id}
                  item={item}
                  selected={selectedIds.includes(item.id)}
                  onToggle={handleToggleItem}
                />
              ))}

              {/* Shareable Neighbor Draft */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      Ready-to-Share Neighborhood Message
                    </h3>
                    <p className="text-xs text-slate-400">
                      Channel: {plan.communityMessageDraft.channel} · Tailored to {location.name} AQI {location.aqi}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyDraft()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-teal-500/50 bg-teal-500/15 px-3 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/25 transition cursor-pointer"
                  >
                    {copiedDraft ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedDraft ? 'Copied!' : 'Copy Message'}
                  </button>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-3 text-xs text-slate-200 space-y-2 whitespace-pre-wrap leading-relaxed">
                  <div className="font-semibold text-teal-300">{plan.communityMessageDraft.subject}</div>
                  <div>{plan.communityMessageDraft.body}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <ChatAssistant
              messages={chatMessages}
              isSending={isChatSending}
              onSend={(text) => void handleSendChat(text)}
            />
          )}
        </div>
      </main>

      <GeminiKeyModal
        isOpen={isKeyModalOpen}
        currentKey={geminiKey}
        currentModel={geminiModel}
        serverHasEnvKey={serverHasEnvKey}
        onSave={handleSaveKey}
        onClose={() => setIsKeyModalOpen(false)}
      />
    </div>
  );
}

export default App;
