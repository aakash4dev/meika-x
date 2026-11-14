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

export interface Region {
  id: string;
  name: string;
  bbox: BBox;
  note: string;
}

export const REGIONS: Region[] = [
  { id: "delhi-ncr", name: "Delhi NCR", bbox: { west: 76.8, south: 28.2, east: 77.8, north: 29.0 }, note: "Megacity, winter haze, pre-monsoon heat" },
  { id: "nw-india", name: "Northwest India (Punjab, Haryana)", bbox: { west: 73.5, south: 28.0, east: 77.5, north: 32.0 }, note: "Irrigated breadbasket; GRACE groundwater-loss region" },
  { id: "indo-gangetic", name: "Indo-Gangetic Plain", bbox: { west: 78.0, south: 24.0, east: 88.0, north: 30.0 }, note: "Densely populated river plain" },
  { id: "india-monsoon", name: "Central India monsoon belt", bbox: { west: 74.0, south: 18.0, east: 86.0, north: 26.0 }, note: "Monsoon core zone" },
  { id: "kerala", name: "Kerala and the Western Ghats", bbox: { west: 74.8, south: 8.2, east: 77.4, north: 12.8 }, note: "2018 floods, 2024 Wayanad landslides" },
  { id: "mumbai", name: "Mumbai and Konkan coast", bbox: { west: 72.6, south: 18.4, east: 73.6, north: 19.6 }, note: "Coastal megacity, extreme rain days" },
  { id: "sundarbans", name: "Sundarbans delta", bbox: { west: 88.0, south: 21.5, east: 90.0, north: 22.8 }, note: "Cyclone-exposed mangrove delta" },
  { id: "sindh", name: "Sindh, Pakistan", bbox: { west: 66.5, south: 24.0, east: 70.5, north: 28.5 }, note: "2022 flood region" },
  { id: "sahel", name: "West African Sahel", bbox: { west: -5.0, south: 12.0, east: 10.0, north: 16.0 }, note: "Rainfall recovery and drought history" },
  { id: "amazon", name: "Central Amazon", bbox: { west: -65.0, south: -8.0, east: -55.0, north: -2.0 }, note: "Rainforest, drought years 2005, 2010, 2023" },
  { id: "california", name: "California Central Valley", bbox: { west: -122.5, south: 35.0, east: -119.0, north: 40.0 }, note: "Agriculture, drought, wildfire" },
  { id: "se-australia", name: "Southeast Australia", bbox: { west: 145.0, south: -38.0, east: 151.0, north: -32.0 }, note: "2019-20 Black Summer fires" },
];

export const regionById = (id: string) => REGIONS.find((r) => r.id === id);

export interface Starter {
  question: string;
  variable: string;
  region: string;
}

export const STARTERS: Starter[] = [
  { question: "Is northwest India drying out?", variable: "GWETROOT", region: "nw-india" },
  { question: "Is the air over Delhi getting hazier?", variable: "AOD_55", region: "delhi-ncr" },
  { question: "Are Delhi's afternoons getting hotter?", variable: "T2M_MAX", region: "delhi-ncr" },
  { question: "Is the monsoon changing the same way everywhere in central India?", variable: "PRECTOTCORR", region: "india-monsoon" },
  { question: "Is Kerala getting wetter?", variable: "PRECTOTCORR", region: "kerala" },
  { question: "Is the Sahel's rain coming back?", variable: "PRECTOTCORR", region: "sahel" },
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
