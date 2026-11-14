// Narrator: writes the Case File brief (English and Hindi) from ledger rows only.
// An automated check rejects any number in the text that does not appear in the ledger or the plan.
import { z } from "zod";
import { aiJSON } from "../ai/claude";
import { fmt, fmtP, fmtSigned } from "../format";
import type { CaseContext } from "./runtime";
import type { CaseBrief, CaseRecord } from "./types";

const BriefSchema = z.object({ en: z.string().min(40), hi: z.string().min(20) });
const BRIEF_JSON_SCHEMA = {
  type: "object",
  properties: {
    en: { type: "string", description: "English brief, 120-180 words" },
    hi: { type: "string", description: "Hindi brief in Devanagari script, same content, Western digits" },
  },
  required: ["en", "hi"],
  additionalProperties: false,
};

const SYSTEM = `You are the Narrator of MEIKA-X. You write a short Case File brief for high-school and college students about whether a trend in NASA Earth data is real.
Hard rules:
- Use ONLY facts and numbers from the ledger rows and plan you are given. Copy numbers exactly as they appear in the "display" column, including signs. Never compute, round or convert a number yourself, and never add a number that is not in the input.
- Always state the evidence grade and what it means, and the uncertainty interval when a trend is reported.
- Correlations with drivers are associations, never causes. Do not attribute single events to climate change.
- If the grade is D, say plainly that no trend could be distinguished from noise yet, and give the years-needed figure if present.
- Plain language, short sentences, no headings, no bullet points, no markdown.
- Write an English version and a Hindi version (Devanagari script) with the same content; in Hindi keep numbers in Western digits exactly as given.
- End both versions with one sentence saying this is an advisory analysis, not an official warning.`;

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
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

function ledgerDigest(rec: CaseRecord) {
  const plan = rec.plan!;
  const rows = rec.ledger.map((r) => `${r.key} | ${r.label} | ${r.display}${r.unit ? ` ${r.unit}` : ""}`).join("\n");
  return `Question: ${rec.question}
Plan: ${plan.variableName} (${plan.units}) over ${plan.regionName}, ${plan.startYear} to ${plan.endYear}. Data: ${rec.results.dataset}.
Grade reason: ${rec.results.gradeReason ?? "n/a"}
Opposite-story flag: ${rec.results.map?.opposite ? "raised" : "not raised"}

Ledger rows (key | label | display):
${rows}`;
}

export function templateBrief(rec: CaseRecord): { en: string; hi: string } {
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
  await ctx.emit("narrator", "say", "Writing the brief from ledger rows only. Every number I use must match a row.");
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
    const unmatched = checkBrief(rec, `${ai.data.en}\n${ai.data.hi}`);
    if (unmatched.length === 0) {
      brief = { en: ai.data.en, hi: ai.data.hi, provider: ai.provider as "api" | "cli", checked: true, unmatched: [] };
    } else {
      await ctx.emit("narrator", "warn", `Number check failed for ${unmatched.join(", ")}. Rewriting.`);
      feedback = `\n\nYour previous draft used numbers that are not in the ledger: ${unmatched.join(", ")}. Remove them or replace them with ledger values.`;
    }
  }
  if (!brief) {
    const t = templateBrief(rec);
    brief = { en: t.en, hi: t.hi, provider: "template", checked: checkBrief(rec, `${t.en}\n${t.hi}`).length === 0, unmatched: [] };
    await ctx.emit("narrator", "say", "Claude was unavailable or failed the number check, so I used the fixed template.");
  }
  rec.brief = brief;
  await ctx.emit("narrator", "done", `Brief ready (${brief.provider === "template" ? "template" : `Claude via ${brief.provider}`}, number check ${brief.checked ? "passed" : "FAILED"}).`);
}
