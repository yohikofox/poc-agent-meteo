# Référence API HTTP

L'API Gateway tourne sur le port `3000`. Elle expose 4 endpoints.

## Base URL

```
http://localhost:3000
```

---

## Endpoints

### `POST /weather-report`

Déclenche la génération d'un rapport météo complet. Exécution **synchrone** (~8-15s selon Ollama).

**Corps de la requête**

```json
{
  "location": "Paris"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `location` | string | oui | Nom de ville (en toutes langues) |

**Réponse 200**

```json
{
  "taskId": "uuid-v4",
  "location": {
    "name": "Paris",
    "latitude": 48.8534,
    "longitude": 2.3488,
    "country": "France"
  },
  "weatherData": {
    "temperature": 18.4,
    "rainProbability": 20,
    "wind": 12,
    "humidity": 65
  },
  "report": "## Résumé\n...\n## Conditions actuelles\n...\n## Risques\n...\n## Conseils\n...",
  "risks": ["rain"],
  "traceId": "uuid-v4"
}
```

**Réponse 400** — champ `location` manquant

```json
{ "error": "Le champ 'location' est requis" }
```

**Réponse 500** — échec d'un agent

```json
{
  "error": "Geocoding Agent — No location found",
  "taskId": "uuid-v4"
}
```

---

### `GET /agents`

Retourne la liste statique des agents enregistrés et leurs capacités.

**Réponse 200**

```json
[
  {
    "id": "geocoding-agent",
    "name": "Geocoding Agent",
    "capabilities": ["location.resolve"],
    "natsSubject": "agents.location.resolve",
    "type": "programmatic"
  },
  {
    "id": "weather-fetch-agent",
    "name": "Weather Fetch Agent",
    "capabilities": ["weather.fetch"],
    "natsSubject": "agents.weather.fetch",
    "type": "programmatic"
  },
  {
    "id": "weather-risk-analysis-agent",
    "name": "Weather Risk Analysis Agent",
    "capabilities": ["weather.risk-analysis"],
    "natsSubject": "agents.weather.risk",
    "type": "programmatic"
  },
  {
    "id": "weather-report-writer-agent",
    "name": "Weather Report Writer Agent",
    "capabilities": ["weather.report.write"],
    "natsSubject": "agents.report.write",
    "type": "llm-local"
  },
  {
    "id": "quality-check-agent",
    "name": "Quality Check Agent",
    "capabilities": ["report.quality-check"],
    "natsSubject": "agents.report.check",
    "type": "programmatic"
  }
]
```

---

### `GET /tasks/:taskId`

Retourne l'état complet d'une tâche et son historique d'events.

**Paramètres**

| Param | Description |
|-------|-------------|
| `taskId` | UUID retourné par `POST /weather-report` |

**Réponse 200**

```json
{
  "taskId": "uuid-v4",
  "status": "completed",
  "input": { "location": "Paris" },
  "output": { ... },
  "events": [
    {
      "timestamp": "2026-06-12T10:00:00.000Z",
      "agentId": "geocoding-agent",
      "type": "started",
      "message": "Geocoding Agent démarré"
    },
    {
      "timestamp": "2026-06-12T10:00:00.500Z",
      "agentId": "geocoding-agent",
      "type": "completed",
      "message": "Geocoding Agent terminé",
      "output": { "name": "Paris", "latitude": 48.8534, "longitude": 2.3488 }
    }
  ]
}
```

**Statuts possibles**

| Statut | Description |
|--------|-------------|
| `running` | Agents en cours d'exécution |
| `completed` | Rapport généré avec succès |
| `failed` | Au moins un agent a échoué |

**Réponse 404**

```json
{ "error": "Task introuvable" }
```

---

### `GET /tasks/:taskId/events`

Retourne uniquement le tableau d'events d'une tâche (alias de `task.events`).

**Réponse 200**

```json
[
  {
    "timestamp": "2026-06-12T10:00:00.000Z",
    "agentId": "geocoding-agent",
    "type": "started",
    "message": "Geocoding Agent démarré"
  }
]
```

**Types d'event**

| Type | Description |
|------|-------------|
| `started` | L'agent a reçu le message NATS |
| `completed` | L'agent a répondu avec succès |
| `failed` | L'agent a retourné une erreur ou timeout |

---

## Types de données

### `GeoLocation`

```typescript
{
  name: string;           // Nom de la ville résolu
  latitude: number;       // Degrés décimaux
  longitude: number;      // Degrés décimaux
  country?: string;       // Nom du pays (optionnel)
}
```

### `WeatherData`

```typescript
{
  location: GeoLocation;
  temperature: number;    // °C
  rainProbability: number; // 0–100 %
  wind: number;           // km/h
  humidity: number;       // 0–100 %
}
```

### `WeatherRisk`

```typescript
{
  type: "rain" | "wind" | "heat" | "cold" | "frost";
  level: "low" | "medium" | "high";
  description: string;
}
```

### `AgentResponse<T>`

Enveloppe retournée par tous les agents via NATS :

```typescript
{
  status: "success" | "failed";
  output?: T;
  reason?: string;  // message d'erreur si status === "failed"
}
```

---

## Sujets NATS (communication interne)

| Sujet | Direction | Payload entrant | Payload sortant |
|-------|-----------|-----------------|-----------------|
| `agents.location.resolve` | Supervisor → geocoding-agent | `{ name: string }` | `AgentResponse<GeoLocation>` |
| `agents.weather.fetch` | Supervisor → weather-fetch-agent | `GeoLocation` | `AgentResponse<WeatherData>` |
| `agents.weather.risk` | Supervisor → weather-risk-agent | `WeatherData` | `AgentResponse<WeatherRisk[]>` |
| `agents.report.write` | Supervisor → report-writer-agent | `WeatherData` | `AgentResponse<string>` |
| `agents.report.check` | Supervisor → quality-check-agent | `string` (rapport) | `AgentResponse<{ valid: boolean }>` |

> Ces sujets sont internes — ils ne sont pas exposés sur Internet. La communication passe par le réseau Docker `poc-meteo`.
