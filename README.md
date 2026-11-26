# AeroKin — GenAI Winter Smog & Clean Air Assistant

AeroKin helps families and communities navigate severe winter smog and urban air pollution by generating tailored low-emission daily routines, indoor air quality (IAQ) hacks, sustainable household/commute swaps, and transparent exposure-to-impact explanations.

## Features

- **Location & Winter Thermal Inversion Modeling**: Includes presets for severe winter smog regions (Delhi-NCR, Lahore, Kraków, Salt Lake Valley, Milan/Po Valley, London) plus custom cities and optional live Open-Meteo air quality/meteorology syncing.
- **Dual-Mode GenAI Engine**:
  - **Live Gemini AI** (`gemini-3.8-flash` via the Gemini Interactions API by default): Configure `GEMINI_API_KEY` in `.env` or connect a session key in the UI for generative tailored plans and conversational Q&A.
  - **Scientific Smog & IAQ Engine (Built-in Fallback)**: Works immediately offline or without an API key using US EPA AQI breakpoints, box-model indoor infiltration estimates, and ASHRAE CADR sizing.
- **Low-Emission Daily Routines**: Morning, Midday (inversion break window), Evening, and Night sleep-zone actions with step-by-step instructions.
- **Indoor Air Quality (IAQ) Hacks**: Room-sized Corsi-Rosenthal DIY air cleaner CADR calculations, wet-mopping protocols, and draft sealing.
- **Sustainable Community Alternatives**: Carpool/transit cold-start shifts, clean cooking/heating transitions, zero-burn yard waste pledges, and ready-to-copy neighborhood/school parent messages.
- **Direct Choice-to-Impact Simulator**: Real-time calculation of indoor PM2.5 reduction, WHO guideline ratio, weekly cigarette-equivalents avoided, and a Community Ripple slider (1–500 households).

## Quick Start

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

### Optional: Enable Live Gemini AI

Copy `.env.example` to `.env` and add your key:

```env
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-3.8-flash
PORT=3001
```

Or click **Connect Gemini Key** in the top navigation bar to supply a session key in the browser.

## Scripts

- `npm run dev` — Run Express API and Vite dev server together
- `npm run build` — Build frontend (`dist/`) and server (`dist-server/`)
- `npm start` — Serve production build from `dist-server/server/index.js`
- `npm test` — Run unit and API route tests
- `npm run typecheck` — Run TypeScript typechecking
