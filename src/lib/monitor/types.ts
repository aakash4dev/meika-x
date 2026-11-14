import type { BBox } from "../catalog";

export type RuleId = "heat" | "rain" | "dry" | "events" | "fires";
export type Level = "ok" | "watch" | "alert" | "n/a";

export interface WatchRules {
  heat: { enabled: boolean; z: number };
  rain: { enabled: boolean; percentile: number };
  dry: { enabled: boolean; percentile: number };
  events: { enabled: boolean };
  fires: { enabled: boolean; min: number };
}

export interface CheckResult {
  rule: RuleId;
  level: Level;
  value: string;
  detail: string;
  /** The exact public data query behind this check. */
  link?: { label: string; url: string };
}

export interface WatchItem {
  id: string;
  name: string;
  regionId?: string;
  bbox: BBox;
  rules: WatchRules;
  telegram: boolean;
  createdAt: string;
  lastRun?: string;
  lastChecks?: CheckResult[];
}

export interface Alert {
  id: string;
  itemId: string;
  itemName: string;
  rule: RuleId;
  level: Level;
  message: string;
  createdAt: string;
  key: string;
  telegram: "sent" | "skipped" | "failed" | "off";
  link?: string;
}

export interface MonitorState {
  lastRun?: string;
  lastTrigger?: string;
  runs: number;
  seenEvents: Record<string, string[]>;
  alertKeys: Record<string, string>;
  lastError?: string;
}

export const DEFAULT_RULES: WatchRules = {
  heat: { enabled: true, z: 2 },
  rain: { enabled: true, percentile: 0.99 },
  dry: { enabled: true, percentile: 0.1 },
  events: { enabled: true },
  fires: { enabled: true, min: 25 },
};
