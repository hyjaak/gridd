// ===== Cockpit Core Types =====

export type DriverStatus = "online" | "offline" | "break" | "en-route";
export type JobStatus = "pending" | "accepted" | "picked-up" | "in-transit" | "delivered" | "cancelled";
export type Priority = "low" | "medium" | "high" | "urgent";
export type VehicleType = "suv" | "van" | "truck" | "box-truck";
export type VehicleStatus = "active" | "maintenance" | "offline";

export interface CockpitDriver {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  status: DriverStatus;
  rating: number;
  acceptanceRate: number;
  completionRate: number;
  earnings: number;
  hoursToday: number;
  location: { lat: number; lng: number };
  vehicle: string;
  heading: number;
  speed: number;
  lastHeartbeat: string;
  documents: { license: boolean; insurance: boolean };
}

export interface CockpitJob {
  id: string;
  priority: Priority;
  customer: string;
  customerPhone: string;
  pickup: string;
  dropoff: string;
  pickupGeo: { lat: number; lng: number };
  dropoffGeo: { lat: number; lng: number };
  vehicle: VehicleType;
  driver?: string;
  driverName?: string;
  eta: number;
  status: JobStatus;
  aiRecommendation?: string;
  aiConfidence?: number;
  createdAt: string;
  estimatedPay: number;
  distance: number;
}

export interface CockpitVehicle {
  id: string;
  type: VehicleType;
  plate: string;
  status: VehicleStatus;
  odometer: number;
  fuelLevel: number;
  fuelCapacity: number;
  lastMaintenance: string;
  nextMaintenance: string;
  driver?: string;
  location: { lat: number; lng: number };
  diagnostics: { code: string; severity: "info" | "warning" | "critical" }[];
}

export interface InventoryItem {
  id: string;
  qrCode: string;
  barcode: string;
  photos: string[];
  weight: number;
  dimensions: { l: number; w: number; h: number };
  fragile: boolean;
  room: string;
  vehicle?: string;
  driver?: string;
  status: "pending" | "loaded" | "in-transit" | "delivered";
  description: string;
}

export interface CockpitAnalytics {
  revenue: { value: number; change: number };
  jobs: { total: number; completed: number; cancelled: number };
  acceptanceRate: number;
  completionRate: number;
  activeDrivers: number;
  fleetUtilization: number;
  avgEta: number;
  customerSatisfaction: number;
  growth: number;
  demand: number;
}

export interface PricingEstimate {
  basePrice: number;
  fuelCost: number;
  laborCost: number;
  fees: number;
  taxes: number;
  aiSuggested: number;
  profit: number;
  margin: number;
  confidence: number;
}

export interface PricingInput {
  distance: number;
  time: number;
  vehicle: VehicleType;
  weight: number;
  volume: number;
  stops: number;
  fuelPrice: number;
  traffic: "low" | "moderate" | "heavy";
  weather: "clear" | "rain" | "snow";
  demand: number;
  tolls: number;
}

export interface LiveEvent {
  id: string;
  type: "job" | "payment" | "message" | "ai" | "maintenance" | "inventory" | "fraud" | "photo" | "signature";
  title: string;
  description: string;
  timestamp: string;
  severity: "info" | "success" | "warning" | "error";
}

export interface WeatherData {
  temperature: number;
  condition: string;
  wind: number;
  rain: number;
  visibility: number;
  alerts: { title: string; severity: "advisory" | "watch" | "warning" }[];
}

export interface FuelData {
  avgPrice: number;
  trend: "up" | "down" | "stable";
  stations: { name: string; price: number; distance: number; address: string }[];
}

export interface AIRecommendation {
  id: string;
  type: "dispatch" | "pricing" | "route" | "maintenance" | "fraud";
  title: string;
  description: string;
  confidence: number;
  suggestedAction: string;
  impact: "low" | "medium" | "high";
}