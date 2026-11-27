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

class ValidationError extends Error {}

function extractGeminiHeaders(req: express.Request): { apiKey: string; model: string } {
  const apiKey =
    typeof req.headers['x-gemini-api-key'] === 'string' ? req.headers['x-gemini-api-key'].trim() : '';
  const rawModel =
    typeof req.headers['x-gemini-model'] === 'string' ? req.headers['x-gemini-model'].trim() : '';
  return {
    apiKey,
    model: rawModel || DEFAULT_GEMINI_MODEL,
  };
}

function parseProfile(rawProfile: unknown): HouseholdProfile {
  if (
    rawProfile !== undefined &&
    (typeof rawProfile !== 'object' || rawProfile === null || Array.isArray(rawProfile))
  ) {
    throw new ValidationError('Invalid profile: expected an object');
  }

  const profile: HouseholdProfile = {
    ...DEFAULT_PROFILE,
    ...((rawProfile as Partial<HouseholdProfile> | undefined) || {}),
  };

  if (typeof profile.roomAreaSqm !== 'number' || !Number.isFinite(profile.roomAreaSqm) || profile.roomAreaSqm <= 0) {
    throw new ValidationError('Invalid roomAreaSqm: must be a positive number');
  }
  if (typeof profile.householdSize !== 'number' || !Number.isFinite(profile.householdSize) || profile.householdSize < 1) {
    throw new ValidationError('Invalid householdSize: must be at least 1');
  }
  if (
    typeof profile.commuteKmRoundTrip !== 'number' ||
    !Number.isFinite(profile.commuteKmRoundTrip) ||
    profile.commuteKmRoundTrip < 0
  ) {
    throw new ValidationError('Invalid commuteKmRoundTrip: must be a non-negative number');
  }
  if (
    profile.pm25Override !== null &&
    (typeof profile.pm25Override !== 'number' || !Number.isFinite(profile.pm25Override) || profile.pm25Override < 0)
  ) {
    throw new ValidationError('Invalid pm25Override: must be null or a non-negative number');
  }

  return profile;
}

function sendRouteError(res: express.Response, err: unknown, fallbackMessage: string): void {
  const status = err instanceof ValidationError ? 400 : 500;
  res.status(status).json({
    error: err instanceof Error ? err.message : fallbackMessage,
  });
}

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    const { apiKey, model } = extractGeminiHeaders(req);
    const hasEnvKey = Boolean(process.env.GEMINI_API_KEY?.trim());
    res.json({
      ok: true,
      geminiConfigured: hasEnvKey || Boolean(apiKey),
      geminiSource: apiKey ? 'session' : hasEnvKey ? 'env' : 'none',
      model,
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
      const profile = parseProfile(req.body?.profile);
      const useLiveFeed = Boolean(req.body?.useLiveFeed);
      const { apiKey, model } = extractGeminiHeaders(req);

      let location = resolveLocation(profile);
      let airFeedNote = 'Using curated regional winter smog model.';

      if (useLiveFeed) {
        const liveRes = await fetchLiveAirQuality(profile);
        location = liveRes.location;
        airFeedNote = liveRes.note;
      }

      const { plan, warning } = await generateTailoredPlan(profile, location, apiKey || undefined, model);
      res.json({
        location,
        plan,
        airFeedNote,
        warning,
      });
    } catch (err) {
      sendRouteError(res, err, 'Failed to generate plan');
    }
  });

  app.post('/api/simulate', (req, res) => {
    try {
      const profile = parseProfile(req.body?.profile);
      const plan = req.body?.plan as AssistantPlan | undefined;
      const selectedIds = Array.isArray(req.body?.selectedIds) ? (req.body.selectedIds as string[]) : [];
      const communityFamiliesCount =
        typeof req.body?.communityFamiliesCount === 'number' && Number.isFinite(req.body.communityFamiliesCount)
          ? req.body.communityFamiliesCount
          : 25;

      if (!plan || typeof plan !== 'object') {
        throw new ValidationError('Missing plan in request body');
      }

      const result = simulateImpact(profile, plan, selectedIds, communityFamiliesCount);
      res.json(result);
    } catch (err) {
      sendRouteError(res, err, 'Failed to simulate impact');
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const profile = parseProfile(req.body?.profile);
      const location = req.body?.location || resolveLocation(profile);
      const plan = req.body?.plan as AssistantPlan | undefined;
      const history = Array.isArray(req.body?.history) ? (req.body.history as ChatMessage[]) : [];
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

      if (!message) {
        throw new ValidationError('Message cannot be empty');
      }
      if (!plan || typeof plan !== 'object') {
        throw new ValidationError('Plan context is required');
      }

      const { apiKey, model } = extractGeminiHeaders(req);
      const { reply, warning } = await generateChatResponse(
        profile,
        location,
        plan,
        history,
        message,
        apiKey || undefined,
        model
      );
      res.json({ reply, warning });
    } catch (err) {
      sendRouteError(res, err, 'Failed to generate chat response');
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
