// The data terminals in the 3D lab. One per external service the agents call. Client-safe.
import type { Station } from "./agents/types";

export interface StationMeta {
  id: Station;
  name: string;
  sub: string;
  color: string;
  about: string;
  home: string;
}

export const STATIONS: StationMeta[] = [
  { id: "power", name: "NASA POWER", sub: "MERRA-2 · CERES", color: "#e8833a", about: "Monthly and daily climate records for any point on Earth since 1981.", home: "https://power.larc.nasa.gov/" },
  { id: "gibs", name: "NASA GIBS", sub: "satellite imagery", color: "#3fb68b", about: "Daily MODIS true-colour satellite images through NASA's imagery service.", home: "https://nasa-gibs.github.io/gibs-api-docs/" },
  { id: "eonet", name: "NASA EONET", sub: "natural events", color: "#e5a83b", about: "Wildfires, storms, floods, volcanoes and more, tracked by NASA's Earth Observatory.", home: "https://eonet.gsfc.nasa.gov/" },
  { id: "firms", name: "NASA FIRMS", sub: "active fires", color: "#e5484d", about: "Near-real-time fire detections from the VIIRS and MODIS satellite instruments.", home: "https://firms.modaps.eosdis.nasa.gov/" },
  { id: "cmr", name: "NASA CMR", sub: "dataset catalogue", color: "#8ab4f8", about: "NASA's Common Metadata Repository: the full-resolution datasets behind each variable.", home: "https://cmr.earthdata.nasa.gov/search/" },
  { id: "claude", name: "Our AI", sub: "language + vision", color: "#b392f0", about: "Plans the case from your question, writes the bilingual brief from ledger rows only, and describes satellite images.", home: "/system" },
];

export const stationById = (id: Station) => STATIONS.find((s) => s.id === id)!;

/** Half-width of the square lab (walls at +-ROOM_HALF). The front wall (+z) is the open side. */
export const ROOM_HALF = 12;
const WALL = ROOM_HALF - 1.0;

/** Terminals stand against the back, left and right walls, two per wall, facing into the room. */
const LAYOUT: Record<Station, { x: number; z: number; rotY: number }> = {
  power: { x: -4.6, z: -WALL, rotY: 0 },
  gibs: { x: 4.6, z: -WALL, rotY: 0 },
  cmr: { x: -WALL, z: -3.2, rotY: Math.PI / 2 },
  claude: { x: -WALL, z: 4.2, rotY: Math.PI / 2 },
  eonet: { x: WALL, z: -3.2, rotY: -Math.PI / 2 },
  firms: { x: WALL, z: 4.2, rotY: -Math.PI / 2 },
};

/** Terminal position, facing (local +z points into the room), the spot where agents stand, and the screen centre. */
export function stationPos(id: Station) {
  const { x, z, rotY } = LAYOUT[id];
  const fx = Math.sin(rotY);
  const fz = Math.cos(rotY);
  return {
    x,
    z,
    rotY,
    stand: { x: x + fx * 1.75, z: z + fz * 1.75 },
    screen: { x: x - fx * 0.2, z: z - fz * 0.2 },
  };
}
