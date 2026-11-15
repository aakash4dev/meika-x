// The agent society (from the v1 concept). Client-safe metadata used by the 3D room and the docs.

export type AgentId =
  | "chief"
  | "statistician"
  | "witness"
  | "driver"
  | "skeptic"
  | "forecaster"
  | "exposure"
  | "narrator";

export interface AgentMeta {
  id: AgentId;
  name: string;
  job: string;
  tools: string;
  output: string;
  color: string;
  /** "code" = deterministic software; "ai" = uses our AI; "hybrid" = code plus an optional AI step */
  engine: "code" | "ai" | "hybrid";
  aiRole?: string;
}

export const AGENTS: AgentMeta[] = [
  {
    id: "chief",
    name: "Chief Detective",
    job: "Opens a case, plans the investigation, routes work, decides when the trial is over.",
    tools: "Case state, all agents, NASA CMR catalogue search",
    output: "Case plan, final verdict",
    color: "#e0892b",
    engine: "hybrid",
    aiRole: "Turns a free-text question into a case plan (variable, region, period). Rules-based fallback.",
  },
  {
    id: "statistician",
    name: "Statistician",
    job: "Trend, uncertainty, change points, time of emergence.",
    tools: "Trend engine: OLS + adjusted t-test, Sen, Mann-Kendall (Hamed-Rao), block bootstrap, Pettitt, FDR",
    output: "Ledger rows: slope, interval, p, q, break year",
    color: "#3b8ed8",
    engine: "code",
  },
  {
    id: "witness",
    name: "Satellite Witness",
    job: "Checks the region against fresh imagery and the natural-event record.",
    tools: "NASA GIBS imagery (MODIS true colour), NASA EONET events",
    output: "Image evidence, event list, optional visual note",
    color: "#2bb5a2",
    engine: "hybrid",
    aiRole: "Optionally describes what is visible in the satellite snapshot (labelled as an AI observation).",
  },
  {
    id: "driver",
    name: "Driver Analyst",
    job: "Tests candidate drivers and the lags between them.",
    tools: "Lead-lag correlation, partial correlation, Granger F-tests",
    output: "Ranked drivers with lag and strength",
    color: "#8b5cf6",
    engine: "code",
  },
  {
    id: "skeptic",
    name: "Skeptic",
    job: "Tries to falsify the finding before anyone sees it.",
    tools: "Start-year sweep, autocorrelation check, Pettitt break, leave-one-year-out, block-shuffle surrogates",
    output: "Pass or fail per test, grade A to D",
    color: "#d44a5c",
    engine: "code",
  },
  {
    id: "forecaster",
    name: "Forecaster",
    job: "Odds of a hazard in the coming weeks, and how the trend has shifted those odds.",
    tools: "NASA POWER daily record, analog climatology, Wilson intervals",
    output: "P(event) by horizon with interval, then vs now",
    color: "#f2b134",
    engine: "code",
  },
  {
    id: "exposure",
    name: "Exposure",
    job: "Estimates what sits in the path.",
    tools: "NASA EONET, NASA FIRMS (with key), region geometry",
    output: "Active events, fire detections, area affected",
    color: "#64748b",
    engine: "code",
  },
  {
    id: "narrator",
    name: "Narrator",
    job: "Writes the Case File brief in English and in the local language of the region.",
    tools: "Our AI, ledger rows only, automated number check",
    output: "Text where every number links to a ledger row",
    color: "#d9578f",
    engine: "ai",
    aiRole: "Writes the brief from ledger rows only; a checker rejects any number not in the ledger.",
  },
];

export const agentById = (id: AgentId) => AGENTS.find((a) => a.id === id)!;
