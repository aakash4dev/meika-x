"use client";

import { useState } from "react";

const GROUPS: { title: string; items: string[] }[] = [
  {
    title: "Find the right variable",
    items: ["12 NASA variables with plain definitions", "Question-first: just ask", "Preset regions or your own box", "Any place on Earth", "Record from 1981 (1984 for sunlight and clouds)", "Links to the full-resolution NASA product"],
  },
  {
    title: "Measure the change",
    items: ["Seasonal cycle removed first", "OLS slope per decade with 95% interval", "Sen's slope", "Moving-block bootstrap interval", "Change point (Pettitt)", "Year the change emerged from noise"],
  },
  {
    title: "Test if it is significant",
    items: ["t-test with autocorrelation-adjusted sample size", "Mann-Kendall with Hamed-Rao correction", "Years of record needed when not yet significant", "Grade A to D on every result", "Checked against scipy and pymannkendall", "Fixed seeds: same case, same ledger"],
  },
  {
    title: "Cross-examine it",
    items: ["Start and end-year sweep", "Leave-one-year-out", "Shuffled-block placebo", "Step-change check", "Second-opinion variable", "Disagreements shown, never hidden"],
  },
  {
    title: "Find where it changes",
    items: ["Trend in every grid cell", "False-discovery-rate control", "Opposite-story flag when rises and falls coexist", "Driver lags and Granger tests", "Satellite snapshots, today and a year ago", "Natural events from EONET"],
  },
  {
    title: "Keep watching",
    items: ["Heat, heavy rain and dry-spell alerts", "New wildfires and natural events", "FIRMS fire counts", "Telegram alerts, each sent once", "A report for every run", "Every check links to its data"],
  },
];

export default function Capabilities() {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  return (
    <div>
      <input className="lp-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search capabilities, e.g. significance, fire, Hindi..." aria-label="Search capabilities" />
      <div className="lp-capgrid">
        {GROUPS.map((g) => {
          const items = g.items.filter((i) => !term || i.toLowerCase().includes(term) || g.title.toLowerCase().includes(term));
          return (
            <div key={g.title} className={`lp-cap ${term && !items.length ? "dim" : ""}`}>
              <h4>{g.title}</h4>
              <ul>
                {items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
