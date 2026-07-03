# Session Mirror

## Music Scan Development Setup

The **Scan Music** feature (Practice tab) uses AI vision to draft programmable metronome routines from photos or PDFs. Environment handling is strict: local dev may call OpenAI directly; production must use a backend.

### Scan modes

The app logs one of these to the browser console:

| Console message | When |
|-----------------|------|
| `Music Scan: Backend Mode` | `VITE_MUSIC_SCAN_API_URL` is set |
| `Music Scan: Local Development Mode` | Dev server + `VITE_OPENAI_API_KEY` in `.env.local` |
| `Music Scan: Demo Mode` | No backend URL and no usable local key |

Backend mode **always takes precedence** over direct OpenAI calls.

### 1. Local testing (your machine only)

Copy `.env.local.example` to `.env.local` (already gitignored via `*.local`):

```env
VITE_OPENAI_API_KEY=sk-...
VITE_MUSIC_SCAN_MODEL=gpt-4o
```

Then run the dev server:

```bash
npm run dev
```

- Keys are read only when `import.meta.env.DEV` is true.
- Console warns that `VITE_OPENAI_API_KEY` must never ship in production builds.

### 2. Production

Point the app at your scan backend (recommended architecture):

```env
VITE_MUSIC_SCAN_API_URL=https://your-backend-url.com/scan-music
```

The backend should own:

- OpenAI API key
- Model selection
- Rate limiting
- Validation
- Response normalization

The client POSTs `{ prompt, pages: [{ page, image }] }` and expects JSON with a `sections` array (or `{ result: { sections } }`).

### On-device testing (production builds)

If your TestFlight or device build includes `VITE_OPENAI_API_KEY` (not recommended for release):

1. Open **Settings → Experimental → Music Scan Dev Mode**
2. Scan Music will use the bundled key on that device only
3. **Disable before App Store release**


**Do not** set `VITE_OPENAI_API_KEY` in production CI, App Store build pipelines, or hosted deploy env vars.

If a production bundle includes `VITE_OPENAI_API_KEY`:

- Real scanning is **disabled** (falls back to demo mode).
- The console warns: *Frontend API keys are not allowed in production.*

### Files

| Path | Role |
|------|------|
| `src/practiceTimeline/scan/musicScanConfig.ts` | Mode resolution, prod guards, logging |
| `src/practiceTimeline/scan/musicScanClient.ts` | Backend / local OpenAI / demo routing |
| `.env.local.example` | Local dev template |
