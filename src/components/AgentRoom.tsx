"use client";

import { Line, OrbitControls, Stars, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { AGENTS, type AgentId, type AgentMeta } from "@/lib/agents/meta";
import { THEME_EVENT } from "@/lib/themes";

const ROOM_TOKENS = ["room-bg", "room-floor", "room-grid-1", "room-grid-2", "room-ring", "room-table", "room-accent", "room-glow", "room-coat"] as const;
type RoomColors = Record<(typeof ROOM_TOKENS)[number], string>;
const FALLBACK: RoomColors = {
  "room-bg": "#040812", "room-floor": "#0a1122", "room-grid-1": "#1b2c52", "room-grid-2": "#0f1a33", "room-ring": "#1f3c70",
  "room-table": "#121a2e", "room-accent": "#e0892b", "room-glow": "#4aa3ff", "room-coat": "#e9eef6",
};

function readRoomColors(): RoomColors {
  if (typeof window === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK };
  for (const k of ROOM_TOKENS) {
    const v = cs.getPropertyValue(`--${k}`).trim();
    if (v) out[k] = v;
  }
  return out;
}

/** Room colours follow the page theme (CSS tokens), and update when the theme changes. */
function useRoomColors() {
  const [c, setC] = useState<RoomColors>(FALLBACK);
  useEffect(() => {
    const update = () => setC(readRoomColors());
    update();
    window.addEventListener(THEME_EVENT, update);
    return () => window.removeEventListener(THEME_EVENT, update);
  }, []);
  return c;
}

export interface RoomProps {
  activeAgent?: AgentId;
  messages: Partial<Record<AgentId, string>>;
  spoken: AgentId[];
  selected?: AgentId;
  onSelect?: (id: AgentId) => void;
  regionCenter?: { lat: number; lon: number };
  running: boolean;
}

const RADIUS = 4.4;
const GLOBE_Y = 2.6;
const GLOBE_R = 1.05;

const SKIN = ["#f1c7a5", "#c68c62", "#8d5a3b", "#e6b48f", "#a86f4c", "#f5d2b8", "#7a4a2e", "#d9a07a"];
const HAIR = ["#2a1a12", "#111111", "#5a3a22", "#c9c2b8", "#1c1c28", "#7b4a1e", "#0d0d0d", "#3b2a1a"];

function seatOf(i: number) {
  // offset by half a seat so nobody sits directly behind the globe or in front of the camera
  const theta = Math.PI + Math.PI / AGENTS.length + (i * 2 * Math.PI) / AGENTS.length;
  const x = RADIUS * Math.sin(theta);
  const z = RADIUS * Math.cos(theta);
  return { x, z, rotY: Math.atan2(-x, -z) };
}

function latLonToVec(lat: number, lon: number, r: number) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

function Scientist({
  agent,
  index,
  active,
  spoken,
  selected,
  message,
  onSelect,
  colors,
}: {
  agent: AgentMeta;
  index: number;
  active: boolean;
  spoken: boolean;
  selected: boolean;
  message?: string;
  onSelect?: (id: AgentId) => void;
  colors: RoomColors;
}) {
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const seat = seatOf(index);
  const color = useMemo(() => new THREE.Color(agent.color), [agent.color]);
  const glasses = index % 3 === 1;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (body.current) body.current.position.y = active ? 0.05 + Math.abs(Math.sin(t * 5)) * 0.07 : Math.sin(t * 1.3 + index) * 0.012;
    if (head.current) {
      head.current.rotation.y = active ? Math.sin(t * 2.2) * 0.35 : Math.sin(t * 0.5 + index) * 0.08;
      head.current.rotation.x = active ? -0.18 : 0;
    }
    if (ring.current) {
      const m = ring.current.material as THREE.MeshBasicMaterial;
      m.opacity = active ? 0.55 + Math.sin(t * 6) * 0.25 : selected ? 0.6 : spoken ? 0.3 : 0.08;
    }
  });

  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.rotY, 0]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.55, 0.85, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} />
      </mesh>

      <group
        ref={body}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(agent.id);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "default")}
      >
        {/* legs */}
        {[-0.13, 0.13].map((x) => (
          <mesh key={x} position={[x, 0.33, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.08, 0.66, 12]} />
            <meshStandardMaterial color="#1f2433" />
          </mesh>
        ))}
        {/* lab coat */}
        <mesh position={[0, 1.02, 0]} castShadow>
          <capsuleGeometry args={[0.32, 0.62, 8, 16]} />
          <meshStandardMaterial color={colors["room-coat"]} roughness={0.6} />
        </mesh>
        {/* role sash */}
        <mesh position={[0, 1.12, 0]} rotation={[0.25, 0, 0.6]}>
          <torusGeometry args={[0.33, 0.045, 8, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.9 : 0.25} />
        </mesh>
        {/* badge */}
        <mesh position={[0.14, 1.2, 0.31]}>
          <boxGeometry args={[0.12, 0.08, 0.02]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 1.4 : 0.5} />
        </mesh>
        {/* arms */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.4, 1.05, 0.08]} rotation={[active ? -0.9 : -0.3, 0, s * 0.25]}>
            <capsuleGeometry args={[0.08, 0.5, 6, 12]} />
            <meshStandardMaterial color="#dfe5ee" />
          </mesh>
        ))}
        {/* head */}
        <group ref={head} position={[0, 1.78, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.27, 24, 24]} />
            <meshStandardMaterial color={SKIN[index % SKIN.length]} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.07, -0.02]} scale={[1.04, 0.85, 1.04]}>
            <sphereGeometry args={[0.27, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={HAIR[index % HAIR.length]} roughness={0.9} />
          </mesh>
          {[-0.09, 0.09].map((x) => (
            <mesh key={x} position={[x, 0.02, 0.245]}>
              <sphereGeometry args={[0.035, 12, 12]} />
              <meshStandardMaterial color="#111" />
            </mesh>
          ))}
          {glasses &&
            [-0.09, 0.09].map((x) => (
              <mesh key={`g${x}`} position={[x, 0.02, 0.27]}>
                <torusGeometry args={[0.06, 0.012, 8, 20]} />
                <meshStandardMaterial color="#aab4c8" metalness={0.8} roughness={0.2} />
              </mesh>
            ))}
        </group>
      </group>

      {/* desk console in front of the scientist */}
      <group position={[0, 0, 0.75]}>
        <mesh position={[0, 0.72, 0]}>
          <boxGeometry args={[0.9, 0.06, 0.45]} />
          <meshStandardMaterial color={colors["room-table"]} metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.36, 0]}>
          <boxGeometry args={[0.1, 0.72, 0.1]} />
          <meshStandardMaterial color={colors["room-table"]} />
        </mesh>
        <mesh position={[0, 0.98, -0.1]} rotation={[-0.35, Math.PI, 0]}>
          <planeGeometry args={[0.62, 0.36]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 1.2 : 0.35} side={THREE.DoubleSide} />
        </mesh>
      </group>

    </group>
  );
}

function GlobeSurface() {
  const tex = useTexture("/api/globe-texture");
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh>
      <sphereGeometry args={[GLOBE_R, 64, 64]} />
      <meshStandardMaterial map={tex} emissive="#1b3a6b" emissiveIntensity={0.25} roughness={0.8} />
    </mesh>
  );
}

function Globe({ regionCenter, running, colors }: { regionCenter?: { lat: number; lon: number }; running: boolean; colors: RoomColors }) {
  const group = useRef<THREE.Group>(null);
  const marker = useMemo(() => (regionCenter ? latLonToVec(regionCenter.lat, regionCenter.lon, GLOBE_R * 1.01) : null), [regionCenter]);
  const targetRot = useMemo(() => {
    if (!regionCenter) return null;
    // rotate so the region faces the camera (+z)
    const phi = ((regionCenter.lon + 180) / 360) * Math.PI * 2;
    return Math.PI / 2 - phi;
  }, [regionCenter]);
  useFrame((_, dt) => {
    if (!group.current) return;
    if (targetRot !== null && !running) {
      group.current.rotation.y += (targetRot - group.current.rotation.y) * Math.min(1, dt * 1.5);
    } else group.current.rotation.y += dt * (running ? 0.35 : 0.12);
  });
  return (
    <group position={[0, GLOBE_Y, 0]}>
      <group ref={group} rotation={[0.25, 0, 0]}>
        <Suspense
          fallback={
            <mesh>
              <sphereGeometry args={[GLOBE_R, 32, 32]} />
              <meshBasicMaterial color="#2a5aa0" wireframe />
            </mesh>
          }
        >
          <GlobeSurface />
        </Suspense>
        {marker && (
          <mesh position={marker}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshBasicMaterial color={colors["room-accent"]} />
          </mesh>
        )}
      </group>
      <mesh>
        <sphereGeometry args={[GLOBE_R * 1.12, 48, 48]} />
        <meshBasicMaterial color={colors["room-glow"]} transparent opacity={0.1} side={THREE.BackSide} />
      </mesh>
      <pointLight color={colors["room-glow"]} intensity={6} distance={6} />
    </group>
  );
}

function Beam({ index, color }: { index: number; color: string }) {
  const ref = useRef<{ material: { dashOffset: number } } | null>(null);
  const seat = seatOf(index);
  useFrame((_, dt) => {
    if (ref.current) ref.current.material.dashOffset -= dt * 2;
  });
  return (
    <Line
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      points={[
        [seat.x * 0.95, 1.95, seat.z * 0.95],
        [0, GLOBE_Y, 0],
      ]}
      color={color}
      lineWidth={2.2}
      dashed
      dashSize={0.25}
      gapSize={0.15}
      transparent
      opacity={0.9}
    />
  );
}

/**
 * Projects each seat's label anchor to screen space every frame and moves plain DOM elements there.
 * (One overlay in the page's own React tree instead of drei <Html>, which creates a React root per label.)
 */
function LabelProjector({
  labels,
  bubble,
  activeIdx,
}: {
  labels: MutableRefObject<(HTMLDivElement | null)[]>;
  bubble: MutableRefObject<HTMLDivElement | null>;
  activeIdx: number;
}) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const place = (el: HTMLElement | null, i: number, y: number, clamp = false) => {
      if (!el) return;
      const s = seatOf(i);
      v.set(s.x, y, s.z).project(camera);
      el.style.visibility = v.z > 1 ? "hidden" : "visible";
      let px = ((v.x + 1) / 2) * size.width;
      let py = ((1 - v.y) / 2) * size.height;
      if (clamp) {
        // keep the speech bubble fully inside the room frame
        const hw = el.offsetWidth / 2 + 8;
        const hh = el.offsetHeight / 2 + 8;
        px = Math.min(Math.max(px, hw), size.width - hw);
        py = Math.min(Math.max(py, hh), size.height - hh);
      }
      el.style.transform = `translate(-50%, -50%) translate(${px}px, ${py}px)`;
    };
    AGENTS.forEach((_, i) => place(labels.current[i], i, 2.3));
    if (activeIdx >= 0) place(bubble.current, activeIdx, 3.25, true);
  });
  return null;
}

export default function AgentRoom(props: RoomProps) {
  const activeIdx = AGENTS.findIndex((a) => a.id === props.activeAgent);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const bubble = useRef<HTMLDivElement | null>(null);
  const active = activeIdx >= 0 ? AGENTS[activeIdx] : undefined;
  const msg = active ? props.messages[active.id] : undefined;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Scene {...props} activeIdx={activeIdx} labels={labels} bubble={bubble} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        {AGENTS.map((a, i) => (
          <div
            key={a.id}
            ref={(el) => {
              labels.current[i] = el;
            }}
            className="nameplate"
            style={{ position: "absolute", left: 0, top: 0, color: a.color, borderColor: props.selected === a.id ? a.color : undefined }}
          >
            {a.name}
          </div>
        ))}
        <div
          ref={bubble}
          className="bubble"
          style={{ position: "absolute", left: 0, top: 0, borderColor: active?.color, display: active && msg ? "block" : "none", transform: "translate(-9999px, 0)" }}
        >
          {active && (
            <>
              <b style={{ color: active.color }}>{active.name}</b>
              {msg && msg.length > 180 ? `${msg.slice(0, 177)}...` : msg}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Scene(
  props: RoomProps & {
    activeIdx: number;
    labels: MutableRefObject<(HTMLDivElement | null)[]>;
    bubble: MutableRefObject<HTMLDivElement | null>;
  },
) {
  const activeIdx = props.activeIdx;
  const c = useRoomColors();
  return (
    <Canvas shadows camera={{ position: [0, 7.2, 10], fov: 46 }} dpr={[1, 1.75]}>
      <LabelProjector labels={props.labels} bubble={props.bubble} activeIdx={activeIdx} />
      <color attach="background" args={[c["room-bg"]]} />
      <fog attach="fog" args={[c["room-bg"], 14, 26]} />
      <Stars radius={60} depth={30} count={2500} factor={3} fade speed={0.6} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={["#9cc8ff", "#0b1020", 0.5]} />
      <directionalLight position={[6, 10, 6]} intensity={1.1} castShadow />
      <directionalLight position={[0, 6, -12]} intensity={0.9} color="#cfe3ff" />
      <directionalLight position={[0, 5, 12]} intensity={0.5} />

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[9, 64]} />
        <meshStandardMaterial color={c["room-floor"]} roughness={0.9} />
      </mesh>
      <gridHelper key={c["room-grid-1"] + c["room-grid-2"]} args={[18, 36, c["room-grid-1"], c["room-grid-2"]]} position={[0, 0.01, 0]} />
      {[3, 6.2].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <ringGeometry args={[r, r + 0.03, 96]} />
          <meshBasicMaterial color={c["room-ring"]} />
        </mesh>
      ))}

      {/* round table + holo projector */}
      <mesh position={[0, 0.85, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[2.3, 2.3, 0.12, 64]} />
        <meshStandardMaterial color={c["room-table"]} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.92, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.3, 0.025, 8, 96]} />
        <meshStandardMaterial color={c["room-accent"]} emissive={c["room-accent"]} emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.5, 0.7, 0.8, 32]} />
        <meshStandardMaterial color={c["room-table"]} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <coneGeometry args={[1.0, 1.4, 48, 1, true]} />
        <meshBasicMaterial color={c["room-glow"]} transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>

      <Globe regionCenter={props.regionCenter} running={props.running} colors={c} />

      {AGENTS.map((a, i) => (
        <Scientist
          key={a.id}
          agent={a}
          index={i}
          active={props.activeAgent === a.id}
          spoken={props.spoken.includes(a.id)}
          selected={props.selected === a.id}
          message={props.messages[a.id]}
          onSelect={props.onSelect}
          colors={c}
        />
      ))}
      {activeIdx >= 0 && <Beam index={activeIdx} color={AGENTS[activeIdx].color} />}

      <OrbitControls enablePan={false} minDistance={6} maxDistance={16} maxPolarAngle={Math.PI / 2.15} target={[0, 1.4, 0]} />
    </Canvas>
  );
}
