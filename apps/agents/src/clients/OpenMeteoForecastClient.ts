import { GeoLocation, WeatherData } from "../shared/types";

interface ForecastResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation_probability: number;
    wind_speed_10m: number;
  };
}

export class OpenMeteoForecastClient {
  private baseUrl = "https://api.open-meteo.com/v1";

  async fetch(location: GeoLocation): Promise<WeatherData> {
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: "temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m",
      timezone: "auto",
    });
    const url = `${this.baseUrl}/forecast?${params}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Forecast HTTP ${response.status}`);
    const data = (await response.json()) as ForecastResponse;
    return {
      location,
      temperature: Math.round(data.current.temperature_2m),
      rainProbability: data.current.precipitation_probability,
      wind: Math.round(data.current.wind_speed_10m),
      humidity: data.current.relative_humidity_2m,
    };
  }
}
