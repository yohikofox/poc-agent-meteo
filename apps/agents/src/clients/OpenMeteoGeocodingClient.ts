import { GeoLocation } from "../shared/types";

interface GeocodingResult {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
  }>;
}

export class OpenMeteoGeocodingClient {
  private baseUrl = "https://geocoding-api.open-meteo.com/v1";

  async search(name: string): Promise<GeoLocation[]> {
    const url = `${this.baseUrl}/search?name=${encodeURIComponent(name)}&count=5&language=fr&format=json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);
    const data = (await response.json()) as GeocodingResult;
    return (data.results ?? []).map((r) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country,
    }));
  }
}
