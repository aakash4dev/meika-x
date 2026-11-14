import { agentById, type AgentId } from "@/lib/agents/meta";
import { STATIONS } from "@/lib/stations";

/**
 * Animated org chart of the agent team: data packets travel along the wires, nodes pulse,
 * the current question rides the main bus, and code-style snippets with real ledger values pop up.
 * Pure SVG + CSS/SMIL, no client JS.
 */

const L2: { id: AgentId; x: number }[] = [
  { id: "statistician", x: 150 },
  { id: "witness", x: 390 },
  { id: "driver", x: 630 },
  { id: "skeptic", x: 870 },
];

type Leaf = { label: string; color: string; short: string };
const LEAVES: Record<string, Leaf[]> = {
  statistician: [
    { label: "NASA POWER", color: STATIONS[0].color, short: "P" },
    { label: "Ledger", color: "#6b645b", short: "L" },
  ],
  witness: [
    { label: "NASA GIBS", color: STATIONS[1].color, short: "G" },
    { label: "NASA EONET", color: STATIONS[2].color, short: "E" },
  ],
  driver: [
    { label: "Forecaster", color: agentById("forecaster").color, short: "F" },
    { label: "Exposure", color: agentById("exposure").color, short: "Ex" },
  ],
  skeptic: [
    { label: "Narrator", color: agentById("narrator").color, short: "N" },
    { label: "Our AI", color: STATIONS[5].color, short: "AI" },
  ],
};

const initials = (n: string) => n.split(" ").map((w) => w[0]).join("");

export default function AgentTree({ question, snippets }: { question: string; snippets: string[] }) {
  const topY = 62;
  const bus1 = 132;
  const l2y = 186;
  const bus2 = 262;
  const l3y = 318;
  const topPaths = L2.map((n) => `M500 ${topY + 30} V${bus1} H${n.x} V${l2y - 28}`);
  const leafPaths = L2.flatMap((n) => [-80, 80].map((dx) => `M${n.x} ${l2y + 28} V${bus2} H${n.x + dx} V${l3y - 20}`));
  const all = [...topPaths, ...leafPaths];
  const q = question.length > 46 ? `${question.slice(0, 44)}…` : question;
  const tagW = q.length * 7.1 + 36;
  const snip = snippets.slice(0, 8);
  const snipPos = [
    [L2[0].x + 34, l2y - 40],
    [L2[1].x + 34, l2y + 52],
    [L2[2].x - 150, l2y - 40],
    [L2[3].x - 160, l2y + 52],
    [L2[0].x - 110, bus2 - 18],
    [L2[1].x + 40, bus2 + 30],
    [L2[2].x + 40, bus2 - 18],
    [L2[3].x - 40, bus2 + 30],
  ];
  return (
    <div className="tree">
      <svg viewBox="0 0 1000 380" role="img" aria-label="The MEIKA-X agent team at work">
        <defs>
          <pattern id="circuit" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M0 20 H14 M26 20 H40 M20 0 V14 M20 26 V40" stroke="#e2d9cc" strokeWidth="1" fill="none" />
            <circle cx="20" cy="20" r="2" fill="#e2d9cc" />
          </pattern>
          {all.map((d, i) => (
            <path key={i} id={`tp-${i}`} d={d} />
          ))}
          <path id="tp-bus" d={`M${L2[0].x} ${bus1} H${L2[3].x}`} />
        </defs>
        <rect width="1000" height="380" fill="url(#circuit)" opacity="0.7" />

        {/* wires */}
        {all.map((d, i) => (
          <g key={i}>
            <path d={d} fill="none" stroke="#e0cdb9" strokeWidth="2.2" strokeLinejoin="round" />
            <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" className="tree-flow" style={{ animationDelay: `${(i % 6) * 0.45}s` }} />
          </g>
        ))}
        {/* junction dots */}
        <circle cx="500" cy={bus1} r="5" fill="var(--accent)" className="tree-dot" />
        {L2.map((n) => (
          <circle key={n.id} cx={n.x} cy={bus2} r="4.5" fill="var(--accent)" className="tree-dot" />
        ))}

        {/* data packets */}
        {all.map((_, i) => (
          <circle key={i} r="4" fill="var(--accent)">
            <animateMotion dur={`${2.6 + (i % 4) * 0.4}s`} begin={`${(i * 0.37) % 3}s`} repeatCount="indefinite" rotate="auto">
              <mpath href={`#tp-${i}`} />
            </animateMotion>
          </circle>
        ))}

        {/* the current question rides the main bus */}
        <g>
          <rect x={-tagW / 2} y="-12" width={tagW} height="24" rx="12" fill="#fffcf7" stroke="var(--accent)" strokeWidth="1.4" />
          <text x={-tagW / 2 + 14} y="4" fontSize="11.5" fill="#1d1a17" fontFamily="var(--font-mono)">
            › {q}
          </text>
          <animateMotion dur="11s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear">
            <mpath href="#tp-bus" />
          </animateMotion>
        </g>

        {/* top node: Chief Detective */}
        <g className="tree-node">
          <circle cx="500" cy={topY} r="46" fill="none" stroke="var(--accent)" strokeWidth="1.5" className="tree-ring" />
          <rect x="468" y={topY - 32} width="64" height="64" rx="16" fill="#1d1a17" stroke="var(--accent)" strokeWidth="3" />
          <circle cx="500" cy={topY} r="14" fill="none" stroke="#ececec" strokeWidth="2.4" />
          <ellipse cx="500" cy={topY} rx="22" ry="7" fill="none" stroke="#9a9288" strokeWidth="1.8" transform={`rotate(-24 500 ${topY})`} />
          <polyline points={`488,${topY + 7} 494,${topY + 4} 499,${topY + 6} 505,${topY - 2} 512,${topY - 6}`} fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" />
          <text x="560" y={topY + 4} fontSize="12" fontWeight="700" fill="#1d1a17">
            Chief Detective
          </text>
        </g>

        {/* level 2 agents */}
        {L2.map((n, i) => {
          const a = agentById(n.id);
          return (
            <g key={n.id} className="tree-node">
              <circle cx={n.x} cy={l2y} r="36" fill="none" stroke={a.color} strokeWidth="1.5" className="tree-ring" style={{ animationDelay: `${i * 0.6}s` }} />
              <circle cx={n.x} cy={l2y} r="27" fill="#fffcf7" stroke={a.color} strokeWidth="3" />
              <text x={n.x} y={l2y + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill={a.color}>
                {initials(a.name)}
              </text>
              <text x={n.x} y={l2y - 38} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#1d1a17">
                {a.name}
              </text>
            </g>
          );
        })}

        {/* level 3: tools and helper agents */}
        {L2.flatMap((n) =>
          LEAVES[n.id].map((leaf, k) => {
            const x = n.x + (k ? 80 : -80);
            return (
              <g key={`${n.id}-${k}`} className="tree-node">
                <circle cx={x} cy={l3y} r="19" fill="#fffcf7" stroke={leaf.color} strokeWidth="2.4" />
                <text x={x} y={l3y + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill={leaf.color}>
                  {leaf.short}
                </text>
                <text x={x} y={l3y + 38} textAnchor="middle" fontSize="10.5" fill="#6b645b" fontFamily="var(--font-mono)">
                  {leaf.label}
                </text>
              </g>
            );
          }),
        )}

        {/* snippets with real ledger values */}
        {snip.map((s, i) => {
          const [x, y] = snipPos[i];
          const w = s.length * 6.3 + 18;
          return (
            <g key={i} className="tree-snip" style={{ animationDelay: `${i * 1.25}s` }}>
              <rect x={x} y={y - 13} width={w} height="20" rx="5" fill="#fffcf7" stroke="#e0cdb9" />
              <text x={x + 9} y={y + 1} fontSize="10.5" fill="#3d3631" fontFamily="var(--font-mono)">
                {s}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
