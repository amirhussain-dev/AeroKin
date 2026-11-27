import assert from 'node:assert/strict';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  buildScientificPlan,
  calculateBaselineIndoorPm25,
  calculateRequiredCadr,
  DEFAULT_PROFILE,
  pm25ToUsAqi,
  resolveLocation,
  simulateImpact,
} from '../shared/smogEngine.ts';
import { createApp } from '../server/index.ts';
import {
  extractTextFromGeminiPayload,
  parseJsonLenient,
} from '../server/geminiService.ts';
import { clearOpenMeteoCaches } from '../server/airQualityService.ts';

/**
 * Dispatches an in-memory HTTP request through the Express app without binding a TCP socket.
 */
async function invokeApp(
  app: ReturnType<typeof createApp>,
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const rawBody = body !== undefined ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const socket = new PassThrough() as unknown as http.IncomingMessage['socket'];
    (socket as unknown as { remoteAddress: string }).remoteAddress = '127.0.0.1';

    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = rawBody
      ? {
          'content-type': 'application/json',
          'content-length': String(rawBody.length),
          ...headers,
        }
      : { ...headers };

    const res = new http.ServerResponse(req);
    const chunks: Buffer[] = [];

    res.write = ((chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    }) as http.ServerResponse['write'];

    res.end = ((chunk?: Buffer | string) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve({
          status: res.statusCode,
          json: text ? (JSON.parse(text) as Record<string, unknown>) : {},
        });
      } catch (err) {
        reject(err);
      }
      return res;
    }) as http.ServerResponse['end'];

    app(req, res);

    queueMicrotask(() => {
      if (rawBody) {
        req.push(rawBody);
      }
      req.push(null);
    });
  });
}

test('pm25ToUsAqi maps standard EPA breakpoints accurately', () => {
  assert.equal(pm25ToUsAqi(9), 50);
  assert.equal(pm25ToUsAqi(35.4), 100);
  assert.equal(pm25ToUsAqi(150), 225);
  assert.ok(pm25ToUsAqi(235) > 300);
});

test('calculateRequiredCadr scales linearly with room area for 4.8 ACH', () => {
  assert.equal(calculateRequiredCadr(35), 437);
  assert.equal(calculateRequiredCadr(20), 250);
});

test('indoor baseline PM2.5 reflects HEPA purifier and solid-fuel cooking', () => {
  const location = resolveLocation(DEFAULT_PROFILE);
  const draftyNoHepa = calculateBaselineIndoorPm25(
    { ...DEFAULT_PROFILE, hasHepaPurifier: false, cookingSource: 'lpg_piped_gas' },
    location
  );
  const withHepa = calculateBaselineIndoorPm25(
    { ...DEFAULT_PROFILE, hasHepaPurifier: true, cookingSource: 'induction_electric' },
    location
  );
  const biomassStove = calculateBaselineIndoorPm25(
    { ...DEFAULT_PROFILE, hasHepaPurifier: false, cookingSource: 'biomass_solid' },
    location
  );

  assert.ok(withHepa < draftyNoHepa);
  assert.ok(biomassStove > draftyNoHepa);
});

test('buildScientificPlan and simulateImpact compute realistic exposure & community ripple reductions', () => {
  const profile = { ...DEFAULT_PROFILE, locationId: 'lahore', commuteMode: 'car_solo' as const };
  const plan = buildScientificPlan(profile);

  assert.equal(plan.routines.length, 4);
  assert.equal(plan.iaqHacks.length, 3);
  assert.equal(plan.sustainableAlternatives.length, 3);
  assert.equal(plan.communityActions.length, 2);
  assert.ok(plan.communityMessageDraft.body.includes('Lahore'));

  const selectedIds = [
    plan.routines[1].id,
    plan.iaqHacks[0].id,
    plan.sustainableAlternatives[0].id,
  ];
  const singleFamily = simulateImpact(profile, plan, selectedIds, 1);
  const neighborhood = simulateImpact(profile, plan, selectedIds, 100);

  assert.ok(singleFamily.projectedIndoorPm25 < singleFamily.baselineIndoorPm25);
  assert.ok(singleFamily.indoorDropPct >= 40);
  assert.ok(singleFamily.cigaretteEquivalentsAvoidedPerWeek > 0);
  assert.equal(
    neighborhood.communityRippleCo2eKgPerMonth,
    singleFamily.householdCo2eSavedKgPerMonth * 100
  );
});

test('Express API endpoints respond cleanly for health, plan, simulate, and chat', async () => {
  const app = createApp();

  const healthRes = await invokeApp(app, 'GET', '/api/health');
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.json.ok, true);

  const planRes = await invokeApp(app, 'POST', '/api/plan', {
    profile: { ...DEFAULT_PROFILE, locationId: 'krakow', heatingSource: 'wood_coal_stove' },
    useLiveFeed: false,
  });
  assert.equal(planRes.status, 200);
  const planBody = planRes.json as {
    location: { name: string };
    plan: ReturnType<typeof buildScientificPlan>;
  };
  assert.equal(planBody.location.name, 'Kraków');
  assert.equal(planBody.plan.routines.length, 4);

  const simRes = await invokeApp(app, 'POST', '/api/simulate', {
    profile: DEFAULT_PROFILE,
    plan: planBody.plan,
    selectedIds: [planBody.plan.iaqHacks[0].id],
    communityFamiliesCount: 50,
  });
  assert.equal(simRes.status, 200);
  assert.ok((simRes.json as { indoorDropPct: number }).indoorDropPct > 0);

  const chatRes = await invokeApp(app, 'POST', '/api/chat', {
    profile: DEFAULT_PROFILE,
    location: planBody.location,
    plan: planBody.plan,
    history: [],
    message: 'How do I build a cheap DIY air purifier?',
  });
  assert.equal(chatRes.status, 200);
  const chatBody = chatRes.json as { reply: { content: string; impactCallout?: unknown } };
  assert.ok(chatBody.reply.content.includes('Corsi-Rosenthal'));
  assert.ok(Boolean(chatBody.reply.impactCallout));
});

test('Gemini Interactions API payload extractor and lenient JSON parser handle steps and fences', () => {
  const interactionsPayload = {
    id: 'v1_test',
    status: 'completed',
    steps: [
      { type: 'thought', signature: 'sig' },
      {
        type: 'model_output',
        content: [{ type: 'text', text: '```json\n{"situationBrief":"Smog alert","ok":true}\n```' }],
      },
    ],
  };

  const extracted = extractTextFromGeminiPayload(interactionsPayload);
  const parsed = parseJsonLenient<{ situationBrief: string; ok: boolean }>(extracted);
  assert.equal(parsed.situationBrief, 'Smog alert');
  assert.equal(parsed.ok, true);

  const legacyPayload = {
    candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
  };
  assert.equal(extractTextFromGeminiPayload(legacyPayload), '{"ok":true}');
});

test('POST /api/plan rejects invalid profile payloads with 400', async () => {
  const app = createApp();

  const nonObjectRes = await invokeApp(app, 'POST', '/api/plan', {
    profile: 'not-an-object',
  });
  assert.equal(nonObjectRes.status, 400);
  assert.match(String(nonObjectRes.json.error), /Invalid profile/);

  const badRoomRes = await invokeApp(app, 'POST', '/api/plan', {
    profile: { ...DEFAULT_PROFILE, roomAreaSqm: -10 },
  });
  assert.equal(badRoomRes.status, 400);
  assert.match(String(badRoomRes.json.error), /roomAreaSqm/);

  const badHouseholdRes = await invokeApp(app, 'POST', '/api/plan', {
    profile: { ...DEFAULT_PROFILE, householdSize: 0 },
  });
  assert.equal(badHouseholdRes.status, 400);
  assert.match(String(badHouseholdRes.json.error), /householdSize/);

  const badPm25Res = await invokeApp(app, 'POST', '/api/plan', {
    profile: { ...DEFAULT_PROFILE, pm25Override: -5 },
  });
  assert.equal(badPm25Res.status, 400);
  assert.match(String(badPm25Res.json.error), /pm25Override/);
});

test('POST /api/plan and /api/chat fall back to scientific engine when mocked Gemini API fails', async (t) => {
  const app = createApp();
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    return new Response(
      JSON.stringify({ error: { message: 'Mocked Gemini 503 outage' } }),
      {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }
    );
  });

  const planRes = await invokeApp(
    app,
    'POST',
    '/api/plan',
    {
      profile: { ...DEFAULT_PROFILE, locationId: 'delhi' },
      useLiveFeed: false,
    },
    { 'x-gemini-api-key': 'mock-test-key' }
  );

  assert.equal(planRes.status, 200);
  const planBody = planRes.json as {
    location: { name: string };
    plan: ReturnType<typeof buildScientificPlan>;
    warning?: string;
  };
  assert.equal(planBody.plan.source, 'scientific_engine');
  assert.equal(planBody.plan.routines.length, 4);
  assert.match(String(planBody.warning), /Gemini unavailable \(Mocked Gemini 503 outage\)/);

  const chatRes = await invokeApp(
    app,
    'POST',
    '/api/chat',
    {
      profile: DEFAULT_PROFILE,
      location: planBody.location,
      plan: planBody.plan,
      history: [],
      message: 'How do I build a cheap DIY air purifier?',
    },
    { 'x-gemini-api-key': 'mock-test-key' }
  );

  assert.equal(chatRes.status, 200);
  const chatBody = chatRes.json as {
    reply: { source: string; content: string };
    warning?: string;
  };
  assert.equal(chatBody.reply.source, 'scientific_engine');
  assert.ok(chatBody.reply.content.includes('Corsi-Rosenthal'));
  assert.match(String(chatBody.warning), /Gemini chat fallback \(Mocked Gemini 503 outage\)/);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('Open-Meteo live feed deduplicates concurrent/repeated fetches without leaking pm25Override or caching errors', async (t) => {
  clearOpenMeteoCaches();
  const app = createApp();
  let aqCalls = 0;
  let wxCalls = 0;
  let shouldFail = false;

  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (shouldFail) {
      return new Response(JSON.stringify({ error: 'Open-Meteo down' }), { status: 500 });
    }
    if (url.includes('air-quality-api.open-meteo.com')) {
      aqCalls++;
      return new Response(
        JSON.stringify({
          current: { pm2_5: 218, pm10: 340, us_aqi: 268 },
          hourly: {
            time: Array.from({ length: 24 }, (_, i) => `2026-11-27T${String(i).padStart(2, '0')}:00`),
            pm2_5: Array.from({ length: 24 }, (_, i) => (i >= 12 && i <= 15 ? 115 : 240)),
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (url.includes('api.open-meteo.com/v1/forecast')) {
      wxCalls++;
      return new Response(
        JSON.stringify({ current: { temperature_2m: 11, relative_humidity_2m: 78, wind_speed_10m: 4 } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  // Two concurrent live-feed plan requests for Delhi-NCR should share one upstream Open-Meteo fetch pair
  const [res1, res2] = await Promise.all([
    invokeApp(app, 'POST', '/api/plan', {
      profile: { ...DEFAULT_PROFILE, locationId: 'delhi', roomAreaSqm: 40 },
      useLiveFeed: true,
    }),
    invokeApp(app, 'POST', '/api/plan', {
      profile: { ...DEFAULT_PROFILE, locationId: 'delhi', roomAreaSqm: 45, pm25Override: 180 },
      useLiveFeed: true,
    }),
  ]);

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);
  assert.equal(aqCalls, 1);
  assert.equal(wxCalls, 1);
  assert.equal((res1.json.location as { pm25: number }).pm25, 218);
  assert.equal((res2.json.location as { pm25: number }).pm25, 180);

  // Subsequent request for Delhi-NCR with different household size hits the coordinate cache (0 extra upstream calls)
  const res3 = await invokeApp(app, 'POST', '/api/plan', {
    profile: { ...DEFAULT_PROFILE, locationId: 'delhi', householdSize: 6 },
    useLiveFeed: true,
  });
  assert.equal(res3.status, 200);
  assert.equal(aqCalls, 1);
  assert.equal(wxCalls, 1);

  // Errors are not cached: when upstream fails, fallback model is returned and next healthy call retries Open-Meteo
  clearOpenMeteoCaches();
  shouldFail = true;
  const errRes = await invokeApp(app, 'POST', '/api/plan', {
    profile: { ...DEFAULT_PROFILE, locationId: 'delhi' },
    useLiveFeed: true,
  });
  assert.equal(errRes.status, 200);
  assert.match(String(errRes.json.airFeedNote), /curated regional winter smog model/i);

  shouldFail = false;
  const recoveredRes = await invokeApp(app, 'POST', '/api/plan', {
    profile: { ...DEFAULT_PROFILE, locationId: 'delhi' },
    useLiveFeed: true,
  });
  assert.equal(recoveredRes.status, 200);
  assert.equal((recoveredRes.json.location as { isLive?: boolean }).isLive, true);
  assert.equal(aqCalls, 2);
  assert.equal(wxCalls, 2);
  clearOpenMeteoCaches();
});

test('local simulateImpact matches /api/simulate across rapid slider values and invalid profiles fail cleanly', async () => {
  const app = createApp();
  const profile = { ...DEFAULT_PROFILE, locationId: 'delhi', roomAreaSqm: 40 };
  const plan = buildScientificPlan(profile);
  const selectedIds = [plan.routines[0].id, plan.iaqHacks[0].id];

  const sliderValues = [1, 25, 75, 150, 300, 500];
  const localSimResults = sliderValues.map((count) => simulateImpact(profile, plan, selectedIds, count));
  const finalLocal = localSimResults[localSimResults.length - 1];

  const serverRes = await invokeApp(app, 'POST', '/api/simulate', {
    profile,
    plan,
    selectedIds,
    communityFamiliesCount: 500,
  });
  assert.equal(serverRes.status, 200);
  assert.deepEqual(serverRes.json, finalLocal);

  const badSimRes = await invokeApp(app, 'POST', '/api/simulate', {
    profile: { ...profile, roomAreaSqm: -5 },
    plan,
    selectedIds,
    communityFamiliesCount: 25,
  });
  assert.equal(badSimRes.status, 400);
  assert.match(String(badSimRes.json.error), /roomAreaSqm/);

  const badChatRes = await invokeApp(app, 'POST', '/api/chat', {
    profile: 'invalid-profile',
    plan,
    message: 'hello',
  });
  assert.equal(badChatRes.status, 400);
  assert.match(String(badChatRes.json.error), /Invalid profile/);
});
