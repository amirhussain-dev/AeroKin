import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PROFILE,
  LOCATION_PRESETS,
  resolveLocation,
  simulateImpact,
} from '../shared/smogEngine.ts';
import type {
  AssistantPlan,
  ChatMessage,
  HouseholdProfile,
} from '../shared/types.ts';
import { fetchLiveAirQuality } from './airQualityService.ts';
import {
  DEFAULT_GEMINI_MODEL,
  generateChatResponse,
  generateTailoredPlan,
} from './geminiService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    const headerKey = typeof req.headers['x-gemini-api-key'] === 'string' ? req.headers['x-gemini-api-key'].trim() : '';
    const headerModel = typeof req.headers['x-gemini-model'] === 'string' ? req.headers['x-gemini-model'].trim() : '';
    const hasEnvKey = Boolean(process.env.GEMINI_API_KEY?.trim());
    res.json({
      ok: true,
      geminiConfigured: hasEnvKey || Boolean(headerKey),
      geminiSource: headerKey ? 'session' : hasEnvKey ? 'env' : 'none',
      model: headerModel || DEFAULT_GEMINI_MODEL,
    });
  });

  app.get('/api/presets', (_req, res) => {
    res.json({
      locations: LOCATION_PRESETS,
      defaultProfile: DEFAULT_PROFILE,
    });
  });

  app.post('/api/plan', async (req, res) => {
    try {
      const rawProfile = req.body?.profile;
      if (
        rawProfile !== undefined &&
        (typeof rawProfile !== 'object' || rawProfile === null || Array.isArray(rawProfile))
      ) {
        res.status(400).json({ error: 'Invalid profile: expected an object' });
        return;
      }

      const profile: HouseholdProfile = {
        ...DEFAULT_PROFILE,
        ...(rawProfile || {}),
      };

      if (typeof profile.roomAreaSqm !== 'number' || !Number.isFinite(profile.roomAreaSqm) || profile.roomAreaSqm <= 0) {
        res.status(400).json({ error: 'Invalid roomAreaSqm: must be a positive number' });
        return;
      }
      if (typeof profile.householdSize !== 'number' || !Number.isFinite(profile.householdSize) || profile.householdSize < 1) {
        res.status(400).json({ error: 'Invalid householdSize: must be at least 1' });
        return;
      }
      if (
        typeof profile.commuteKmRoundTrip !== 'number' ||
        !Number.isFinite(profile.commuteKmRoundTrip) ||
        profile.commuteKmRoundTrip < 0
      ) {
        res.status(400).json({ error: 'Invalid commuteKmRoundTrip: must be a non-negative number' });
        return;
      }
      if (
        profile.pm25Override !== null &&
        (typeof profile.pm25Override !== 'number' || !Number.isFinite(profile.pm25Override) || profile.pm25Override < 0)
      ) {
        res.status(400).json({ error: 'Invalid pm25Override: must be null or a non-negative number' });
        return;
      }
      const useLiveFeed = Boolean(req.body?.useLiveFeed);
      const headerKey =
        typeof req.headers['x-gemini-api-key'] === 'string' ? req.headers['x-gemini-api-key'] : undefined;
      const headerModel =
        typeof req.headers['x-gemini-model'] === 'string' && req.headers['x-gemini-model'].trim()
          ? req.headers['x-gemini-model'].trim()
          : DEFAULT_GEMINI_MODEL;

      let location = resolveLocation(profile);
      let airFeedNote = 'Using curated regional winter smog model.';

      if (useLiveFeed) {
        const liveRes = await fetchLiveAirQuality(profile);
        location = liveRes.location;
        airFeedNote = liveRes.note;
      }

      const { plan, warning } = await generateTailoredPlan(profile, location, headerKey, headerModel);
      res.json({
        location,
        plan,
        airFeedNote,
        warning,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate plan',
      });
    }
  });

  app.post('/api/simulate', (req, res) => {
    try {
      const profile: HouseholdProfile = {
        ...DEFAULT_PROFILE,
        ...(req.body?.profile || {}),
      };
      const plan = req.body?.plan as AssistantPlan | undefined;
      const selectedIds = Array.isArray(req.body?.selectedIds) ? (req.body.selectedIds as string[]) : [];
      const communityFamiliesCount =
        typeof req.body?.communityFamiliesCount === 'number' ? req.body.communityFamiliesCount : 25;

      if (!plan) {
        res.status(400).json({ error: 'Missing plan in request body' });
        return;
      }

      const result = simulateImpact(profile, plan, selectedIds, communityFamiliesCount);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to simulate impact',
      });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const profile: HouseholdProfile = {
        ...DEFAULT_PROFILE,
        ...(req.body?.profile || {}),
      };
      const location = req.body?.location || resolveLocation(profile);
      const plan = req.body?.plan as AssistantPlan;
      const history = Array.isArray(req.body?.history) ? (req.body.history as ChatMessage[]) : [];
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

      if (!message) {
        res.status(400).json({ error: 'Message cannot be empty' });
        return;
      }
      if (!plan) {
        res.status(400).json({ error: 'Plan context is required' });
        return;
      }

      const headerKey =
        typeof req.headers['x-gemini-api-key'] === 'string' ? req.headers['x-gemini-api-key'] : undefined;
      const headerModel =
        typeof req.headers['x-gemini-model'] === 'string' && req.headers['x-gemini-model'].trim()
          ? req.headers['x-gemini-model'].trim()
          : DEFAULT_GEMINI_MODEL;
      const { reply, warning } = await generateChatResponse(
        profile,
        location,
        plan,
        history,
        message,
        headerKey,
        headerModel
      );
      res.json({ reply, warning });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate chat response',
      });
    }
  });

  // Serve built frontend in production when dist/ exists
  const distPath = [
    path.resolve(__dirname, '../dist'),
    path.resolve(__dirname, '../../dist'),
  ].find((candidate) => fs.existsSync(candidate));
  if (distPath) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  const port = Number(process.env.PORT || 3001);
  const app = createApp();
  app.listen(port, () => {
    console.log(`AeroKin API server listening on http://localhost:${port}`);
  });
}
