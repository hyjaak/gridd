// ===== Mock Data — Production Cockpit =====
import type {
  CockpitDriver, CockpitJob, CockpitVehicle, InventoryItem,
  CockpitAnalytics, LiveEvent, WeatherData, FuelData, AIRecommendation,
  PricingEstimate, PricingInput,
} from "./types";

const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const NAMES = ["Aisha K.", "Marcus W.", "Jasmine T.", "Darnell R.", "Elena V.", "Carlos M.", "Priya S.", "James L."];
const CUSTOMERS = ["Target DC", "Walmart Grocery", "Amazon Hub", "Home Depot", "Lowe's", "Costco", "Kroger", "Best Buy"];
const PICKUPS = ["123 Main St, Dayton", "456 Elm St, Kettering", "789 Oak Ave, Beavercreek", "321 Pine Rd, Miamisburg"];
const DROPOFFS = ["654 Maple Dr, Centerville", "987 Birch Ln, Huber Heights", "147 Cedar Ct, Fairborn", "258 Walnut Way, Trotwood"];

export const DRIVERS: CockpitDriver[] = NAMES.map((name, i) => ({
  id: `drv-${i + 1}`,
  name,
  phone: `+1${rand(200, 999)}${rand(100, 999)}${rand(1000, 9999)}`,
  status: pick(["online", "online", "online", "en-route", "break", "offline"] as const),
  rating: +((3.8 + Math.random() * 1.2).toFixed(1)),
  acceptanceRate: rand(75, 99),
  completionRate: rand(88, 100),
  earnings: rand(120, 880),
  hoursToday: rand(2, 11),
  location: { lat: 39.75 + Math.random() * 0.08, lng: -84.2 + Math.random() * 0.08 },
  vehicle: `GRD-${100 + i}`,
  heading: rand(0, 359),
  speed: rand(0, 55),
  lastHeartbeat: new Date(Date.now() - rand(0, 120000)).toISOString(),
  documents: { license: true, insurance: true },
}));

export const JOBS: CockpitJob[] = Array.from({ length: 12 }, (_, i) => ({
  id: `job-${100 + i}`,
  priority: pick(["low", "medium", "high", "urgent"] as const),
  customer: pick(CUSTOMERS),
  customerPhone: `+1${rand(200, 999)}${rand(100, 999)}${rand(1000, 9999)}`,
  pickup: pick(PICKUPS),
  dropoff: pick(DROPOFFS),
  pickupGeo: { lat: 39.76 + Math.random() * 0.06, lng: -84.19 + Math.random() * 0.06 },
  dropoffGeo: { lat: 39.74 + Math.random() * 0.06, lng: -84.18 + Math.random() * 0.06 },
  vehicle: pick(["suv", "van", "truck", "box-truck"] as const),
  driver: i < 6 ? pick(DRIVERS).id : undefined,
  driverName: i < 6 ? pick(NAMES) : undefined,
  eta: rand(5, 45),
  status: pick(["pending", "accepted", "picked-up", "in-transit", "delivered"] as const),
  aiRecommendation: i % 3 === 0 ? "Route optimization available" : undefined,
  aiConfidence: i % 3 === 0 ? rand(75, 98) : undefined,
  createdAt: new Date(Date.now() - rand(0, 3600000)).toISOString(),
  estimatedPay: rand(25, 150),
  distance: rand(2, 25),
}));

export const VEHICLES: CockpitVehicle[] = Array.from({ length: 6 }, (_, i) => ({
  id: `veh-${i + 1}`,
  type: pick(["suv", "van", "truck"] as const),
  plate: `GRD-${100 + i}`,
  status: pick(["active", "active", "active", "maintenance", "offline"] as const),
  odometer: rand(5000, 85000),
  fuelLevel: rand(15, 100),
  fuelCapacity: 25,
  lastMaintenance: new Date(Date.now() - rand(7, 90) * 86400000).toISOString(),
  nextMaintenance: new Date(Date.now() + rand(7, 60) * 86400000).toISOString(),
  driver: i < 4 ? pick(DRIVERS).id : undefined,
  location: { lat: 39.76 + Math.random() * 0.06, lng: -84.19 + Math.random() * 0.06 },
  diagnostics: i === 2 ? [{ code: "P0420", severity: "warning" }] : [],
}));

export const INVENTORY: InventoryItem[] = Array.from({ length: 15 }, (_, i) => ({
  id: `inv-${100 + i}`,
  qrCode: `QR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
  barcode: `${rand(100000, 999999)}`,
  photos: [],
  weight: rand(5, 200),
  dimensions: { l: rand(20, 120), w: rand(20, 80), h: rand(10, 60) },
  fragile: Math.random() > 0.7,
  room: pick(["Living Room", "Bedroom", "Kitchen", "Garage", "Office"]),
  vehicle: i < 5 ? pick(VEHICLES).id : undefined,
  driver: i < 5 ? pick(DRIVERS).id : undefined,
  status: pick(["pending", "loaded", "in-transit", "delivered"] as const),
  description: pick(["Furniture", "Electronics", "Boxes", "Appliances", "Equipment"]),
}));

export const ANALYTICS: CockpitAnalytics = {
  revenue: { value: 128450, change: 12.5 },
  jobs: { total: 1342, completed: 1289, cancelled: 53 },
  acceptanceRate: 94.2,
  completionRate: 96.1,
  activeDrivers: 8,
  fleetUtilization: 78.4,
  avgEta: 18.5,
  customerSatisfaction: 4.7,
  growth: 23.4,
  demand: 85,
};

export const EVENTS: LiveEvent[] = [
  { id: "evt-1", type: "job", title: "Driver accepted job #104", description: "Marcus W. accepted delivery to Target DC", timestamp: new Date().toISOString(), severity: "success" },
  { id: "evt-2", type: "payment", title: "Payment completed — $89.50", description: "Customer paid via card", timestamp: new Date(Date.now() - 60000).toISOString(), severity: "success" },
  { id: "evt-3", type: "ai", title: "AI optimized route #108", description: "Saved 8 minutes on delivery route", timestamp: new Date(Date.now() - 120000).toISOString(), severity: "info" },
  { id: "evt-4", type: "maintenance", title: "Vehicle GRD-102 due service", description: "Oil change due in 500 miles", timestamp: new Date(Date.now() - 180000).toISOString(), severity: "warning" },
  { id: "evt-5", type: "inventory", title: "Inventory scanned — 12 items", description: "Batch scan completed at warehouse", timestamp: new Date(Date.now() - 240000).toISOString(), severity: "info" },
  { id: "evt-6", type: "message", title: "New message from customer", description: "Aisha K. — 'Please leave at front door'", timestamp: new Date(Date.now() - 300000).toISOString(), severity: "info" },
  { id: "evt-7", type: "fraud", title: "Fraud alert — payment declined", description: "Suspicious card declined on job #112", timestamp: new Date(Date.now() - 360000).toISOString(), severity: "error" },
  { id: "evt-8", type: "photo", title: "Photo uploaded — delivery proof", description: "Jasmine T. uploaded drop-off photo", timestamp: new Date(Date.now() - 420000).toISOString(), severity: "success" },
];

export const WEATHER: WeatherData = {
  temperature: 72,
  condition: "Partly Cloudy",
  wind: 12,
  rain: 10,
  visibility: 10,
  alerts: [],
};

export const FUEL: FuelData = {
  avgPrice: 3.47,
  trend: "down",
  stations: [
    { name: "Speedway", price: 3.42, distance: 0.5, address: "1000 Main St" },
    { name: "Shell", price: 3.49, distance: 0.8, address: "850 Elm St" },
    { name: "BP", price: 3.45, distance: 1.2, address: "1200 Oak Ave" },
    { name: "Marathon", price: 3.51, distance: 1.5, address: "600 Pine Rd" },
  ],
};

export const AI_RECOMMENDATIONS: AIRecommendation[] = [
  { id: "ai-1", type: "dispatch", title: "Dispatch Marcus to job #115", description: "Closest driver with highest rating", confidence: 94, suggestedAction: "Assign", impact: "high" },
  { id: "ai-2", type: "pricing", title: "Surge pricing zone active", description: "Beavercreek area — demand up 40%", confidence: 88, suggestedAction: "Adjust rates +15%", impact: "high" },
  { id: "ai-3", type: "route", title: "Route optimization for job #108", description: "Avoid I-75 construction, save 12 min", confidence: 91, suggestedAction: "Apply new route", impact: "medium" },
  { id: "ai-4", type: "maintenance", title: "Vehicle GRD-103 diagnostics", description: "Check engine code P0420", confidence: 96, suggestedAction: "Schedule service", impact: "medium" },
];

export function computePricing(input: PricingInput): PricingEstimate {
  const basePerMile = { suv: 1.5, van: 2.0, truck: 2.5, "box-truck": 3.0 };
  const trafficMult = { low: 1, moderate: 1.15, heavy: 1.35 };
  const weatherMult = { clear: 1, rain: 1.1, snow: 1.25 };
  const base = input.distance * basePerMile[input.vehicle] + input.time * 0.5;
  const fuel = input.distance * (input.fuelPrice / 15) * 0.85;
  const labor = input.time * 25 * (1 + input.stops * 0.15);
  const fees = base * 0.05 + input.tolls;
  const taxes = (base + fuel + labor + fees) * 0.08;
  const aiSuggested = base * trafficMult[input.traffic] * weatherMult[input.weather] * (1 + input.demand * 0.003);
  const profit = aiSuggested - fuel - labor - fees - taxes;
  const margin = (profit / aiSuggested) * 100;
  return { basePrice: Math.round(base), fuelCost: Math.round(fuel), laborCost: Math.round(labor), fees: Math.round(fees), taxes: Math.round(taxes), aiSuggested: Math.round(aiSuggested), profit: Math.round(profit), margin: +margin.toFixed(1), confidence: rand(80, 98) };
}

export function generateDriverHeartbeat(): Partial<CockpitDriver> {
  return {
    location: { lat: 39.75 + Math.random() * 0.08, lng: -84.2 + Math.random() * 0.08 },
    speed: rand(0, 55),
    heading: rand(0, 359),
    lastHeartbeat: new Date().toISOString(),
  };
}