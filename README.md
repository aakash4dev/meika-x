# MEIKA-X

**Every trend gets a trial before it gets a headline.**

MEIKA-X is a multi-agent, evidence-first trend detective for NASA Earth data. You ask a question about any place on Earth ("Is the Arctic warming faster than the rest of the world?", "Is the Sahel's rain coming back?") and eight agents open a case in a 3D room. They pull NASA data, measure the trend, test whether it is significant, cross-examine it, check fresh satellite imagery, test candidate drivers, estimate hazard odds and write a Case File in English and in the local language of the place (Spanish for Patagonia, Swahili for the Horn of Africa, Arabic for the Nile Delta, and so on). Every number they report lands in an evidence ledger and comes with an evidence grade from A to D.

Built by Team **Zentox** (Tushar Kumar, Aakash Singh Rajput) for the [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/), challenge [**Be An Earth System Trend Detective!**](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/).
Team page: https://www.spaceappschallenge.org/2026/find-a-team/zentox · Repo: https://github.com/aakash4dev/meika-x

---

## What it does

| Page | What you get |
|---|---|
| **Cases** (`/`) | Ask a question or tap a starter. Pick a variable and region, or let the Chief Detective choose. |
| **Command Center** (`/case/[id]`) | A walkable 3D lab. Eight scientists sit around a holographic NASA Blue Marble globe; six data terminals line the walls (NASA POWER, NASA GIBS, NASA EONET, NASA FIRMS, NASA CMR, Our AI). When an agent actually calls an API, it walks to that terminal, a data stream lights up, and it walks back. **Orbit view** to look around, **Walk the lab** to explore in first person (click to look, WASD, Shift to run, E to open a terminal, Q to leave). Click any terminal or scientist for its panel. |
| **Comms and Case File** (same page) | Live agent chat in which every data reference is an inline link to the exact NASA query used. Results panel (grade, trend, p-values, where it changes, hazard odds). The Case File drawer has the bilingual brief, chart, Skeptic tests, per-cell map, drivers, hazard odds, satellite images, an evidence ledger where each row links to its data, and every query grouped by terminal. |
| **Monitoring** (`/monitor`) | Watchlist of regions with automatic checks (heat, heavy rain, dry spell, new NASA EONET events, NASA FIRMS fires). Live world map of open EONET events. Alerts go to Telegram. |
| **Reports** (`/reports`) | Every case and every monitoring run is saved as a Markdown report, viewable and downloadable. |
| **Agents & system** (`/system`) | The agent roster (which parts are code and which use Claude), the rules of the room, and live status of every integration. |

### How it answers the challenge

| Challenge asks | MEIKA-X |
|---|---|
| Select variables from Earth missions or models | Catalogue of 12 NASA variables with plain-language definitions; Claude maps a free-text question to one (keyword fallback) |
| Acquire data for a region | NASA POWER monthly series over a grid of up to 4×4 cells, area-weighted |
| Visualise change over time | Raw and deseasonalised series, 12-month mean, trend line with 95% band |
| How much is it changing | OLS and Sen's slope per decade, % of baseline, total change, years-needed estimate, emergence year |
| Is it significant | t-test with autocorrelation-adjusted sample size (Santer et al. 2000), Mann-Kendall with Hamed-Rao correction, block-bootstrap interval |
| One variable can trend opposite ways in different places | **Opposite-story detector**: per-cell trends with Benjamini-Hochberg FDR, flag when significant rises and falls coexist |
| Audience: students and the public | Plain definitions, verdicts in one sentence, briefs in the local language of each region, one starter question per continent, replayable cases |

---

## The agent society

| Agent | Engine | Job | Tools |
|---|---|---|---|
| Chief Detective | code + **Claude** | Plans the case, routes work, writes the verdict | Claude (question → plan, rules fallback), NASA CMR catalogue search |
| Statistician | code | Trend, uncertainty, change point, emergence, per-cell map | OLS + adjusted t-test, Sen, Mann-Kendall (Hamed-Rao), moving-block bootstrap, Pettitt, BH-FDR |
| Satellite Witness | code + **Claude** | Fresh imagery and the event record | NASA GIBS MODIS true colour (today and a year ago), NASA EONET; Claude vision writes a labelled visual note |
| Driver Analyst | code | Candidate drivers and lags | Lead-lag correlation, partial correlation, Granger F-tests (association, not cause) |
| Skeptic | code | Tries to break the finding, assigns the grade | Start/end-year sweep, autocorrelation check, step test, leave-one-year-out, block-shuffle placebo, second-opinion variable, record length |
| Forecaster | code | Hazard odds for the coming days, then vs now | NASA POWER daily since 1991, analog climatology, Wilson intervals (not a weather forecast) |
| Exposure | code | What sits in the path | Region area, EONET events, FIRMS fires (with key), share of area with a significant trend |
| Narrator | **Claude** | Case File brief in English and the region's local language | Ledger rows only; an automated checker rejects any number not in the ledger (one retry, then a fixed template) |

In the chat and reports the AI is called **Our AI**; it runs on Anthropic Claude (see below).

**Rules of the room.** Numbers come from code; Claude never produces a figure. The Skeptic can lower a grade but not change data. Grade A needs an independent sensor dataset, so the current POWER-only build tops out at B. The bootstrap and placebo tests use fixed seeds, so the same case gives the same ledger.

---

## NASA data and APIs (no keys needed unless noted)

| Source | Used for | Endpoint |
|---|---|---|
| **NASA POWER** (MERRA-2, CERES SYN1deg) | Monthly series for trends; daily series for monitoring and the Forecaster | `power.larc.nasa.gov/api/temporal/{monthly,daily}/point` |
| **NASA EONET v3** | Natural events in a region; live event map; event alerts | `eonet.gsfc.nasa.gov/api/v3/events` |
| **NASA GIBS** | MODIS true-colour snapshots; Blue Marble globe texture | `gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi` |
| **NASA CMR** | Links each variable to its full-resolution NASA product (GPM IMERG, MERRA-2, GLDAS, SMAP, ...) | `cmr.earthdata.nasa.gov/search/collections.json` |
| **NASA FIRMS** *(free MAP_KEY)* | Active-fire detections for monitoring and Exposure | `firms.modaps.eosdis.nasa.gov/api/area/csv` |

Variables: air temperature, daily maximum temperature, precipitation, root-zone and surface soil wetness, relative and specific humidity, wind, aerosol optical depth, surface sunlight, cloud amount, skin temperature.

Regions: 22 preset regions on every continent, from the Arctic and Greenland to the Amazon, Sahel, Horn of Africa, Southern Africa, Europe, the Gulf, India, China, the Mekong, Borneo and Southeast Australia. NASA POWER is global, so a question about any other place gets its own bounding box (the Chief Detective sets it, at most 20 x 20 degrees).

All responses are cached on disk under `.data/cache`, so a demo keeps working when the venue Wi-Fi is bad.

---

## Data links

Every external query is recorded with its exact URL (`sources` on each case). Links appear inline in the chat, the Case File, the ledger, the Narrator's brief (it may cite only links it was given; anything else is stripped) and the Markdown reports. The regional series each case analysed is served as CSV at `/api/cases/{id}/data.csv`. FIRMS API URLs contain the private key, so FIRMS is linked through its public Fire Map instead.

## Database (Supabase)

MEIKA-X stores everything in **Supabase**: Postgres for data and Storage for images. The schema is in [`supabase/migrations/`](supabase/migrations/).

| Table / bucket | Holds |
|---|---|
| `cases` | One row per case: question, status, grade, region and the full record (`record jsonb`: transcript, ledger, results, brief). The `case_summaries` view serves lists without the heavy parts |
| `reports` | Case Files and monitoring reports (Markdown) |
| `watchlist`, `alerts`, `monitor_state` | Active monitoring |
| Storage bucket `case-images` | The two MODIS snapshots of each case |

- **Access:** Row Level Security is on for every table. Anyone can *read* cases, reports and monitoring results; all writes go through the Next.js server with the secret key (`src/lib/supabase/admin.ts`, server-only).
- **No accounts:** the site has no sign-up or login. Anyone can open cases, chat with Our AI and manage monitoring. Only the Next.js server talks to Supabase.
- **NASA response cache** stays on the local disk (`.data/cache`, or the temp folder on Vercel). It only speeds things up and is not app data.

## Where Claude is used, and what happens without it

| Feature | Needs AI? | Without Claude |
|---|---|---|
| Statistics, grades, maps, drivers, hazard odds, monitoring checks, alerts, reports | No (plain code) | Unchanged |
| Turning a free-text question into a plan | Claude | Keyword rules pick the variable and region |
| Narrator brief (English + local language) | Claude | Fixed English template built from the same ledger (plus Hindi for Indian regions) |
| Satellite Witness visual note | Claude (vision) | Images are shown without a note |
| One-paragraph summary of new monitoring alerts | Claude | Alerts are sent without a summary |

**How MEIKA-X reaches Claude** (in `src/lib/ai/claude.ts`):
1. If `ANTHROPIC_API_KEY` is set, it uses the Anthropic SDK (`claude-opus-5-5`, structured JSON output, server-side refusal fallbacks enabled). **A deployed site needs this.**
2. Otherwise it uses your **local Claude Code CLI** (`claude -p --json-schema ...`, no tools except reading the case's two images). This is the default on a laptop where `claude` is installed and logged in.
3. Otherwise, if `HF_TOKEN` is set, it uses **DeepSeek through Hugging Face Inference Providers** (`deepseek-ai/DeepSeek-V4.1-Flash` by default, `HF_MODEL` to change it). It asks for JSON matching the same schemas, and the same zod checks and number checks apply. DeepSeek is text-only here, so the Satellite Witness shows its images without a visual note.
4. Otherwise AI features switch off and the fallbacks in the table above take over.

---

## Run it

```bash
npm install
npm run db:start               # local Supabase in Docker (first run downloads images); applies the migrations
cp .env.example .env.local     # paste the API URL and Secret key that db:start printed
npm run db:import              # optional: copy an old .data/ JSON store into Supabase
npm run dev                    # http://localhost:3000
```

Local Supabase also gives you **Studio** at http://127.0.0.1:54323 to browse the tables. `npm run db:status` prints the URLs and keys again, `npm run db:reset` rebuilds the local database from the migrations (this deletes local data), and `npm run db:stop` shuts it down.

```bash
npm test          # stats engine cross-checked against scipy and pymannkendall
npm run build     # production build
npm start
npm run monitor   # one monitoring run from the command line (for system cron)
```

Requires Node.js 20+ (tested on 24) and Docker (for local Supabase).

### Configuration (`.env.local`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL (local: `http://127.0.0.1:54321`) **required** |
| `SUPABASE_SECRET_KEY` | Server-only secret key (`SUPABASE_SERVICE_ROLE_KEY` also works) **required** |
| `ANTHROPIC_API_KEY` | Claude through the API (needed when deployed) |
| `CLAUDE_MODEL` | Default `claude-opus-5-5` |
| `HF_TOKEN`, `HF_MODEL` | DeepSeek on Hugging Face, used when Claude is not available (e.g. on Vercel without an Anthropic key) |
| `CLAUDE_CLI` | `auto` (default) uses the local `claude` CLI when there is no API key; `off` disables it |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram alerts |
| `MONITOR_INTERVAL_MINUTES` | Automatic monitoring interval while the server runs (default 60; `0` = off) |
| `CRON_SECRET` | Authorises scheduled runs: Vercel Cron sends it as a Bearer token; other crons call `GET /api/monitor/run?secret=...` |
| `FIRMS_MAP_KEY` | Enables NASA FIRMS fire checks |
| `NASA_API_KEY` | api.nasa.gov key, optional (no current feature needs it) |
| `MONITOR_AI_DIGEST` | `off` to skip the Claude summary of new alerts |
| `CASE_PACING_MS` | Pause between agent messages so the room is watchable (default 450) |

### Telegram setup

1. In Telegram, message **@BotFather** → `/newbot` → copy the token into `TELEGRAM_BOT_TOKEN`.
2. Send any message to your new bot (or add it to a group), then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `chat.id` into `TELEGRAM_CHAT_ID`.
3. Restart the server, open **Monitoring** and press **Send Telegram test**.

Each alert is sent once (alerts are de-duplicated per region, rule and day; EONET events per event id). The first run for a new region records existing events silently instead of flooding the chat.

### Monitoring rules

| Rule | Alert when | Data |
|---|---|---|
| Heat | 7-day mean of daily max temperature is ≥ z (default 2) standard deviations above the same dates in 1991-2020 | POWER daily |
| Heavy rain | Wettest 3 days of the last week is at or above the 99th percentile for these dates (and ≥ 20 mm) | POWER daily |
| Dry spell | 30-day rain and root-zone soil wetness both at or below the 10th percentile (skipped in the dry season) | POWER daily |
| Natural events | A new open EONET event within 0.5° of the region | EONET |
| Fires | ≥ 25 VIIRS detections in 24 h | FIRMS (key) |

### Deploying to Vercel with Supabase Cloud

1. **Create the cloud database.** Make a project at [supabase.com](https://supabase.com), then push the schema from this repo:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npm run db:push
   ```
2. **Connect Vercel.** Import the repo in Vercel, then add the Supabase integration (Vercel > Integrations > Supabase) so the Supabase variables are set for you. Or set them by hand from Supabase > Project Settings > API Keys: `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Also set `ANTHROPIC_API_KEY` (the local Claude CLI does not exist on Vercel), `CRON_SECRET`, and the Telegram/FIRMS keys if you use them.
3. **Monitoring.** `vercel.json` schedules `/api/monitor/run` daily at 06:00 UTC (the Hobby plan allows daily crons; on Pro you can change it to hourly, `0 * * * *`). Vercel sends `CRON_SECRET` with each call. The in-process scheduler is switched off on Vercel automatically.
4. **Long cases.** A case keeps running after the API responds (`after()`), for up to `maxDuration = 300` seconds. Cases normally finish in 1–3 minutes.

---

## Project layout

```
src/
  app/                    pages (/, /case/[id], /monitor, /reports, /system) and API routes
  components/             AgentRoom (3D), CaseView, SeriesChart, OppositeMap, MonitorDashboard, ...
  lib/
    stats/                trend engine: OLS, Sen, Mann-Kendall (Hamed-Rao), bootstrap, Pettitt, FDR, Granger
    nasa/                 POWER, EONET, GIBS, CMR, FIRMS clients with a disk cache
    agents/               the eight agents, runtime, ledger, pipeline
    ai/claude.ts          Claude via API or local CLI, with fallbacks
    monitor/              checks, runner (alerts, Telegram, reports), scheduler
    hazards.ts            analog climatology shared by the Forecaster and the monitor
    report.ts             Markdown reports
tests/                    stats tests + reference fixtures (scipy, pymannkendall)
```

### API

| Method | Path | |
|---|---|---|
| `POST` | `/api/cases` | `{question, variable?, regionId?, bbox?, startYear?}` → `{id}`; the case runs in the background |
| `GET` | `/api/cases`, `/api/cases/{id}` | List cases; full case (transcript, ledger, results, brief) |
| `GET/POST/DELETE` | `/api/monitor/watchlist` | Watchlist, alerts, monitor state |
| `POST` / `GET` + `CRON_SECRET` | `/api/monitor/run` | Run checks now / scheduled run |
| `GET` | `/api/reports`, `/api/reports/{id}?format=md` | Reports, Markdown download |
| `GET` | `/api/events`, `/api/status`, `/api/globe-texture` | EONET events, integration status, Blue Marble texture |
| `POST` | `/api/telegram/test` | Send a test message |
| `POST` | `/api/chat` | Ask Our AI |

---

## Validation

- `npm test` checks the engine against reference libraries on synthetic AR(1) series. OLS slope and plain p-value match `scipy.stats.linregress`. Sen's slope, S, tau and the Mann-Kendall p-value match `pymannkendall`. The Hamed-Rao z is within 3%. BH-FDR and Pettitt are covered too.
- Each case runs the Skeptic's robustness tests, and the Narrator's text passes an automated number check against the ledger.

## Limits (stated plainly)

- POWER's MERRA-2 and CERES fields are coarse (about 0.5° and 1°) and model-based. Grade A needs an independent sensor; GPM IMERG and GRACE-FO through Earthdata are the next datasets to wire in.
- Hazard odds are analog climatology, not weather forecasts. Always check IMD, NDMA or your national service.
- Driver results are associations, not causes. Population exposure (NASA SEDAC GPW) is not wired yet.

## Use of SI (AI) — disclosure for the submission

- **In the product:** Claude (`claude-opus-5-5`) plans cases from free-text questions, writes the bilingual brief from ledger rows only, writes the Satellite Witness visual note (labelled "AI observation") and optionally summarises new alerts. Every such output is marked in the UI and in the reports.
- **In development:** an AI coding assistant (Claude) helped write code and documentation. The team reviewed the code and owns its design.
- No AI-generated images. The 3D scene is built from code; the globe and snapshots are NASA imagery.

## Submission checklist (deadline Sun 15 Nov 2026, 11:59 PM IST)

- [ ] Both members confirmed at the same Local Event (the team page showed *Award Ineligible* because both were waitlisted for Delhi)
- [ ] Deployed site with a public link, plus this repo
- [ ] Demo: at most 7 slides **or** a video of 30 seconds or less, public link, English
- [ ] Project page: summary, description, NASA data (table above), partner data, SI disclosure (above)
- [ ] No NASA logos in generated content; no images of anyone under 18
- [ ] Click **Submit for Judging** and confirm the banner

## Credits and references

NASA POWER, EONET, GIBS, CMR and FIRMS. Methods: Mann (1945); Kendall (1975); Sen (1968); Hamed and Rao (1998); Santer et al. (2000); Pettitt (1979); Benjamini and Hochberg (1995); Wilks (2016); Weatherhead et al. (1998); Hawkins and Sutton (2012). NASA does not endorse this project. Advisory analysis for education, not an official warning.
