"use client";

import { OrbitControls, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { AGENTS, type AgentId, type AgentMeta } from "@/lib/agents/meta";
import type { Station } from "@/lib/agents/types";
import { ROOM_HALF, STATIONS, stationPos, type StationMeta } from "@/lib/stations";

export interface RoomProps {
  activeAgent?: AgentId;
  messages: Partial<Record<AgentId, string>>;
  spoken: AgentId[];
  selected?: AgentId;
  onSelect?: (id: AgentId) => void;
  regionCenter?: { lat: number; lon: number };
  running: boolean;
  /** Which terminal each agent is currently walking to (absent = back to the seat). */
  targets: Partial<Record<AgentId, Station>>;
  activeStations: Station[];
  onStation?: (s: Station) => void;
  walk: boolean;
  onWalkChange?: (on: boolean) => void;
  onNearStation?: (s: Station | null) => void;
  /** "close" frames the room tighter (home page window); "card" for small previews. */
  view?: "wide" | "close" | "card";
  /** Hide name and terminal labels (small previews). */
  compact?: boolean;
  /** Render on demand only (idle previews); still renders briefly after mount. */
  paused?: boolean;
}

const C = {
  bg: "#e7e1d6",
  floor: "#c9a77d",
  plankA: "#c49f72",
  plankB: "#d0b088",
  rug: "#3e6f72",
  rugEdge: "#e2671c",
  table: "#b98a5a",
  desk: "#a8794c",
  accent: "#e2671c",
  glow: "#fff1dc",
  coat: "#ffffff",
  wallBack: "#cddbcf",
  wallSide: "#ece1cf",
  wainscotBack: "#9fb8a6",
  wainscotSide: "#d6c09f",
  rail: "#9a7048",
  ceiling: "#f6f1e9",
  metal: "#d9d4cc",
  rack: "#57524c",
  ring: "#cbbfae",
};

const SEAT_R = 4.4;
const GLOBE_Y = 2.6;
const GLOBE_R = 1.05;
const WALK_SPEED = 4.2;
const SKIN = ["#f1c7a5", "#c68c62", "#8d5a3b", "#e6b48f", "#a86f4c", "#f5d2b8", "#7a4a2e", "#d9a07a"];
const HAIR = ["#2a1a12", "#111111", "#5a3a22", "#c9c2b8", "#1c1c28", "#7b4a1e", "#0d0d0d", "#3b2a1a"];

type Pos = { x: number; z: number; rot: number };
type PosMap = MutableRefObject<Record<string, Pos>>;

function seatOf(i: number) {
  const theta = Math.PI + Math.PI / AGENTS.length + (i * 2 * Math.PI) / AGENTS.length;
  const x = SEAT_R * Math.sin(theta);
  const z = SEAT_R * Math.cos(theta);
  return { x, z, rotY: Math.atan2(-x, -z) };
}

function latLonToVec(lat: number, lon: number, r: number) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

const angleLerp = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

// ------------------------------------------------------------------ scientist

function Scientist({
  agent,
  index,
  active,
  spoken,
  selected,
  target,
  positions,
  onSelect,
}: {
  agent: AgentMeta;
  index: number;
  active: boolean;
  spoken: boolean;
  selected: boolean;
  target?: Station;
  positions: PosMap;
  onSelect?: (id: AgentId) => void;
}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const seat = seatOf(index);
  const color = useMemo(() => new THREE.Color(agent.color), [agent.color]);
  const glasses = index % 3 === 1;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const p = (positions.current[agent.id] ??= { x: seat.x, z: seat.z, rot: seat.rotY });
    const goal = target ? stationPos(target) : null;
    const gx = goal ? goal.stand.x : seat.x;
    const gz = goal ? goal.stand.z : seat.z;
    const dx = gx - p.x;
    const dz = gz - p.z;
    const dist = Math.hypot(dx, dz);
    const moving = dist > 0.06;
    if (moving) {
      const step = Math.min(dist, WALK_SPEED * dt);
      p.x += (dx / dist) * step;
      p.z += (dz / dist) * step;
      // keep walkers off the round table
      const r = Math.hypot(p.x, p.z);
      if (r < 3.0) {
        p.x *= 3.0 / Math.max(r, 0.01);
        p.z *= 3.0 / Math.max(r, 0.01);
      }
      p.rot = angleLerp(p.rot, Math.atan2(dx, dz), Math.min(1, dt * 10));
    } else {
      const face = goal ? Math.atan2(goal.x - p.x, goal.z - p.z) : seat.rotY;
      p.rot = angleLerp(p.rot, face, Math.min(1, dt * 6));
    }
    if (root.current) {
      root.current.position.set(p.x, 0, p.z);
      root.current.rotation.y = p.rot;
    }
    const swing = moving ? Math.sin(t * 11) * 0.55 : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (body.current)
      body.current.position.y = moving ? Math.abs(Math.sin(t * 11)) * 0.05 : active ? 0.04 + Math.abs(Math.sin(t * 5)) * 0.05 : Math.sin(t * 1.3 + index) * 0.012;
    if (head.current) {
      head.current.rotation.y = active && !moving ? Math.sin(t * 2.2) * 0.3 : 0;
      head.current.rotation.x = active && !moving ? -0.15 : 0;
    }
    if (ring.current) {
      const m = ring.current.material as THREE.MeshBasicMaterial;
      m.opacity = active ? 0.55 + Math.sin(t * 6) * 0.25 : selected ? 0.6 : spoken ? 0.28 : 0.08;
    }
  });

  return (
    <>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[seat.x, 0.02, seat.z]}>
        <ringGeometry args={[0.55, 0.85, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} />
      </mesh>
      {/* desk at the seat */}
      <group position={[seat.x, 0, seat.z]} rotation={[0, seat.rotY, 0]}>
        <group position={[0, 0, 0.75]}>
          <mesh position={[0, 0.72, 0]}>
            <boxGeometry args={[0.9, 0.06, 0.45]} />
            <meshStandardMaterial color={C.desk} metalness={0.2} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.36, 0]}>
            <boxGeometry args={[0.1, 0.72, 0.1]} />
            <meshStandardMaterial color={C.desk} />
          </mesh>
          <mesh position={[0, 0.98, -0.1]} rotation={[-0.35, Math.PI, 0]}>
            <planeGeometry args={[0.62, 0.36]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 1.2 : 0.35} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </group>
      <group
        ref={root}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(agent.id);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "default")}
      >
        <group ref={body}>
          <mesh ref={legL} position={[-0.13, 0.33, 0]}>
            <cylinderGeometry args={[0.09, 0.08, 0.66, 12]} />
            <meshStandardMaterial color="#26262a" />
          </mesh>
          <mesh ref={legR} position={[0.13, 0.33, 0]}>
            <cylinderGeometry args={[0.09, 0.08, 0.66, 12]} />
            <meshStandardMaterial color="#26262a" />
          </mesh>
          <mesh position={[0, 1.02, 0]}>
            <capsuleGeometry args={[0.32, 0.62, 8, 16]} />
            <meshStandardMaterial color={C.coat} roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.12, 0]} rotation={[0.25, 0, 0.6]}>
            <torusGeometry args={[0.33, 0.045, 8, 32]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.9 : 0.25} />
          </mesh>
          <mesh position={[0.14, 1.2, 0.31]}>
            <boxGeometry args={[0.12, 0.08, 0.02]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 1.4 : 0.5} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.4, 1.05, 0.08]} rotation={[active ? -0.9 : -0.3, 0, s * 0.25]}>
              <capsuleGeometry args={[0.08, 0.5, 6, 12]} />
              <meshStandardMaterial color="#e2e2e6" />
            </mesh>
          ))}
          <group ref={head} position={[0, 1.78, 0]}>
            <mesh>
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
                  <meshStandardMaterial color="#b9b9c0" metalness={0.8} roughness={0.2} />
                </mesh>
              ))}
          </group>
        </group>
      </group>
    </>
  );
}

// ------------------------------------------------------------------ data terminals

function Terminal({ s, active, onClick }: { s: StationMeta; active: boolean; onClick?: () => void }) {
  const pos = stationPos(s.id);
  const color = useMemo(() => new THREE.Color(s.color), [s.color]);
  const bars = useRef<THREE.Group>(null);
  const leds = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    bars.current?.children.forEach((b, i) => {
      const h = active ? 0.25 + Math.abs(Math.sin(t * 3 + i * 0.9)) * 0.55 : 0.12 + Math.abs(Math.sin(i * 1.7)) * 0.25;
      b.scale.y = h;
      b.position.y = -0.36 + h * 0.4;
    });
    leds.current?.children.forEach((l, i) => {
      const m = (l as THREE.Mesh).material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = active ? (Math.sin(t * 9 + i * 1.3) > 0 ? 2.2 : 0.2) : i % 3 === 0 ? 0.8 : 0.15;
    });
    if (halo.current) {
      const m = halo.current.material as THREE.MeshBasicMaterial;
      m.opacity = active ? 0.45 + Math.sin(t * 5) * 0.2 : 0.1;
    }
  });
  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, pos.rotY, 0]}>
      <group
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "default")}
      >
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[1.8, 1.2, 0.9]} />
          <meshStandardMaterial color={C.metal} metalness={0.2} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.25, 0.46]}>
          <boxGeometry args={[1.8, 0.12, 0.02]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
        </mesh>
        <mesh position={[0, 1.24, 0.12]} rotation={[-0.4, 0, 0]}>
          <boxGeometry args={[1.8, 0.06, 0.75]} />
          <meshStandardMaterial color="#232327" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.275, 0.2]} rotation={[-0.4, 0, 0]}>
          <planeGeometry args={[1.5, 0.5]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.6 : 0.12} />
        </mesh>
        <mesh position={[0, 2.15, -0.25]}>
          <boxGeometry args={[1.9, 1.15, 0.08]} />
          <meshStandardMaterial color="#0d0d0f" metalness={0.3} />
        </mesh>
        <mesh position={[0, 2.15, -0.2]}>
          <planeGeometry args={[1.75, 1.0]} />
          <meshStandardMaterial color="#060607" emissive={color} emissiveIntensity={active ? 0.18 : 0.05} />
        </mesh>
        <group ref={bars} position={[0, 2.15, -0.19]}>
          {Array.from({ length: 9 }).map((_, i) => (
            <mesh key={i} position={[-0.72 + i * 0.18, 0, 0]}>
              <boxGeometry args={[0.11, 0.8, 0.01]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 1.3 : 0.4} />
            </mesh>
          ))}
        </group>
        <mesh position={[0, 1.65, -0.25]}>
          <boxGeometry args={[0.12, 0.3, 0.12]} />
          <meshStandardMaterial color="#232327" />
        </mesh>
        {[-1.35, 1.35].map((x) => (
          <mesh key={x} position={[x, 1.3, -0.35]}>
            <boxGeometry args={[0.8, 2.6, 0.8]} />
            <meshStandardMaterial color={C.rack} metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
        <group ref={leds}>
          {[-1.35, 1.35].flatMap((x) =>
            Array.from({ length: 8 }).map((_, k) => (
              <mesh key={`${x}-${k}`} position={[x + (k % 2 ? 0.18 : -0.18), 0.4 + Math.floor(k / 2) * 0.55, 0.06]}>
                <boxGeometry args={[0.22, 0.04, 0.02]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
              </mesh>
            )),
          )}
        </group>
      </group>
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 1.65]}>
        <ringGeometry args={[0.5, 0.8, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} />
      </mesh>
      <pointLight position={[0, 2.6, 1.4]} color={s.color} intensity={active ? 6 : 1.6} distance={active ? 6 : 4.5} />
    </group>
  );
}

/** A glowing data stream from the terminal to the agent standing at it. */
function DataStream({ station, agent, positions, color }: { station: Station; agent: AgentId; positions: PosMap; color: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame((state) => {
    const p = positions.current[agent];
    const s = stationPos(station);
    if (!mesh.current || !p) return;
    const near = Math.hypot(p.x - s.stand.x, p.z - s.stand.z) < 0.5;
    mesh.current.visible = near;
    if (!near) return;
    a.set(s.screen.x, 2.15, s.screen.z);
    b.set(p.x, 1.8, p.z);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    mesh.current.position.copy(mid);
    mesh.current.scale.set(1, dir.length(), 1);
    mesh.current.quaternion.setFromUnitVectors(up, dir.normalize());
    (mesh.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(state.clock.elapsedTime * 12) * 0.2;
  });
  return (
    <mesh ref={mesh} visible={false}>
      <cylinderGeometry args={[0.035, 0.035, 1, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} />
    </mesh>
  );
}

// ------------------------------------------------------------------ globe

function GlobeSurface() {
  const tex = useTexture("/api/globe-texture");
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh>
      <sphereGeometry args={[GLOBE_R, 64, 64]} />
      <meshStandardMaterial map={tex} emissive="#222" emissiveIntensity={0.15} roughness={0.8} />
    </mesh>
  );
}

function Globe({ regionCenter, running }: { regionCenter?: { lat: number; lon: number }; running: boolean }) {
  const group = useRef<THREE.Group>(null);
  const marker = useMemo(() => (regionCenter ? latLonToVec(regionCenter.lat, regionCenter.lon, GLOBE_R * 1.01) : null), [regionCenter]);
  const targetRot = useMemo(() => (regionCenter ? Math.PI / 2 - ((regionCenter.lon + 180) / 360) * Math.PI * 2 : null), [regionCenter]);
  useFrame((_, dt) => {
    if (!group.current) return;
    if (targetRot !== null && !running) group.current.rotation.y += (targetRot - group.current.rotation.y) * Math.min(1, dt * 1.5);
    else group.current.rotation.y += dt * (running ? 0.35 : 0.12);
  });
  return (
    <group position={[0, GLOBE_Y, 0]}>
      <group ref={group} rotation={[0.25, 0, 0]}>
        <Suspense
          fallback={
            <mesh>
              <sphereGeometry args={[GLOBE_R, 32, 32]} />
              <meshBasicMaterial color="#555" wireframe />
            </mesh>
          }
        >
          <GlobeSurface />
        </Suspense>
        {marker && (
          <mesh position={marker}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshBasicMaterial color={C.accent} />
          </mesh>
        )}
      </group>
      <mesh>
        <sphereGeometry args={[GLOBE_R * 1.12, 48, 48]} />
        <meshBasicMaterial color={C.glow} transparent opacity={0.06} side={THREE.BackSide} />
      </mesh>
      <pointLight color={C.glow} intensity={4} distance={6} />
    </group>
  );
}

// ------------------------------------------------------------------ player (walk mode)

function WalkPlayer({
  onExit,
  onNear,
  onInteract,
}: {
  onExit?: () => void;
  onNear?: (s: Station | null) => void;
  onInteract?: (s: Station) => void;
}) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(-0.05);
  const near = useRef<Station | null>(null);
  const cb = useRef({ onExit, onNear, onInteract });
  cb.current = { onExit, onNear, onInteract };

  useEffect(() => {
    camera.position.set(0, 1.7, ROOM_HALF - 1.6);
    yaw.current = 0;
    pitch.current = -0.05;
    const el = gl.domElement;
    const lock = () => {
      if (document.pointerLockElement !== el) void el.requestPointerLock();
    };
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) return;
      yaw.current -= e.movementX * 0.0022;
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current - e.movementY * 0.0022));
    };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      keys.current[e.code] = true;
      if (e.code === "KeyE" && near.current) {
        if (document.pointerLockElement === el) document.exitPointerLock();
        cb.current.onInteract?.(near.current);
      }
      if (e.code === "KeyQ") cb.current.onExit?.();
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    el.addEventListener("click", lock);
    window.addEventListener("mousemove", move);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      el.removeEventListener("click", lock);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      if (document.pointerLockElement === el) document.exitPointerLock();
      camera.position.set(0, 17, 25);
      camera.lookAt(0, 0.6, 0);
    };
  }, [camera, gl]);

  useFrame((_, dt) => {
    const k = keys.current;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const side = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const speed = (k.ShiftLeft || k.ShiftRight ? 7 : 3.8) * dt;
    const sy = Math.sin(yaw.current);
    const cy = Math.cos(yaw.current);
    let x = camera.position.x + (-sy * fwd + cy * side) * speed;
    let z = camera.position.z + (-cy * fwd - sy * side) * speed;
    const lim = ROOM_HALF - 0.6;
    x = Math.max(-lim, Math.min(lim, x));
    z = Math.max(-lim, Math.min(lim, z));
    const r = Math.hypot(x, z);
    if (r < 3.0) {
      x *= 3.0 / Math.max(r, 0.01);
      z *= 3.0 / Math.max(r, 0.01);
    }
    for (const s of STATIONS) {
      const p = stationPos(s.id);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 1.9) {
        x = p.x + ((x - p.x) / d) * 1.9;
        z = p.z + ((z - p.z) / d) * 1.9;
      }
    }
    camera.position.set(x, 1.7, z);
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    let best: Station | null = null;
    let bd = 3.2;
    for (const s of STATIONS) {
      const p = stationPos(s.id);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < bd) {
        bd = d;
        best = s.id;
      }
    }
    if (best !== near.current) {
      near.current = best;
      cb.current.onNear?.(best);
    }
  });
  return null;
}

// ------------------------------------------------------------------ DOM labels

function LabelProjector({
  labels,
  stationLabels,
  bubble,
  activeAgent,
  positions,
}: {
  labels: MutableRefObject<(HTMLDivElement | null)[]>;
  stationLabels: MutableRefObject<(HTMLDivElement | null)[]>;
  bubble: MutableRefObject<HTMLDivElement | null>;
  activeAgent?: AgentId;
  positions: PosMap;
}) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  const w = useMemo(() => new THREE.Vector3(), []);
  const camDir = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    camera.getWorldDirection(camDir);
    const place = (el: HTMLElement | null, x: number, y: number, z: number, clamp = false) => {
      if (!el) return;
      w.set(x, y, z);
      const behind = w.clone().sub(camera.position).dot(camDir) < 0;
      const far = camera.position.distanceTo(w);
      v.copy(w).project(camera);
      el.style.visibility = behind || far > 34 ? "hidden" : "visible";
      let px = ((v.x + 1) / 2) * size.width;
      let py = ((1 - v.y) / 2) * size.height;
      if (clamp) {
        const hw = el.offsetWidth / 2 + 8;
        const hh = el.offsetHeight / 2 + 8;
        px = Math.min(Math.max(px, hw), size.width - hw);
        py = Math.min(Math.max(py, hh), size.height - hh);
      }
      el.style.transform = `translate(-50%, -50%) translate(${px}px, ${py}px)`;
    };
    AGENTS.forEach((a, i) => {
      const p = positions.current[a.id] ?? seatOf(i);
      place(labels.current[i], p.x, 2.3, p.z);
    });
    STATIONS.forEach((s, i) => {
      const p = stationPos(s.id);
      place(stationLabels.current[i], p.screen.x, 3.1, p.screen.z);
    });
    if (activeAgent) {
      const p = positions.current[activeAgent];
      if (p) place(bubble.current, p.x, 3.3, p.z, true);
    }
  });
  return null;
}

// ------------------------------------------------------------------ the square lab

/** A real room: plank floor, rug, painted walls with wainscot, windows, plants and a ceiling with lights.
 * The front wall (+z) is a cutaway so the orbit camera can look in; the ceiling hides when seen from above. */
function LabRoom() {
  const H = ROOM_HALF;
  const WALL_H = 4.2;
  const planks = useMemo(() => Array.from({ length: Math.round((H * 2) / 0.8) }, (_, i) => ({ x: -H + 0.4 + i * 0.8, c: i % 2 ? C.plankA : C.plankB })), [H]);
  const wall = (pos: [number, number, number], rotY: number, key: string, paint: string, wainscot: string) => (
    <group key={key} position={pos} rotation={[0, rotY, 0]}>
      <mesh position={[0, WALL_H / 2, 0]}>
        <planeGeometry args={[H * 2, WALL_H]} />
        <meshStandardMaterial color={paint} roughness={0.95} />
      </mesh>
      {/* wainscot panel, chair rail, skirting */}
      <mesh position={[0, 0.6, 0.02]}>
        <planeGeometry args={[H * 2, 1.2]} />
        <meshStandardMaterial color={wainscot} roughness={0.85} />
      </mesh>
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} position={[-H + 1 + i * 2, 0.6, 0.03]}>
          <planeGeometry args={[1.6, 0.8]} />
          <meshStandardMaterial color={wainscot} roughness={0.7} emissive={wainscot} emissiveIntensity={0.05} />
        </mesh>
      ))}
      <mesh position={[0, 1.22, 0.05]}>
        <boxGeometry args={[H * 2, 0.07, 0.07]} />
        <meshStandardMaterial color={C.rail} />
      </mesh>
      <mesh position={[0, 0.1, 0.04]}>
        <boxGeometry args={[H * 2, 0.2, 0.06]} />
        <meshStandardMaterial color={C.rail} />
      </mesh>
    </group>
  );
  const windowAt = (x: number, z: number, rotY: number, key: string) => (
    <group key={key} position={[x, 2.45, z]} rotation={[0, rotY, 0]}>
      <mesh>
        <boxGeometry args={[2.6, 1.7, 0.08]} />
        <meshStandardMaterial color="#f8f4ee" />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[2.3, 1.4]} />
        <meshStandardMaterial color="#bfe0f2" emissive="#cfe9f7" emissiveIntensity={0.55} />
      </mesh>
      <mesh position={[0, 0, 0.07]}>
        <boxGeometry args={[0.06, 1.4, 0.03]} />
        <meshStandardMaterial color="#f8f4ee" />
      </mesh>
      <mesh position={[0, 0, 0.07]}>
        <boxGeometry args={[2.3, 0.06, 0.03]} />
        <meshStandardMaterial color="#f8f4ee" />
      </mesh>
      <pointLight position={[0, 0, 1.2]} intensity={1.2} distance={6} color="#dff0ff" />
    </group>
  );
  const plant = (x: number, z: number, key: string, tall = false) => (
    <group key={key} position={[x, 0, z]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.32, 0.24, 0.6, 20]} />
        <meshStandardMaterial color="#c4683f" roughness={0.8} />
      </mesh>
      {(tall
        ? [[0, 1.0, 0, 0.42], [0.18, 1.45, 0.08, 0.36], [-0.15, 1.75, -0.05, 0.3], [0.05, 2.05, 0.1, 0.24]]
        : [[0, 0.85, 0, 0.42], [0.22, 1.05, 0.1, 0.3], [-0.2, 1.1, -0.08, 0.32]]
      ).map(([px, py, pz, r], i) => (
        <mesh key={i} position={[px, py, pz]}>
          <sphereGeometry args={[r, 14, 14]} />
          <meshStandardMaterial color={i % 2 ? "#5f9d5a" : "#4b8448"} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
  return (
    <group>
      {/* oak plank floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[H * 2, H * 2]} />
        <meshStandardMaterial color={C.floor} roughness={0.7} />
      </mesh>
      {planks.map((pl, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[pl.x, 0.004, 0]} receiveShadow>
          <planeGeometry args={[0.76, H * 2]} />
          <meshStandardMaterial color={pl.c} roughness={0.65} />
        </mesh>
      ))}
      {/* round rug under the table */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <circleGeometry args={[3.7, 72]} />
        <meshStandardMaterial color={C.rug} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
        <ringGeometry args={[3.5, 3.62, 72]} />
        <meshStandardMaterial color={C.rugEdge} roughness={1} />
      </mesh>
      {wall([0, 0, -H], 0, "back", C.wallBack, C.wainscotBack)}
      {wall([-H, 0, 0], Math.PI / 2, "left", C.wallSide, C.wainscotSide)}
      {wall([H, 0, 0], -Math.PI / 2, "right", C.wallSide, C.wainscotSide)}
      {wall([0, 0, H], Math.PI, "front", C.wallSide, C.wainscotSide)}
      {windowAt(-H + 0.06, -8.6, Math.PI / 2, "wl")}
      {windowAt(H - 0.06, -8.6, -Math.PI / 2, "wr")}
      {windowAt(-H + 0.06, 9.2, Math.PI / 2, "wl2")}
      {windowAt(H - 0.06, 9.2, -Math.PI / 2, "wr2")}
      {/* back-wall data display between the two terminals */}
      <group position={[0, 0, -H + 0.08]}>
        <mesh position={[0, 2.5, 0]}>
          <boxGeometry args={[4.6, 2.0, 0.08]} />
          <meshStandardMaterial color="#2a2623" />
        </mesh>
        <mesh position={[0, 2.5, 0.05]}>
          <planeGeometry args={[4.4, 1.8]} />
          <meshStandardMaterial color="#1c1916" emissive={C.accent} emissiveIntensity={0.06} />
        </mesh>
        {Array.from({ length: 20 }).map((_, i) => (
          <mesh key={i} position={[-2 + i * 0.21, 1.85 + Math.abs(Math.sin(i * 0.8)) * 0.15 + i * 0.045, 0.06]}>
            <boxGeometry args={[0.12, 0.05, 0.01]} />
            <meshStandardMaterial color={C.accent} emissive={C.accent} emissiveIntensity={1.1} />
          </mesh>
        ))}
      </group>
      {plant(-H + 1, -H + 1, "p1", true)}
      {plant(H - 1, -H + 1, "p2", true)}
      {plant(-H + 1, H - 1.2, "p3")}
      {plant(H - 1, H - 1.2, "p4")}
      {plant(-1.6, -H + 0.9, "p5")}
      {plant(1.6, -H + 0.9, "p6")}
      {/* ceiling with light panels (faces down, hidden from above) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_H, 0]}>
        <planeGeometry args={[H * 2, H * 2]} />
        <meshStandardMaterial color={C.ceiling} roughness={1} />
      </mesh>
      {[-6, 0, 6].flatMap((x) =>
        [-6, 0, 6].map((z) => (
          <group key={`${x}${z}`} position={[x, WALL_H - 0.02, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[2.4, 0.9]} />
              <meshStandardMaterial color="#fff4e3" emissive="#fff4e3" emissiveIntensity={0.9} />
            </mesh>
            {x === 0 || z === 0 ? <pointLight position={[0, -0.4, 0]} intensity={2.2} distance={9} color="#fff1dc" /> : null}
          </group>
        )),
      )}
    </group>
  );
}

// ------------------------------------------------------------------ scene

function Scene(
  props: RoomProps & {
    labels: MutableRefObject<(HTMLDivElement | null)[]>;
    stationLabels: MutableRefObject<(HTMLDivElement | null)[]>;
    bubble: MutableRefObject<HTMLDivElement | null>;
    positions: PosMap;
    warm?: boolean;
  },
) {
  return (
    <Canvas
      shadows={!props.compact}
      frameloop={props.paused && !props.warm ? "demand" : "always"}
      camera={{ position: props.view === "card" ? [0, 14.5, 15.5] : props.view === "close" ? [0, 12.5, 18.5] : [0, 17, 25], fov: props.view === "card" ? 44 : 48 }}
      dpr={props.compact ? [1, 1.25] : [1, 1.75]}
    >
      <color attach="background" args={[C.bg]} />
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#ffffff", "#d8cfc2", 0.7]} />
      <directionalLight position={[6, 14, 8]} intensity={0.7} castShadow />
      <LabRoom />

      <mesh position={[0, 0.85, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[2.3, 2.3, 0.12, 64]} />
        <meshStandardMaterial color={C.table} metalness={0.1} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.92, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.3, 0.025, 8, 96]} />
        <meshStandardMaterial color={C.accent} emissive={C.accent} emissiveIntensity={1.1} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.5, 0.7, 0.8, 32]} />
        <meshStandardMaterial color={C.desk} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <coneGeometry args={[1.0, 1.4, 48, 1, true]} />
        <meshBasicMaterial color={C.glow} transparent opacity={0.05} side={THREE.DoubleSide} />
      </mesh>

      <Globe regionCenter={props.regionCenter} running={props.running} />

      {STATIONS.map((s) => (
        <Terminal key={s.id} s={s} active={props.activeStations.includes(s.id)} onClick={() => props.onStation?.(s.id)} />
      ))}

      {AGENTS.map((a, i) => (
        <Scientist
          key={a.id}
          agent={a}
          index={i}
          active={props.activeAgent === a.id}
          spoken={props.spoken.includes(a.id)}
          selected={props.selected === a.id}
          target={props.targets[a.id]}
          positions={props.positions}
          onSelect={props.onSelect}
        />
      ))}
      {Object.entries(props.targets).map(([agent, st]) =>
        st ? <DataStream key={agent} station={st} agent={agent as AgentId} positions={props.positions} color={STATIONS.find((s) => s.id === st)!.color} /> : null,
      )}

      <LabelProjector labels={props.labels} stationLabels={props.stationLabels} bubble={props.bubble} activeAgent={props.activeAgent} positions={props.positions} />
      {props.walk ? (
        <WalkPlayer onExit={() => props.onWalkChange?.(false)} onNear={props.onNearStation} onInteract={(s) => props.onStation?.(s)} />
      ) : (
        !props.compact && <OrbitControls makeDefault enablePan={false} minDistance={6} maxDistance={32} maxPolarAngle={Math.PI / 2.1} target={[0, 0.6, 0]} />
      )}
    </Canvas>
  );
}

export default function AgentRoom(props: RoomProps) {
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const stationLabels = useRef<(HTMLDivElement | null)[]>([]);
  const bubble = useRef<HTMLDivElement | null>(null);
  const positions = useRef<Record<string, Pos>>({});
  const [warm, setWarm] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setWarm(false), 3000);
    return () => clearTimeout(t);
  }, []);
  const active = props.activeAgent ? AGENTS.find((a) => a.id === props.activeAgent) : undefined;
  const msg = active ? props.messages[active.id] : undefined;
  const plain = msg?.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Scene {...props} labels={labels} stationLabels={stationLabels} bubble={bubble} positions={positions} warm={warm} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", display: props.compact ? "none" : undefined }}>
        {STATIONS.map((s, i) => {
          const on = props.activeStations.includes(s.id);
          return (
            <div
              key={s.id}
              ref={(el) => {
                stationLabels.current[i] = el;
              }}
              className={`stationplate ${on ? "on" : ""}`}
              style={{ position: "absolute", left: 0, top: 0, borderColor: on ? s.color : undefined, color: on ? s.color : undefined }}
            >
              {s.name}
              <small>{s.sub}</small>
            </div>
          );
        })}
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
          style={{ position: "absolute", left: 0, top: 0, borderColor: active?.color, display: active && plain ? "block" : "none", transform: "translate(-9999px, 0)" }}
        >
          {active && (
            <>
              <b style={{ color: active.color }}>{active.name}</b>
              {plain && plain.length > 190 ? `${plain.slice(0, 187)}...` : plain}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
