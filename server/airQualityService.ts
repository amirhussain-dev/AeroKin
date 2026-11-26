import {
  buildWinterHourlyCurve,
  pm25ToUsAqi,
  resolveLocation,
} from '../shared/smogEngine.ts';
import type { HouseholdProfile, HourlySmogPoint, LocationProfile } from '../shared/types.ts';

interface LiveLookupResult {
  live: boolean;
  location: LocationProfile;
  note: string;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 4500): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodeCity(city: string): Promise<{ name: string; country: string; lat: number; lon: number } | null> {
  const q = encodeURIComponent(city.trim());
  if (!q) return null;
  try {
    const data = (await fetchJsonWithTimeout(
      `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`
    )) as { results?: Array<{ name: string; country?: string; latitude: number; longitude: number }> };
    const hit = data.results?.[0];
    if (!hit) return null;
    return {
      name: hit.name,
      country: hit.country ?? '',
      lat: hit.latitude,
      lon: hit.longitude,
    };
  } catch {
    return null;
  }
}

export async function fetchLiveAirQuality(profile: HouseholdProfile): Promise<LiveLookupResult> {
  const fallback = resolveLocation(profile);
  let targetLat = fallback.lat;
  let targetLon = fallback.lon;
  let displayName = fallback.name;
  let regionLabel = fallback.regionLabel;

  if (profile.locationId === 'custom' && profile.customCity.trim()) {
    const geo = await geocodeCity(profile.customCity);
    if (geo) {
      targetLat = geo.lat;
      targetLon = geo.lon;
      displayName = geo.country ? `${geo.name}, ${geo.country}` : geo.name;
      regionLabel = 'Live Coordinates · Urban Air Quality Feed';
    }
  }

  try {
    const aqUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${targetLat}&longitude=${targetLon}` +
      `&current=pm10,pm2_5,us_aqi&hourly=pm2_5&forecast_days=1&timezone=auto`;
    const wxUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${targetLat}&longitude=${targetLon}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`;

    const [aqData, wxData] = (await Promise.all([
      fetchJsonWithTimeout(aqUrl),
      fetchJsonWithTimeout(wxUrl),
    ])) as [
      {
        current?: { pm2_5?: number; pm10?: number; us_aqi?: number };
        hourly?: { time?: string[]; pm2_5?: number[] };
      },
      {
        current?: { temperature_2m?: number; relative_humidity_2m?: number; wind_speed_10m?: number };
      }
    ];

    const livePm25 = Math.max(2, Math.round(aqData.current?.pm2_5 ?? fallback.pm25));
    const effectivePm25 =
      profile.pm25Override !== null && Number.isFinite(profile.pm25Override)
        ? Math.max(5, Math.min(600, Math.round(profile.pm25Override)))
        : livePm25;

    const livePm10 = Math.max(effectivePm25, Math.round(aqData.current?.pm10 ?? effectivePm25 * 1.45));
    const tempC = Math.round(wxData.current?.temperature_2m ?? fallback.tempC);
    const windKmh = Math.round(wxData.current?.wind_speed_10m ?? fallback.windKmh);
    const humidity = Math.round(wxData.current?.relative_humidity_2m ?? fallback.humidity);

    const inversionRisk: LocationProfile['inversionRisk'] =
      effectivePm25 >= 150 || (windKmh <= 5 && tempC <= 12 && effectivePm25 >= 65)
        ? 'Severe'
        : effectivePm25 >= 65 || (windKmh <= 7 && tempC <= 10)
          ? 'High'
          : effectivePm25 >= 35
            ? 'Moderate'
            : 'Low';

    let hourlyPattern: HourlySmogPoint[] = buildWinterHourlyCurve(effectivePm25, inversionRisk);
    const hourlyTimes = aqData.hourly?.time ?? [];
    const hourlyPm25 = aqData.hourly?.pm2_5 ?? [];

    if (hourlyTimes.length >= 24 && hourlyPm25.length >= 24 && profile.pm25Override === null) {
      const sampleHours = [0, 3, 6, 9, 12, 15, 18, 21];
      hourlyPattern = sampleHours.map((h) => {
        const val = Math.max(4, Math.round(hourlyPm25[h] ?? effectivePm25));
        const suffix = h >= 12 ? 'PM' : 'AM';
        const hr = h % 12 === 0 ? 12 : h % 12;
        return {
          hour: h,
          label: `${hr} ${suffix}`,
          pm25: val,
          inversionActive: h < 11 || h >= 17,
        };
      });
    }

    const liveLocation: LocationProfile = {
      ...fallback,
      name: displayName,
      regionLabel,
      lat: targetLat,
      lon: targetLon,
      pm25: effectivePm25,
      pm10: livePm10,
      aqi: pm25ToUsAqi(effectivePm25),
      tempC,
      windKmh,
      humidity,
      inversionRisk,
      hourlyPattern,
      isLive: true,
    };

    return {
      live: true,
      location: liveLocation,
      note: 'Synced with live Open-Meteo air quality & meteorology.',
    };
  } catch {
    return {
      live: false,
      location: fallback,
      note: 'Using curated regional winter smog model (live weather/AQI feed unreachable).',
    };
  }
}
