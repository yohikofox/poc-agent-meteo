# POC — Plateforme agentique météo locale

## Objectif

Implémenter une pseudo plateforme agentique en TypeScript/Node.js capable de générer un rapport météo complet à partir d'une indication de lieu en langage naturel.

Exemple d'entrée :

```json
{
  "location": "Nantes",
  "dateRange": "next_3_days"
}
```

Exemple de sortie :

```json
{
  "location": {
    "name": "Nantes",
    "latitude": 47.2184,
    "longitude": -1.5536
  },
  "report": "...rapport météo complet...",
  "risks": ["rain", "wind"],
  "traceId": "..."
}
```

## Contraintes

- Utiliser TypeScript.
- Utiliser Node.js.
- Utiliser Koa pour l'API HTTP.
- Ne pas utiliser de LLM payant.
- Utiliser Ollama local pour la partie LLM.
- Utiliser Open-Meteo pour :
  - le geocoding ;
  - les données météo.
- Ne pas utiliser de base de données pour le MVP.
- Utiliser un registry JSON local.
- L'objectif est de démontrer :
  - Agent Registry ;
  - Agent Discovery ;
  - Supervisor ;
  - agents programmatiques ;
  - agent LLM local ;
  - task/session state ;
  - rapport final.

## Architecture cible

```text
HTTP API
  |
Agent Gateway
  |
Task / Conversation Harness
  |
Supervisor
  |
Agent Discovery
  |
Agent Registry
  |
Agents
```

## Agents à implémenter

### 1. GeocodingAgent

Type : programmatique.

Responsabilité :

- Convertir une indication de lieu en latitude/longitude.
- Appeler Open-Meteo Geocoding API.
- Retourner une liste de candidats.
- Si plusieurs candidats ambigus, retourner `needs_clarification`.

Capability :

```text
location.resolve
```

### 2. WeatherFetchAgent

Type : programmatique.

Responsabilité :

- Appeler Open-Meteo Forecast API.
- Récupérer :
  - température ;
  - pluie ;
  - vent ;
  - humidité ;
  - pression ;
  - couverture nuageuse ;
  - prévisions horaires ;
  - prévisions journalières.

Capability :

```text
weather.fetch
```

### 3. WeatherRiskAnalysisAgent

Type : programmatique.

Responsabilité :

- Analyser les données météo brutes.
- Détecter :
  - risque de pluie ;
  - vent fort ;
  - fortes chaleurs ;
  - froid ;
  - gel ;
  - orage si disponible ;
  - conditions défavorables.

Capability :

```text
weather.risk-analysis
```

### 4. WeatherReportWriterAgent

Type : LLM local via Ollama.

Responsabilité :

- Transformer les données structurées en rapport lisible.
- Produire :
  - synthèse générale ;
  - météo actuelle ;
  - tendance sur les prochains jours ;
  - points de vigilance ;
  - conseil pratique.

Capability :

```text
weather.report.write
```

### 5. QualityCheckAgent

Type : programmatique.

Responsabilité :

- Vérifier que le rapport contient :
  - lieu ;
  - période ;
  - synthèse ;
  - risques ;
  - données principales ;
  - conclusion.
- Retourner `success` ou `failed`.

Capability :

```text
report.quality-check
```

## Contrats techniques

Créer une interface commune :

```ts
export interface Agent<I = unknown, O = unknown> {
  id: string;
  name: string;
  capabilities: Capability[];
  canHandle(input: AgentInput<I>): Promise<CanHandleResult>;
  execute(input: AgentInput<I>): Promise<AgentResult<O>>;
}
```

Créer les types :

```ts
export type Capability = {
  name: string;
  description: string;
};

export type AgentInput<T = unknown> = {
  taskId: string;
  intent: string;
  payload: T;
  context: {
    traceId: string;
    sessionId: string;
  };
};

export type CanHandleResult = {
  canHandle: boolean;
  confidence: number;
};

export type AgentResult<T = unknown> = {
  status: "success" | "failed" | "needs_clarification" | "handoff";
  output?: T;
  reason?: string;
  handoffTo?: string;
  confidence?: number;
};
```

## Registry

Créer un fichier :

```text
src/registry/agents.json
```

Avec les agents :

```json
[
  {
    "id": "geocoding-agent",
    "name": "Geocoding Agent",
    "capabilities": ["location.resolve"],
    "type": "programmatic"
  },
  {
    "id": "weather-fetch-agent",
    "name": "Weather Fetch Agent",
    "capabilities": ["weather.fetch"],
    "type": "programmatic"
  },
  {
    "id": "weather-risk-analysis-agent",
    "name": "Weather Risk Analysis Agent",
    "capabilities": ["weather.risk-analysis"],
    "type": "programmatic"
  },
  {
    "id": "weather-report-writer-agent",
    "name": "Weather Report Writer Agent",
    "capabilities": ["weather.report.write"],
    "type": "llm-local"
  },
  {
    "id": "quality-check-agent",
    "name": "Quality Check Agent",
    "capabilities": ["report.quality-check"],
    "type": "programmatic"
  }
]
```

## Discovery

Implémenter un `AgentDiscoveryService`.

Pour le MVP, le discovery est déterministe :

```ts
discoverByCapability(capability: string): AgentDefinition[]
```

Pas besoin de LLM pour le discovery au départ.

## Supervisor

Implémenter un `WeatherReportSupervisor`.

Il doit orchestrer le workflow suivant :

```text
1. Resolve location
2. Fetch weather
3. Analyze risks
4. Generate report
5. Quality check
6. Return final response
```

Le supervisor reste responsable du résultat final.

## API HTTP

Créer une route :

```http
POST /weather-report
```

Body :

```json
{
  "location": "Nantes",
  "days": 3
}
```

Créer aussi :

```http
GET /agents
GET /tasks/:taskId
GET /tasks/:taskId/events
```

## Task State

Créer un stockage mémoire simple :

```ts
TaskStore
```

Chaque task contient :

```ts
{
  taskId: string;
  status: "running" | "completed" | "failed";
  input: unknown;
  output?: unknown;
  events: TaskEvent[];
}
```

Chaque agent doit pousser un événement :

```ts
{
  timestamp: string;
  agentId: string;
  type: "started" | "completed" | "failed";
  message: string;
}
```

## Ollama

Créer un client Ollama simple :

```ts
class OllamaClient {
  generate(prompt: string): Promise<string>
}
```

Utiliser le endpoint local :

```text
http://localhost:11434/api/generate
```

Le modèle doit être configurable par variable d'environnement :

```text
OLLAMA_MODEL=llama3.1
```

## Structure de projet souhaitée

```text
src/
  api/
    server.ts
    routes.ts

  agents/
    Agent.ts
    GeocodingAgent.ts
    WeatherFetchAgent.ts
    WeatherRiskAnalysisAgent.ts
    WeatherReportWriterAgent.ts
    QualityCheckAgent.ts

  harness/
    AgentHarness.ts
    ConversationHarness.ts
    TaskStore.ts

  registry/
    AgentRegistry.ts
    AgentDiscoveryService.ts
    agents.json

  supervisor/
    WeatherReportSupervisor.ts

  clients/
    OpenMeteoGeocodingClient.ts
    OpenMeteoForecastClient.ts
    OllamaClient.ts

  types/
    weather.ts
    agent.ts
    task.ts

  index.ts
```

## Critères d'acceptance

- Je peux lancer le serveur avec `npm run dev`.
- Je peux appeler `POST /weather-report`.
- Le système résout le lieu via geocoding.
- Le système récupère la météo via Open-Meteo.
- Le système analyse les risques sans LLM.
- Le système génère le rapport avec Ollama local.
- Le système expose la liste des agents.
- Le système expose les événements de traitement.
- Le code est lisible, typé, modulaire.
- Aucun LLM payant n'est utilisé.

## Étapes d'implémentation

1. Initialiser le projet TypeScript.
2. Installer Koa.
3. Créer les types communs.
4. Créer le registry JSON.
5. Créer AgentRegistry et AgentDiscoveryService.
6. Créer TaskStore.
7. Créer les clients Open-Meteo.
8. Créer OllamaClient.
9. Implémenter les agents.
10. Implémenter WeatherReportSupervisor.
11. Créer les routes HTTP.
12. Ajouter un README avec les commandes.
13. Ajouter un exemple curl.
14. Ajouter un `.env.example`.
15. Vérifier que le POC tourne de bout en bout.

## Commandes attendues

```bash
npm install
npm run dev
```

Exemple de test :

```bash
curl -X POST http://localhost:3000/weather-report \
  -H "Content-Type: application/json" \
  -d '{"location":"Nantes","days":3}'
```

Implémente maintenant ce POC en privilégiant la clarté architecturale plutôt que la perfection technique.