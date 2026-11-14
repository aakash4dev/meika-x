import type { AgentId } from "./meta";
import type { BBox, Hazard } from "../catalog";

export type { AgentId };

/** A 3D data terminal in the room; one per external service. */
export type Station = "power" | "eonet" | "gibs" | "cmr" | "firms" | "claude";

export interface SourceRef {
  station: Station;
  label: string;
  url: string;
  agent: AgentId;
  at: string;
}

export interface LedgerRow {
  id: string; // L001...
  agent: AgentId;
  key: string;
  label: string;
  value: number | string | boolean | null;
  display: string; // the exact string other agents and the Narrator must quote
  unit?: string;
  dataset: string;
  method: string;
  /** Link to the exact data this number was computed from. */
  source?: { label: string; url: string };
}

export type EventKind = "plan" | "say" | "tool" | "ledger" | "handoff" | "verdict" | "warn" | "done";

export interface TranscriptEvent {
  seq: number;
  ts: string;
  agent: AgentId;
  kind: EventKind;
  text: string;
  target?: AgentId;
  ledgerIds?: string[];
  /** The data terminal the agent walks to for this step. Text may contain [label](url) links. */
  station?: Station;
}

export interface CasePlan {
  variable: string;
  variableName: string;
  units: string;
  drivers: string[];
  related?: string;
  regionId: string | null;
  regionName: string;
  bbox: BBox;
  startYear: number;
  endYear: number;
  hazard: Hazard;
  rationale: string;
  plannedBy: "claude" | "rules" | "user";
}

export interface SeriesForChart {
  ym: string[];
  raw: number[];
  anomaly: number[];
  rolling: (number | null)[];
  fit: number[];
  fitLo: number[];
  fitHi: number[];
}

export interface StatsSummary {
  n: number;
  years: number;
  slopeDecade: number;
  ciDecade: [number, number];
  bootCiDecade: [number, number];
  pOls: number;
  pOlsPlain: number;
  nEff: number;
  r1: number;
  senDecade: number;
  pMk: number;
  pMkPlain: number;
  tau: number;
  pettitt: { ym: string; p: number };
  pctDecade: number | null;
  yearsNeeded: number;
  emergenceYear: number | null;
  baseline: number;
  totalChange: number;
  significant: boolean;
}

export interface SkepticTest {
  id: string;
  name: string;
  status: "pass" | "fail" | "n/a";
  detail: string;
}

export type Grade = "A" | "B" | "C" | "D";

export interface MapCell {
  lat: number;
  lon: number;
  row: number;
  col: number;
  slopeDecade: number;
  p: number;
  q: number;
  sig: boolean;
}

export interface MapResult {
  cells: MapCell[];
  rows: number;
  cols: number;
  sigPos: number;
  sigNeg: number;
  opposite: boolean;
}

export interface DriverRow {
  variable: string;
  name: string;
  r: number;
  lag: number;
  p: number;
  grangerP: number;
  partialR: number;
}

export interface WitnessResult {
  recentDate: string;
  priorDate: string;
  images: { name: string; date: string; url: string }[];
  events: { id: string; title: string; category: string; date: string; status: string; link: string }[];
  note?: { text: string; provider: string };
}

export interface ForecastHorizon {
  label: string;
  hazard: string;
  definition: string;
  pAll: number;
  ciAll: [number, number];
  pEarly: number;
  pRecent: number;
  pAnalog: number | null;
  ciAnalog: [number, number] | null;
  analogNote: string;
  years: number;
}

export interface ForecastResult {
  point: { lat: number; lon: number };
  horizons: ForecastHorizon[];
  dataThrough: string;
  note: string;
}

export interface ExposureResult {
  areaKm2: number;
  events: { category: string; count: number }[];
  fires: { count: number; highConfidence: number; days: number } | null;
  sigAreaShare: number | null;
  note: string;
}

export interface CaseBrief {
  en: string;
  hi?: string;
  provider: "api" | "cli" | "template";
  checked: boolean;
  unmatched: string[];
}

export interface CaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "done" | "error";
  question: string;
  plan?: CasePlan;
  activeAgent?: AgentId;
  transcript: TranscriptEvent[];
  ledger: LedgerRow[];
  /** Every external query this case made, in order. */
  sources: SourceRef[];
  results: {
    series?: SeriesForChart;
    stats?: StatsSummary;
    skeptic?: SkepticTest[];
    grade?: Grade;
    gradeReason?: string;
    map?: MapResult;
    drivers?: DriverRow[];
    witness?: WitnessResult;
    forecast?: ForecastResult;
    exposure?: ExposureResult;
    verdict?: string;
    related?: { shortName: string; title: string; version: string; link: string }[];
    dataset?: string;
  };
  brief?: CaseBrief;
  reportId?: string;
  error?: string;
}

export interface CaseRequest {
  question: string;
  variable?: string;
  regionId?: string;
  bbox?: BBox;
  startYear?: number;
}
