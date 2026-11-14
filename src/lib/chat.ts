// "Ask Our AI": answers questions about MEIKA-X, its methods, NASA data and past cases,
// grounded in a context built from the app's own records. Numbers must come from that context.
import { z } from "zod";
import { aiJSON } from "./ai/claude";
import { AGENTS } from "./agents/meta";
import { listCases } from "./agents/runtime";
import { REGIONS, VARIABLES } from "./catalog";
import { STATIONS } from "./stations";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ChatAnswer {
  answer: string;
  provider: "api" | "cli" | "rules";
  suggestCase: { question: string } | null;
  followups: string[];
  verified: boolean;
}

const Schema = z.object({
  answer: z.string().min(1),
  suggest_case: z.boolean(),
  case_question: z.string().nullable(),
  followups: z.array(z.string()).max(3),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string", description: "Markdown answer, under 160 words. Links only from the context, as [label](url)." },
    suggest_case: { type: "boolean", description: "True when the user wants to know whether something is changing somewhere, which a new case would test." },
    case_question: { type: ["string", "null"], description: "If suggest_case, a short case question naming the place and variable, e.g. 'Is the Sahel getting wetter?'" },
    followups: { type: "array", items: { type: "string" }, maxItems: 3, description: "Up to 3 short follow-up questions the user could ask next" },
  },
  required: ["answer", "suggest_case", "case_question", "followups"],
  additionalProperties: false,
};

const SYSTEM = `You are "Our AI", the assistant inside MEIKA-X, an evidence-first tool that tests whether long-term trends in NASA Earth data are real.
"Trend" always means a consistent rise or fall of a measured Earth variable over years, never popularity or news.
Answer the user's question using ONLY the context below for facts about MEIKA-X, its agents, its methods and past cases.
- Any number you state must appear in the context exactly. Do not compute or invent numbers, dates or findings.
- When you mention a past case, link it with its case link from the context; when you mention data, use the data links from the context.
- If the user asks whether something is changing in a place that has no case yet, say a case can test it and set suggest_case with a short case_question.
- Hazard odds are not weather forecasts; say so when relevant. Correlation is not cause.
- Never name the underlying AI model or vendor. Refer to yourself as "Our AI".
- Plain language for students, short paragraphs or a short list, under 160 words.`;

async function buildContext() {
  const cases = (await listCases()).filter((c) => c.status === "done" && c.results.stats).slice(0, 10);
  const lines: string[] = [];
  lines.push("AGENTS:");
  for (const a of AGENTS) lines.push(`- ${a.name}: ${a.job} Tools: ${a.tools}.`);
  lines.push("", "METHODS: deseasonalise monthly data; OLS trend with a t-test using an autocorrelation-adjusted effective sample size; Sen's slope; Mann-Kendall test with Hamed-Rao correction; moving-block bootstrap interval; Pettitt change point; per-cell trend map with Benjamini-Hochberg false discovery rate; opposite-story flag when significant rises and falls coexist; years-needed estimate (Weatherhead et al. 1998). Grades: B = significant in both tests and passes every Skeptic check; C = significant but fragile or tests disagree; D = not distinguishable from noise; A needs an independent sensor dataset.");
  lines.push("", "DATA SOURCES:");
  for (const s of STATIONS) lines.push(`- [${s.name}](${s.home}): ${s.about}`);
  lines.push("", `VARIABLES: ${VARIABLES.map((v) => `${v.name} (${v.units})`).join("; ")}.`);
  lines.push(`PRESET REGIONS: ${REGIONS.map((r) => r.name).join("; ")}. Any other place can be given as a box.`);
  lines.push("", "PAST CASES:");
  for (const c of cases) {
    const power = c.sources?.find((x) => x.station === "power")?.url;
    lines.push(
      `- [${c.question}](/case/${c.id}) | ${c.plan?.variableName} over ${c.plan?.regionName}, ${c.plan?.startYear}-${c.plan?.endYear} | grade ${c.results.grade} | ${c.results.verdict ?? ""} | data: [regional series CSV](/api/cases/${c.id}/data.csv)${power ? `, [NASA POWER query](${power})` : ""}`,
    );
  }
  return lines.join("\n");
}

const nums = (t: string) => (t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));

function rulesAnswer(q: string): ChatAnswer {
  const s = q.toLowerCase();
  const faq: [RegExp, string][] = [
    [/grade|a to d|score/, "Grades summarise how much to trust a trend. **B**: significant in both tests and passes every Skeptic check. **C**: significant but fragile, or the tests disagree. **D**: not distinguishable from noise yet. **A** needs an independent sensor dataset."],
    [/data|source|nasa/, "MEIKA-X uses [NASA POWER](https://power.larc.nasa.gov/) (MERRA-2 and CERES), [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) imagery, [NASA EONET](https://eonet.gsfc.nasa.gov/) events, [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) fires and the [NASA CMR](https://cmr.earthdata.nasa.gov/search/) catalogue. Every query is linked where it is used."],
    [/significan|p-value|mann|kendall|t-test/, "A change is called significant when both the autocorrelation-adjusted t-test and the Mann-Kendall test (Hamed-Rao) find it unlikely to be chance. The Skeptic then re-tests it with different start years, without each year, and against shuffled data."],
    [/forecast|warning|predict/, "MEIKA-X tests past change. Its hazard odds come from the same dates in past years, so they are not weather forecasts. Always follow your national weather service."],
  ];
  for (const [re, a] of faq) if (re.test(s)) return { answer: a, provider: "rules", suggestCase: null, followups: [], verified: true };
  return {
    answer: "Our AI is offline right now, but the agents still work. Open a case and they will test it with NASA data.",
    provider: "rules",
    suggestCase: { question: q.slice(0, 200) },
    followups: ["How do the grades work?", "Where does the data come from?"],
    verified: true,
  };
}

export async function askOurAI(question: string, history: ChatTurn[]): Promise<ChatAnswer> {
  const context = await buildContext();
  const convo = history
    .slice(-6)
    .map((t) => `${t.role === "user" ? "User" : "Our AI"}: ${t.text.slice(0, 800)}`)
    .join("\n");
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const ai = await aiJSON({
      system: SYSTEM,
      prompt: `CONTEXT:\n${context}\n\nCONVERSATION SO FAR:\n${convo || "(none)"}\n\nUSER QUESTION: ${question}${feedback}`,
      schema: Schema,
      jsonSchema: JSON_SCHEMA,
      effort: "low",
    });
    if (!ai) break;
    const allowed = new Set([...nums(context), ...nums(question), ...nums(convo)]);
    const bad = [...new Set(nums(ai.data.answer).filter((n) => !allowed.has(n)))];
    // keep only links that exist in the context
    const answer = ai.data.answer.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (m, label, url) => (context.includes(`(${url})`) ? m : label));
    if (!bad.length || attempt === 1) {
      return {
        answer,
        provider: ai.provider as "api" | "cli",
        suggestCase: ai.data.suggest_case && ai.data.case_question ? { question: ai.data.case_question } : null,
        followups: ai.data.followups,
        verified: bad.length === 0,
      };
    }
    feedback = `\n\nYour previous draft used numbers not in the context: ${bad.join(", ")}. Remove them.`;
  }
  return rulesAnswer(question);
}
