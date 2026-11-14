# MEIKA-X

**Every trend gets a trial before it gets a headline.**

MEIKA-X is a multi-agent, evidence-first trend detective for NASA Earth data. You ask a question ("Are Delhi's afternoons getting hotter?") and eight agents open a case in a 3D room. They pull NASA data, measure the trend, test whether it is significant, cross-examine it, check fresh satellite imagery, test candidate drivers, estimate hazard odds and write a Case File in English and Hindi. Every number they report lands in an evidence ledger and comes with an evidence grade from A to D.

Built by Team **Zentox** (Tushar Kumar, Aakash Singh Rajput) for the [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/), challenge [**Be An Earth System Trend Detective!**](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/).
Team page: https://www.spaceappschallenge.org/2026/find-a-team/zentox · Repo: https://github.com/aakash4dev/meika-x

---

## What it does

| Page | What you get |
|---|---|
| **Cases** (`/`) | Ask a question or tap a starter. Pick a variable and region, or let the Chief Detective choose. |
| **Agent room** (`/case/[id]`) | A 3D room (react-three-fiber) with the eight scientists around a holographic NASA Blue Marble globe. Whoever is working glows, speaks in a bubble and sends a beam to the globe. Click a scientist to see their job, tools and ledger rows. A live transcript sits alongside, and you can replay any finished case. |
| **Case File** (same page) | Verdict and grade; Narrator brief (EN/हिन्दी); time-series chart with the trend and 95% band; Skeptic's tests; opposite-story map; drivers; hazard odds; satellite snapshots with EONET events; full evidence ledger. |
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
| Audience: students and the public | Plain definitions, verdicts in one sentence, Hindi briefs, starter questions, replayable cases |

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
| Narrator | **Claude** | Case File brief in English and Hindi | Ledger rows only; an automated checker rejects any number not in the ledger (one retry, then a fixed template) |

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

All responses are cached on disk under `.data/cache`, so a demo keeps working when the venue Wi-Fi is bad.

---

## Where Claude is used, and what happens without it

| Feature | Needs AI? | Without Claude |
|---|---|---|
| Statistics, grades, maps, drivers, hazard odds, monitoring checks, alerts, reports | No (plain code) | Unchanged |
| Turning a free-text question into a plan | Claude | Keyword rules pick the variable and region |
| Narrator brief (EN + Hindi) | Claude | Fixed bilingual template built from the same ledger |
| Satellite Witness visual note | Claude (vision) | Images are shown without a note |
| One-paragraph summary of new monitoring alerts | Claude | Alerts are sent without a summary |

**How MEIKA-X reaches Claude** (in `src/lib/ai/claude.ts`):
1. If `ANTHROPIC_API_KEY` is set, it uses the Anthropic SDK (`claude-opus-5-5`, structured JSON output, server-side refusal fallbacks enabled). **A deployed site needs this.**
2. Otherwise it uses your **local Claude Code CLI** (`claude -p --json-schema ...`, no tools except reading the case's two images). This is the default on a laptop where `claude` is installed and logged in.
3. Otherwise AI features switch off and the fallbacks in the table above take over.

---

## Run it

```bash
npm install
cp .env.example .env.local     # fill in what you have; everything is optional
npm run dev                    # http://localhost:3000
```

```bash
npm test          # stats engine cross-checked against scipy and pymannkendall
npm run build     # production build
npm start
npm run monitor   # one monitoring run from the command line (for system cron)
```

Requires Node.js 20+ (tested on 24).

### Configuration (`.env.local`)

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude through the API (needed when deployed) |
| `CLAUDE_MODEL` | Default `claude-opus-5-5` |
| `CLAUDE_CLI` | `auto` (default) uses the local `claude` CLI when there is no API key; `off` disables it |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram alerts |
| `MONITOR_INTERVAL_MINUTES` | Automatic monitoring interval while the server runs (default 60; `0` = off) |
| `CRON_SECRET` | Lets an external cron call `GET /api/monitor/run?secret=...` |
| `FIRMS_MAP_KEY` | Enables NASA FIRMS fire checks |
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

### Deployment notes

- Data lives in `.data/` (JSON files), so host it somewhere with a persistent disk (a VM, Render, Railway or Fly). On serverless hosting, cases and reports won't persist.
- The local Claude CLI is not available on a server: set `ANTHROPIC_API_KEY` there.
- On serverless hosting, turn off the in-process scheduler (`MONITOR_INTERVAL_MINUTES=0`) and call `/api/monitor/run?secret=CRON_SECRET` from a cron service.

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
| `POST` / `GET?secret=` | `/api/monitor/run` | Run checks now (manual / cron) |
| `GET` | `/api/reports`, `/api/reports/{id}?format=md` | Reports, Markdown download |
| `GET` | `/api/events`, `/api/status`, `/api/globe-texture` | EONET events, integration status, Blue Marble texture |
| `POST` | `/api/telegram/test` | Send a test message |

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
