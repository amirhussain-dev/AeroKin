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

/**
 * Dispatches an in-memory HTTP request through the Express app without binding a TCP socket.
 */
async function invokeApp(
  app: ReturnType<typeof createApp>,
  method: string,
  url: string,
  body?: unknown
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
        }
      : {};

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
