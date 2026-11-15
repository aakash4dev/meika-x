// Variable catalogue, preset regions and starter questions. Safe to import on the client.

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type Hazard = "heat" | "heavy_rain" | "drought" | "fire_weather" | null;

export interface Variable {
  id: string; // NASA POWER parameter
  name: string;
  short: string;
  units: string;
  definition: string; // written for a 16-year-old
  source: string; // underlying NASA product
  ratioScale: boolean; // percent-of-baseline is meaningful
  firstYear: number;
  drivers: string[]; // candidate drivers the Driver Analyst tests
  related?: string; // second-opinion variable for the Skeptic
  hazard: Hazard;
  keywords: string[];
  fullRes: string; // CMR keyword for the full-resolution NASA product
}

export const VARIABLES: Variable[] = [
  {
    id: "T2M",
    name: "Air temperature (2 m)",
    short: "Temperature",
    units: "deg C",
    definition: "How warm the air is about head-height above the ground, averaged over each month.",
    source: "MERRA-2 (NASA GMAO) via NASA POWER",
    ratioScale: false,
    firstYear: 1981,
    drivers: ["ALLSKY_SFC_SW_DWN", "GWETROOT", "PRECTOTCORR", "CLOUD_AMT"],
    related: "TS",
    hazard: "heat",
    keywords: ["hot", "heat", "warm", "temperature", "hotter", "warming", "cold", "climate"],
    fullRes: "MERRA-2 M2TMNXSLV",
  },
  {
    id: "T2M_MAX",
    name: "Daily maximum temperature",
    short: "Hottest-hour temperature",
    units: "deg C",
    definition: "The highest air temperature reached each day, averaged over the month. It tracks how harsh afternoons get.",
    source: "MERRA-2 (NASA GMAO) via NASA POWER",
    ratioScale: false,
    firstYear: 1981,
    drivers: ["ALLSKY_SFC_SW_DWN", "GWETROOT", "PRECTOTCORR", "CLOUD_AMT"],
    related: "TS",
    hazard: "heat",
    keywords: ["heatwave", "heat wave", "afternoon", "maximum", "extreme heat", "hottest"],
    fullRes: "MERRA-2 M2SDNXSLV",
  },
  {
    id: "PRECTOTCORR",
    name: "Precipitation",
    short: "Rainfall",
    units: "mm/day",
    definition: "How much rain (and melted snow) falls, as an average depth per day over the month.",
    source: "MERRA-2 bias-corrected precipitation via NASA POWER",
    ratioScale: true,
    firstYear: 1981,
    drivers: ["QV2M", "CLOUD_AMT", "T2M", "WS10M"],
    hazard: "heavy_rain",
    keywords: ["rain", "rainfall", "monsoon", "precipitation", "flood", "wet", "storm", "downpour"],
    fullRes: "GPM IMERG",
  },
  {
    id: "GWETROOT",
    name: "Root-zone soil wetness",
    short: "Soil moisture (roots)",
    units: "fraction (0 dry to 1 saturated)",
    definition: "How full of water the soil is down where plant roots live. 0 means bone dry, 1 means soaked.",
    source: "MERRA-2 land model via NASA POWER",
    ratioScale: true,
    firstYear: 1981,
    drivers: ["PRECTOTCORR", "T2M", "ALLSKY_SFC_SW_DWN", "RH2M"],
    related: "GWETTOP",
    hazard: "drought",
    keywords: ["soil", "drought", "dry", "drying", "water", "groundwater", "farm", "crop", "moisture"],
    fullRes: "GLDAS Noah",
  },
  {
    id: "GWETTOP",
    name: "Surface soil wetness",
    short: "Soil moisture (top)",
    units: "fraction (0 dry to 1 saturated)",
    definition: "How wet the top few centimetres of soil are. It reacts within days to rain and heat.",
    source: "MERRA-2 land model via NASA POWER",
    ratioScale: true,
    firstYear: 1981,
    drivers: ["PRECTOTCORR", "T2M", "ALLSKY_SFC_SW_DWN"],
    related: "GWETROOT",
    hazard: "drought",
    keywords: ["topsoil", "surface soil", "dust"],
    fullRes: "SMAP L3 soil moisture",
  },
  {
    id: "RH2M",
    name: "Relative humidity (2 m)",
    short: "Humidity",
    units: "%",
    definition: "How close the air is to holding all the water vapour it can at its temperature.",
    source: "MERRA-2 via NASA POWER",
    ratioScale: true,
    firstYear: 1981,
    drivers: ["T2M", "PRECTOTCORR", "QV2M"],
    related: "QV2M",
    hazard: "heat",
    keywords: ["humid", "humidity", "muggy", "sticky"],
    fullRes: "AIRS L3 relative humidity",
  },
  {
    id: "QV2M",
    name: "Specific humidity (2 m)",
    short: "Water vapour",
    units: "g/kg",
    definition: "Grams of water vapour in each kilogram of air. Warmer air can hold more.",
    source: "MERRA-2 via NASA POWER",
    ratioScale: true,
    firstYear: 1981,
    drivers: ["T2M", "PRECTOTCORR"],
    related: "RH2M",
    hazard: null,
    keywords: ["vapour", "vapor", "moisture in air"],
    fullRes: "AIRS L3 water vapor",
  },
  {
    id: "WS10M",
    name: "Wind speed (10 m)",
    short: "Wind",
    units: "m/s",
    definition: "How fast the wind blows about 10 metres above the ground, averaged over the month.",
    source: "MERRA-2 via NASA POWER",
    ratioScale: true,
    firstYear: 1981,
    drivers: ["T2M", "PRECTOTCORR"],
    hazard: null,
    keywords: ["wind", "windy", "storm", "breeze"],
    fullRes: "MERRA-2 M2T1NXSLV",
  },
  {
    id: "AOD_55",
    name: "Aerosol optical depth (550 nm)",
    short: "Haze and smoke",
    units: "dimensionless",
    definition: "How much sunlight is blocked by dust, smoke and pollution particles in the air. Higher means hazier.",
    source: "MERRA-2 aerosol reanalysis (assimilates MODIS) via NASA POWER",
    ratioScale: true,
    firstYear: 1981,
    drivers: ["WS10M", "PRECTOTCORR", "RH2M", "GWETTOP"],
    hazard: null,
    keywords: ["air", "pollution", "smog", "haze", "dust", "smoke", "aerosol", "dirty", "aqi"],
    fullRes: "MODIS MOD08_M3 aerosol",
  },
  {
    id: "ALLSKY_SFC_SW_DWN",
    name: "Sunlight reaching the ground",
    short: "Sunshine",
    units: "MJ/m2/day",
    definition: "How much solar energy reaches the ground each day, after clouds and haze take their share.",
    source: "CERES SYN1deg (NASA LaRC) via NASA POWER",
    ratioScale: true,
    firstYear: 1984,
    drivers: ["CLOUD_AMT", "AOD_55"],
    hazard: null,
    keywords: ["sun", "sunlight", "solar", "dimming", "brightening", "sunshine"],
    fullRes: "CERES SYN1deg",
  },
  {
    id: "CLOUD_AMT",
    name: "Cloud amount",
    short: "Cloudiness",
    units: "%",
    definition: "The share of the sky covered by cloud, averaged over the month.",
    source: "CERES SYN1deg (NASA LaRC) via NASA POWER",
    ratioScale: true,
    firstYear: 1984,
    drivers: ["QV2M", "T2M"],
    hazard: null,
    keywords: ["cloud", "cloudy", "overcast"],
    fullRes: "CERES SYN1deg",
  },
  {
    id: "TS",
    name: "Earth skin temperature",
    short: "Ground temperature",
    units: "deg C",
    definition: "The temperature of the very top of the land or sea surface, which heats up faster than the air.",
    source: "MERRA-2 via NASA POWER",
    ratioScale: false,
    firstYear: 1981,
    drivers: ["ALLSKY_SFC_SW_DWN", "GWETTOP"],
    related: "T2M",
    hazard: "heat",
    keywords: ["surface temperature", "ground", "skin", "land surface"],
    fullRes: "MODIS MOD11 land surface temperature",
  },
];

export const variableById = (id: string) => VARIABLES.find((v) => v.id === id);

/** A language the Narrator writes the second version of the brief in. */
export interface LocalLanguage {
  /** BCP-47 code, e.g. "es". */
  code: string;
  /** The language's own name for itself, e.g. "Español". */
  name: string;
}

export interface Region {
  id: string;
  name: string;
  bbox: BBox;
  note: string;
  /** Main local language, when it is not English. The brief gets a second version in it. */
  lang?: LocalLanguage;
}

const L = {
  es: { code: "es", name: "Español" },
  pt: { code: "pt", name: "Português" },
  fr: { code: "fr", name: "Français" },
  de: { code: "de", name: "Deutsch" },
  sw: { code: "sw", name: "Kiswahili" },
  ar: { code: "ar", name: "العربية" },
  hi: { code: "hi", name: "हिन्दी" },
  zh: { code: "zh", name: "中文" },
  vi: { code: "vi", name: "Tiếng Việt" },
  id: { code: "id", name: "Bahasa Indonesia" },
  ru: { code: "ru", name: "Русский" },
  kl: { code: "kl", name: "Kalaallisut" },
} satisfies Record<string, LocalLanguage>;

export const REGIONS: Region[] = [
  // North and Central America
  { id: "us-corn-belt", name: "US Corn Belt (Iowa, Illinois)", bbox: { west: -96.5, south: 39.0, east: -87.0, north: 44.0 }, note: "World breadbasket; heavier spring rain" },
  { id: "california", name: "California Central Valley", bbox: { west: -122.5, south: 35.0, east: -119.0, north: 40.0 }, note: "Agriculture, drought, wildfire" },
  { id: "central-america", name: "Central American Dry Corridor", bbox: { west: -91.5, south: 12.5, east: -85.5, north: 15.5 }, note: "Smallholder farms hit by erratic rains", lang: L.es },
  // South America
  { id: "amazon", name: "Central Amazon", bbox: { west: -65.0, south: -8.0, east: -55.0, north: -2.0 }, note: "Rainforest; drought years 2005, 2010, 2023", lang: L.pt },
  { id: "patagonia", name: "Patagonia", bbox: { west: -72.5, south: -50.0, east: -66.0, north: -42.0 }, note: "Glaciers, steppe and strong westerly winds", lang: L.es },
  // Europe
  { id: "central-europe", name: "Central Europe (Germany, Czechia)", bbox: { west: 6.0, south: 47.5, east: 18.0, north: 54.0 }, note: "Summer heat and drought since 2018", lang: L.de },
  { id: "iberia", name: "Iberian Peninsula", bbox: { west: -9.5, south: 36.0, east: 3.0, north: 43.5 }, note: "Mediterranean drying, heatwaves", lang: L.es },
  // Africa and the Middle East
  { id: "sahel", name: "West African Sahel", bbox: { west: -5.0, south: 12.0, east: 10.0, north: 16.0 }, note: "Rainfall recovery after the 1970s-80s droughts", lang: L.fr },
  { id: "east-africa", name: "Horn of Africa (Kenya, Ethiopia, Somalia)", bbox: { west: 36.0, south: -2.0, east: 46.0, north: 8.0 }, note: "Failed rainy seasons 2020-2023", lang: L.sw },
  { id: "southern-africa", name: "Southern Africa (Zambia, Zimbabwe)", bbox: { west: 22.0, south: -22.0, east: 33.0, north: -12.0 }, note: "Maize belt; El Niño droughts" },
  { id: "nile-delta", name: "Nile Delta", bbox: { west: 29.5, south: 29.5, east: 32.5, north: 31.6 }, note: "Heat, water and a growing population", lang: L.ar },
  { id: "middle-east-gulf", name: "Arabian Gulf coast", bbox: { west: 47.0, south: 22.0, east: 57.0, north: 27.5 }, note: "Among the hottest, most humid places on Earth", lang: L.ar },
  // Asia
  { id: "delhi-ncr", name: "Delhi NCR", bbox: { west: 76.8, south: 28.2, east: 77.8, north: 29.0 }, note: "Megacity, winter haze, pre-monsoon heat", lang: L.hi },
  { id: "nw-india", name: "Northwest India (Punjab, Haryana)", bbox: { west: 73.5, south: 28.0, east: 77.5, north: 32.0 }, note: "Irrigated breadbasket; GRACE groundwater-loss region", lang: L.hi },
  { id: "india-monsoon", name: "Central India monsoon belt", bbox: { west: 74.0, south: 18.0, east: 86.0, north: 26.0 }, note: "Monsoon core zone", lang: L.hi },
  { id: "north-china-plain", name: "North China Plain", bbox: { west: 113.0, south: 34.0, east: 119.0, north: 40.0 }, note: "Farmland, groundwater and haze", lang: L.zh },
  { id: "mekong-delta", name: "Mekong Delta", bbox: { west: 104.4, south: 8.6, east: 106.8, north: 11.0 }, note: "Rice bowl facing heat and salinity", lang: L.vi },
  { id: "borneo", name: "Borneo (Kalimantan)", bbox: { west: 109.0, south: -4.0, east: 119.0, north: 4.0 }, note: "Peatland fires and haze in dry years", lang: L.id },
  // Oceania
  { id: "se-australia", name: "Southeast Australia", bbox: { west: 145.0, south: -38.0, east: 151.0, north: -32.0 }, note: "2019-20 Black Summer fires" },
  // Polar
  { id: "alaska-north-slope", name: "Alaska North Slope (Arctic)", bbox: { west: -162.0, south: 68.0, east: -142.0, north: 71.0 }, note: "Arctic warming several times faster than the globe" },
  { id: "siberia", name: "Eastern Siberia (Yakutia)", bbox: { west: 120.0, south: 60.0, east: 135.0, north: 68.0 }, note: "Permafrost, record heat, wildfire", lang: L.ru },
  { id: "greenland-west", name: "West Greenland coast", bbox: { west: -56.0, south: 64.0, east: -48.0, north: 70.0 }, note: "Ice-sheet edge; record melt summers", lang: L.kl },
];

export const DEFAULT_REGION_ID = "central-europe";

export const regionById = (id: string) => REGIONS.find((r) => r.id === id);

export interface Starter {
  question: string;
  variable: string;
  region: string;
}

export const STARTERS: Starter[] = [
  // one per continent, so the first screen reads as a whole-Earth tool (the home page shows the first four)
  { question: "Is the Arctic warming faster than the rest of the world?", variable: "T2M", region: "alaska-north-slope" },
  { question: "Is the Amazon drying out?", variable: "GWETROOT", region: "amazon" },
  { question: "Is the Sahel's rain coming back?", variable: "PRECTOTCORR", region: "sahel" },
  { question: "Is the Mekong Delta getting hotter?", variable: "T2M_MAX", region: "mekong-delta" },
  { question: "Are European summers getting hotter?", variable: "T2M_MAX", region: "central-europe" },
  { question: "Are Southeast Australia's summers getting hotter?", variable: "T2M_MAX", region: "se-australia" },
];

export function bboxArea(b: BBox): number {
  // km^2, spherical approximation
  const R = 6371;
  const rad = Math.PI / 180;
  return R * R * Math.abs(Math.sin(b.north * rad) - Math.sin(b.south * rad)) * Math.abs(b.east - b.west) * rad;
}

export const bboxCenter = (b: BBox) => ({ lat: (b.south + b.north) / 2, lon: (b.west + b.east) / 2 });

export function inBBox(b: BBox, lat: number, lon: number, padDeg = 0) {
  return lat >= b.south - padDeg && lat <= b.north + padDeg && lon >= b.west - padDeg && lon <= b.east + padDeg;
}

export function validBBox(b: Partial<BBox> | undefined): b is BBox {
  if (!b) return false;
  const { west, south, east, north } = b;
  return (
    [west, south, east, north].every((v) => typeof v === "number" && Number.isFinite(v)) &&
    west! >= -180 && east! <= 180 && south! >= -90 && north! <= 90 && east! > west! && north! > south! &&
    east! - west! <= 20 && north! - south! <= 20
  );
}
