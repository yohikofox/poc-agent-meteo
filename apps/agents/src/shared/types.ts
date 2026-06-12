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
