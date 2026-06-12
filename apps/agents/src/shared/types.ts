export interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
}

export interface WeatherData {
  location: GeoLocation;
  temperature: number;
  rainProbability: number;
  wind: number;
  humidity: number;
}

export interface WeatherRisk {
  type: "rain" | "wind" | "heat" | "cold" | "frost";
  level: "low" | "medium" | "high";
  description: string;
}

export interface AgentResponse<T = unknown> {
  status: "success" | "failed";
  output?: T;
  reason?: string;
}

export interface WaypointResult {
  name: string;
  status: "success" | "degraded";
  location?: GeoLocation;
  weatherData?: WeatherData;
  risks?: WeatherRisk[];
  reason?: string;
}

export interface ItineraryReportInput {
  waypoints: WaypointResult[];
  retryReason?: string;
}

export interface ItineraryQualityInput {
  report: string;
  waypoints: WaypointResult[];
}

export interface ItineraryQualityResult {
  valid: boolean;
  reason?: string;
  details: string[];
}
