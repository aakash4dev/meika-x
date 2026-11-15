// Narrator: writes the Case File brief (English plus the region's main local language) from ledger rows only.
// An automated check rejects any number in the text that does not appear in the ledger or the plan.
import { z } from "zod";
import { aiIssue, aiJSON } from "../ai/claude";
import { fmt, fmtP, fmtSigned } from "../format";
import type { CaseContext } from "./runtime";
import type { CaseBrief, CaseRecord } from "./types";

const BriefSchema = z.object({
  en: z.string().min(40),
  local: z.object({ code: z.string().min(2).max(12), name: z.string().min(1), text: z.string().min(20) }).nullable(),
});
const BRIEF_JSON_SCHEMA = {
  type: "object",
  properties: {
    en: { type: "string", description: "English brief, 120-180 words" },
    local: {
      description: "The same brief in the region's main local language (Western digits), or null when that language is English",
      anyOf: [
        {
          type: "object",
          properties: {
            code: { type: "string", description: "BCP-47 language code, e.g. 'es'" },
            name: { type: "string", description: "The language's own name for itself, e.g. 'Español'" },
            text: { type: "string" },
          },
          required: ["code", "name", "text"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
  },
  required: ["en", "local"],
  additionalProperties: false,
};

const SYSTEM = `You are the Narrator of MEIKA-X. You write a short Case File brief for high-school and college students about whether a trend in NASA Earth data is real.
Hard rules:
- Use ONLY facts and numbers from the ledger rows and plan you are given. Copy numbers exactly as they appear in the "display" column, including signs. Never compute, round or convert a number yourself, and never add a number that is not in the input.
- Always state the evidence grade and what it means, and the uncertainty interval when a trend is reported.
- Correlations with drivers are associations, never causes. Do not attribute single events to climate change.
- If the grade is D, say plainly that no trend could be distinguished from noise yet, and give the years-needed figure if present.
- Plain language, short sentences, no headings, no bullet points, no markdown.
- Write an English version, and a second version with the same content in the local language named in the input (set local to null when told English only). In every language keep numbers in Western digits (0-9) exactly as given.
- Cite the data inline: when you mention the record, the satellite images, events or fires, turn the words into a markdown link using ONLY the links listed under "Links you may use", copied exactly, for example [NASA POWER monthly data](url). Use each link at most once per language, and never invent a URL.
- End every version with one sentence saying this is an advisory analysis, not an official warning.`;

/** Markdown links are allowed in the brief; their URLs are not prose, so drop them before checking numbers. */
const stripLinks = (t: string) => t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

function numbersIn(text: string): string[] {
  return (stripLinks(text).match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
}

function allowedNumbers(rec: CaseRecord): Set<string> {
  const plan = rec.plan!;
  const sources = [
    ...rec.ledger.flatMap((r) => [r.display, r.label, r.unit ?? ""]),
    plan.regionName,
    plan.variableName,
    plan.units,
    String(plan.startYear),
    String(plan.endYear),
    rec.question,
    rec.results.dataset ?? "",
    "95% 5% 1991-2005 2010 1991-2020",
  ];
  return new Set(sources.flatMap(numbersIn));
}

export function checkBrief(rec: CaseRecord, text: string): string[] {
  const allowed = allowedNumbers(rec);
  return [...new Set(numbersIn(text).filter((n) => !allowed.has(n)))];
}

function languageLine(rec: CaseRecord) {
  const lang = rec.plan!.lang;
  if (lang) return `Local language: ${lang.name} (code ${lang.code}). Write the second version in it.`;
  if (lang === null) return "Local language: English only. Set local to null.";
  return `Local language: not known. If the main local language of ${rec.plan!.regionName} is not English, write the second version in it; otherwise set local to null.`;
}

function ledgerDigest(rec: CaseRecord) {
  const plan = rec.plan!;
  const rows = rec.ledger.map((r) => `${r.key} | ${r.label} | ${r.display}${r.unit ? ` ${r.unit}` : ""}`).join("\n");
  return `Question: ${rec.question}
Plan: ${plan.variableName} (${plan.units}) over ${plan.regionName}, ${plan.startYear} to ${plan.endYear}. Data: ${rec.results.dataset}.
Grade reason: ${rec.results.gradeReason ?? "n/a"}
Opposite-story flag: ${rec.results.map?.opposite ? "raised" : "not raised"}
${languageLine(rec)}

Ledger rows (key | label | display):
${rows}

Links you may use (label -> url):
${briefLinks(rec)
  .map((l) => `${l.label} -> ${l.url}`)
  .join("\n")}`;
}

/** A small, digit-free set of links the Narrator may cite. */
function briefLinks(rec: CaseRecord) {
  const out: { label: string; url: string }[] = [];
  const first = (st: string) => rec.sources?.find((s) => s.station === st);
  const power = first("power");
  if (power) out.push({ label: "NASA POWER monthly data", url: power.url });
  out.push({ label: "regional series CSV", url: `/api/cases/${rec.id}/data.csv` });
  const gibs = first("gibs");
  if (gibs) out.push({ label: "MODIS satellite image", url: gibs.url });
  const eonet = first("eonet");
  if (eonet) out.push({ label: "NASA EONET events", url: eonet.url });
  const firms = first("firms");
  if (firms) out.push({ label: "NASA FIRMS fire map", url: firms.url });
  const daily = rec.sources?.find((s) => s.agent === "forecaster");
  if (daily) out.push({ label: "NASA POWER daily record", url: daily.url });
  return out;
}

/** Keep only links that the Narrator was given (no invented URLs reach the page). */
function onlyKnownLinks(rec: CaseRecord, text: string) {
  const allowed = new Set(briefLinks(rec).map((l) => l.url));
  return text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (m, label, url) => (allowed.has(url) ? m : label));
}

const HINDI = { code: "hi", name: "हिन्दी" };

/** Fixed fallback brief. Has an English and a Hindi template; other languages get English only. */
export function templateBrief(rec: CaseRecord): { en: string; local?: CaseBrief["local"] } {
  const t = templateTexts(rec);
  return { en: t.en, local: rec.plan!.lang?.code === "hi" ? { ...HINDI, text: t.hi } : undefined };
}

function templateTexts(rec: CaseRecord): { en: string; hi: string } {
  const plan = rec.plan!;
  const s = rec.results.stats;
  const g = rec.results.grade ?? "D";
  if (!s) {
    return {
      en: `MEIKA-X could not retrieve enough data to test ${plan.variableName} over ${plan.regionName}. This is an advisory analysis, not an official warning.`,
      hi: `MEIKA-X ${plan.regionName} के लिए ${plan.variableName} की जाँच के लिए पर्याप्त डेटा नहीं जुटा सका। यह एक सलाहकारी विश्लेषण है, आधिकारिक चेतावनी नहीं।`,
    };
  }
  const slope = fmtSigned(s.slopeDecade);
  const lo = fmt(s.ciDecade[0]);
  const hi = fmt(s.ciDecade[1]);
  const opp = rec.results.map?.opposite;
  const enParts = [
    `MEIKA-X tested ${plan.variableName} over ${plan.regionName} from ${plan.startYear} to ${plan.endYear} using ${rec.results.dataset}.`,
    `The fitted trend is ${slope} ${plan.units} per decade, with a 95% interval of ${lo} to ${hi}.`,
    `The adjusted t-test gives p ${fmtP(s.pOls)} and the Mann-Kendall test gives p ${fmtP(s.pMk)}.`,
    g === "D"
      ? `This is not distinguishable from noise yet; about ${fmt(s.yearsNeeded, 2)} years of record would be needed to detect a trend of this size.`
      : `The Skeptic graded the evidence ${g}: ${rec.results.gradeReason}.`,
    opp ? "Parts of the region move in opposite directions, so the regional average hides two stories." : "",
    "This is an advisory analysis, not an official warning.",
  ];
  const hiParts = [
    `MEIKA-X ने ${rec.results.dataset} डेटा से ${plan.startYear} से ${plan.endYear} तक ${plan.regionName} में ${plan.variableName} की जाँच की।`,
    `अनुमानित रुझान प्रति दशक ${slope} ${plan.units} है, जिसका 95% अंतराल ${lo} से ${hi} है।`,
    `समायोजित t-test का p ${fmtP(s.pOls)} और Mann-Kendall test का p ${fmtP(s.pMk)} है।`,
    g === "D"
      ? `यह बदलाव अभी शोर से अलग नहीं दिखता; इस आकार का रुझान पहचानने के लिए लगभग ${fmt(s.yearsNeeded, 2)} वर्षों का रिकॉर्ड चाहिए।`
      : `Skeptic ने साक्ष्य को ग्रेड ${g} दिया।`,
    opp ? "क्षेत्र के कुछ हिस्से विपरीत दिशाओं में बदल रहे हैं, इसलिए औसत पूरी कहानी नहीं बताता।" : "",
    "यह एक सलाहकारी विश्लेषण है, आधिकारिक चेतावनी नहीं।",
  ];
  return { en: enParts.filter(Boolean).join(" "), hi: hiParts.filter(Boolean).join(" ") };
}

export async function runNarrator(ctx: CaseContext) {
  const rec = ctx.rec;
  await ctx.emit("narrator", "tool", "Writing the brief with our AI from ledger rows only. Every number I use must match a row.", { station: "claude" });
  let brief: CaseBrief | null = null;
  let feedback = "";
  for (let attempt = 0; attempt < 2 && !brief; attempt++) {
    const ai = await aiJSON({
      system: SYSTEM,
      prompt: ledgerDigest(rec) + feedback,
      schema: BriefSchema,
      jsonSchema: BRIEF_JSON_SCHEMA,
      effort: "medium",
    });
    if (!ai) break;
    const local = ai.data.local && rec.plan!.lang !== null ? ai.data.local : null;
    const unmatched = checkBrief(rec, `${ai.data.en}\n${local?.text ?? ""}`);
    if (unmatched.length === 0) {
      brief = {
        en: onlyKnownLinks(rec, ai.data.en),
        local: local ? { code: local.code, name: local.name, text: onlyKnownLinks(rec, local.text) } : undefined,
        provider: ai.provider as "api" | "cli" | "hf",
        checked: true,
        unmatched: [],
      };
    } else {
      await ctx.emit("narrator", "warn", `Number check failed for ${unmatched.join(", ")}. Rewriting.`);
      feedback = `\n\nYour previous draft used numbers that are not in the ledger: ${unmatched.join(", ")}. Remove them or replace them with ledger values.`;
    }
  }
  if (!brief) {
    const t = templateBrief(rec);
    brief = { en: t.en, local: t.local, provider: "template", checked: checkBrief(rec, `${t.en}\n${t.local?.text ?? ""}`).length === 0, unmatched: [] };
    const issue = aiIssue();
    await ctx.emit(
      "narrator",
      issue ? "warn" : "say",
      issue ? `Our AI is offline: ${issue} I wrote the brief from the fixed template instead.` : "Our AI was unavailable or failed the number check, so I used the fixed template.",
    );
  }
  rec.brief = brief;
  await ctx.emit("narrator", "done", `Brief ready (${brief.provider === "template" ? "template" : "our AI"}, number check ${brief.checked ? "passed" : "FAILED"}).`);
}
