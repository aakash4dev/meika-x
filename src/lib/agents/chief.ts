// Chief Detective: turns a question into a case plan, and writes the final verdict.
import { z } from "zod";
import { aiIssue, aiJSON } from "../ai/claude";
import { DEFAULT_REGION_ID, REGIONS, VARIABLES, regionById, validBBox, variableById } from "../catalog";
import { collectionsUrl, searchCollections } from "../nasa/cmr";
import { POWER_FIRST_YEAR, lastFullYear } from "../nasa/power";
import { fmt, fmtSigned } from "../format";
import type { CaseContext } from "./runtime";
import type { CasePlan, CaseRequest } from "./types";

const BoxSchema = z.object({ west: z.number(), south: z.number(), east: z.number(), north: z.number() });
const LangSchema = z.object({ code: z.string().min(2).max(12), name: z.string().min(1) });
const PlanSchema = z.object({
  variable: z.string(),
  regionId: z.string().nullable(),
  customRegion: z.object({ name: z.string(), bbox: BoxSchema, language: LangSchema.nullable() }).nullable(),
  startYear: z.number().int().nullable(),
  rationale: z.string(),
});

const PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    variable: { type: "string", description: "One variable id from the catalogue" },
    regionId: { type: ["string", "null"], description: "One region id from the list, or null if none fits" },
    customRegion: {
      description: "Only when the question names a place that is not in the region list: its name and a bounding box in decimal degrees (at most 20 x 20 degrees). Otherwise null.",
      anyOf: [
        {
          type: "object",
          properties: {
            name: { type: "string" },
            bbox: {
              type: "object",
              properties: { west: { type: "number" }, south: { type: "number" }, east: { type: "number" }, north: { type: "number" } },
              required: ["west", "south", "east", "north"],
              additionalProperties: false,
            },
            language: {
              description: "The place's main local language when it is not English, else null. code = BCP-47 (e.g. 'ne'), name = the language's own name for itself (e.g. 'नेपाली').",
              anyOf: [
                {
                  type: "object",
                  properties: { code: { type: "string" }, name: { type: "string" } },
                  required: ["code", "name"],
                  additionalProperties: false,
                },
                { type: "null" },
              ],
            },
          },
          required: ["name", "bbox", "language"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
    startYear: { type: ["integer", "null"], description: "First year to analyse, or null for the full record" },
    rationale: { type: "string", description: "One or two sentences, plain language, explaining the choice" },
  },
  required: ["variable", "regionId", "customRegion", "startYear", "rationale"],
  additionalProperties: false,
};

const SYSTEM = `You are the Chief Detective of MEIKA-X, a tool that helps students test whether a long-term change (a trend over years) in a NASA Earth science variable is real.
"Trend" here means a consistent rise or fall in a measured variable over time, such as temperature, rainfall or soil moisture, never popularity or news.
Turn the user's question into a case plan:
- Pick exactly one variable id from the catalogue that best measures what the question is about.
- If the question names or implies a place in the region list, use its id.
- MEIKA-X covers the whole planet. If the question names a place that is not in the list, do NOT substitute a nearby listed region: set regionId to null and give customRegion with the place name, a bounding box that covers it (decimal degrees, at most 20 x 20 degrees, west < east, south < north) and its main local language (null if English).
- If the question asks about the future or "current updates", still plan a trend test on the past record; say in the rationale that MEIKA-X tests past change and gives climatological odds, not forecasts or news.
Never invent variable or region ids. Never state numbers or findings: you have not seen the data. Keep the rationale to one or two short sentences a 16-year-old can follow.`;

function scoreVariable(question: string) {
  const q = question.toLowerCase();
  let best = VARIABLES[0];
  let bestScore = 0;
  for (const v of VARIABLES) {
    let s = 0;
    for (const k of v.keywords) if (q.includes(k)) s += k.length;
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return { variable: best, matched: bestScore > 0 };
}

function matchRegion(question: string) {
  const q = question.toLowerCase();
  const aliases: Record<string, string[]> = {
    "us-corn-belt": ["corn belt", "iowa", "illinois", "midwest"],
    california: ["california", "central valley"],
    "central-america": ["central america", "dry corridor", "guatemala", "honduras", "el salvador", "nicaragua"],
    amazon: ["amazon", "brazil", "rainforest"],
    patagonia: ["patagonia", "argentina", "chile"],
    "central-europe": ["europe", "germany", "czech", "poland", "austria"],
    iberia: ["spain", "portugal", "iberia", "mediterranean"],
    sahel: ["sahel", "niger", "mali", "burkina", "chad"],
    "east-africa": ["kenya", "ethiopia", "somalia", "horn of africa", "east africa"],
    "southern-africa": ["southern africa", "zambia", "zimbabwe", "botswana", "malawi"],
    "nile-delta": ["egypt", "nile", "cairo"],
    "middle-east-gulf": ["gulf", "dubai", "uae", "qatar", "saudi", "arabia"],
    "delhi-ncr": ["delhi", "ncr", "gurgaon", "noida", "gurugram"],
    "nw-india": ["northwest india", "north-west india", "punjab", "haryana"],
    "india-monsoon": ["central india", "monsoon belt", "india"],
    "north-china-plain": ["china", "beijing", "hebei", "shandong"],
    "mekong-delta": ["mekong", "vietnam"],
    borneo: ["borneo", "kalimantan", "indonesia", "sarawak"],
    "se-australia": ["australia", "new south wales", "victoria", "sydney", "melbourne"],
    "alaska-north-slope": ["arctic", "alaska", "tundra"],
    siberia: ["siberia", "yakutia", "russia", "permafrost"],
    "greenland-west": ["greenland", "ice sheet"],
  };
  for (const [id, words] of Object.entries(aliases)) if (words.some((w) => q.includes(w))) return regionById(id) ?? null;
  return null;
}

export async function planCase(ctx: CaseContext, req: CaseRequest): Promise<CasePlan> {
  await ctx.emit("chief", "say", `New case opened: "${req.question}". Let me decide what to measure and where.`);

  let variableId = req.variable && variableById(req.variable) ? req.variable : undefined;
  let regionId = req.regionId && regionById(req.regionId) ? req.regionId : undefined;
  let custom: { name: string; bbox: CasePlan["bbox"]; language?: CasePlan["lang"] } | undefined = validBBox(req.bbox) ? { name: "", bbox: req.bbox } : undefined;
  let startYear = req.startYear;
  let rationale = "";
  let plannedBy: CasePlan["plannedBy"] = variableId && (regionId || req.bbox) ? "user" : "rules";

  if (!variableId || (!regionId && !validBBox(req.bbox))) {
    await ctx.emit("chief", "tool", "Asking our AI to map the question onto the variable catalogue and region list.", { station: "claude" });
    const catalogue = VARIABLES.map((v) => `${v.id}: ${v.name} - ${v.definition}`).join("\n");
    const regions = REGIONS.map((r) => `${r.id}: ${r.name} (${r.note})`).join("\n");
    const ai = await aiJSON({
      system: SYSTEM,
      prompt: `Question: ${req.question}\n\nVariable catalogue:\n${catalogue}\n\nRegions:\n${regions}\n\n${
        variableId ? `The user already chose variable ${variableId}; keep it.\n` : ""
      }${regionId ? `The user already chose region ${regionId}; keep it.\n` : ""}`,
      schema: PlanSchema,
      jsonSchema: PLAN_JSON_SCHEMA,
      effort: "low",
    });
    if (ai && variableById(ai.data.variable)) {
      variableId ??= ai.data.variable;
      if (!regionId && !custom) {
        if (ai.data.regionId && regionById(ai.data.regionId)) regionId = ai.data.regionId;
        else if (ai.data.customRegion && validBBox(ai.data.customRegion.bbox)) custom = ai.data.customRegion;
      }
      startYear ??= ai.data.startYear ?? undefined;
      rationale = ai.data.rationale;
      plannedBy = "claude";
    } else {
      const issue = aiIssue();
      await ctx.emit("chief", "warn", issue ? `Our AI is offline: ${issue} I am planning with keyword rules instead.` : "Our AI is not available for planning, so I am using keyword rules instead.");
      const sv = scoreVariable(req.question);
      variableId ??= sv.variable.id;
      regionId ??= matchRegion(req.question)?.id;
      rationale = sv.matched
        ? `The question mentions ${sv.variable.short.toLowerCase()}, so ${sv.variable.name} is the closest NASA variable.`
        : `No clear match in the question, so I start with ${sv.variable.name}, the most common trend variable.`;
    }
  }

  const variable = variableById(variableId!)!;
  const region = regionId ? regionById(regionId) : undefined;
  if (!region && !custom) {
    await ctx.emit("chief", "warn", `I could not tell which place you mean, so I am using ${regionById(DEFAULT_REGION_ID)!.name}. Name a place or pick a region to investigate somewhere else.`);
  }
  const bbox = region?.bbox ?? custom?.bbox ?? regionById(DEFAULT_REGION_ID)!.bbox;
  const regionName =
    region?.name ??
    (custom
      ? custom.name || `Custom box ${fmt(bbox.south)} to ${fmt(bbox.north)} N, ${fmt(bbox.west)} to ${fmt(bbox.east)} E`
      : regionById(DEFAULT_REGION_ID)!.name);
  const first = Math.max(variable.firstYear, POWER_FIRST_YEAR);
  const sy = Math.min(Math.max(first, startYear ?? first), lastFullYear() - 10);

  const plan: CasePlan = {
    variable: variable.id,
    variableName: variable.name,
    units: variable.units,
    drivers: variable.drivers.filter((d) => d !== variable.id),
    related: variable.related,
    regionId: region?.id ?? null,
    regionName,
    bbox,
    startYear: sy,
    endYear: lastFullYear(),
    hazard: variable.hazard,
    rationale: rationale || `${variable.name} over ${regionName}, as requested.`,
    plannedBy,
    // listed region: its language; AI-planned custom place: the language the AI named; a raw bbox: let the Narrator decide
    lang: region ? (region.lang ?? null) : custom ? custom.language : (regionById(DEFAULT_REGION_ID)!.lang ?? null),
  };
  ctx.rec.plan = plan;
  ctx.rec.results.dataset = variable.source;

  await ctx.emit(
    "chief",
    "plan",
    `Plan: test ${variable.name} (${variable.units}) over ${regionName}, ${plan.startYear} to ${plan.endYear}. ${plan.rationale}`,
  );

  try {
    const related = await searchCollections(variable.fullRes, 3);
    ctx.rec.results.related = related;
    const q = ctx.source("chief", "cmr", `NASA CMR catalogue search for "${variable.fullRes}"`, collectionsUrl(variable.fullRes, 3));
    if (related.length)
      await ctx.emit(
        "chief",
        "tool",
        `${q} lists the full-resolution products behind this variable: ${related.map((r) => `[${r.shortName}](${r.link})`).join(", ")}.`,
        { station: "cmr" },
      );
  } catch {
    /* catalogue search is a nice-to-have */
  }

  await ctx.emit("chief", "handoff", "Statistician, Satellite Witness and Driver Analyst: start in parallel.", { target: "statistician" });
  return plan;
}

export async function verdict(ctx: CaseContext) {
  const { stats, grade, gradeReason, map, drivers } = ctx.rec.results;
  const plan = ctx.rec.plan!;
  if (!stats || !grade) return;
  const dir = stats.slopeDecade > 0 ? "rising" : "falling";
  const notes: string[] = [];
  if ((stats.pOls < 0.05) !== (stats.pMk < 0.05)) notes.push("the two significance tests disagree");
  if (map?.opposite) notes.push("parts of the region move in opposite directions");
  const topDriver = drivers?.find((d) => d.p < 0.05);
  let text: string;
  if (grade === "D") {
    text = `No case yet. ${plan.variableName} over ${plan.regionName} shows ${fmtSigned(stats.slopeDecade)} ${plan.units} per decade, which is not distinguishable from noise. About ${fmt(stats.yearsNeeded, 2)} years of record would be needed to detect a trend of this size.`;
  } else {
    text = `${plan.variableName} over ${plan.regionName} is ${dir}: ${fmtSigned(stats.slopeDecade)} ${plan.units} per decade (95% interval ${fmt(stats.ciDecade[0])} to ${fmt(stats.ciDecade[1])}). Evidence grade ${grade}: ${gradeReason}.`;
  }
  if (notes.length) text += ` Note: ${notes.join("; ")}.`;
  if (topDriver) text += ` Strongest associated driver: ${topDriver.name} (r = ${fmt(topDriver.r, 2)}, lag ${topDriver.lag} months), an association, not proof of cause.`;
  ctx.rec.results.verdict = text;
  await ctx.emit("chief", "verdict", text);
}
