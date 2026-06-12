# Contexte technique et fonctionnel — POC Agent Météo

## Niveau 1 — Résumé exécutif

POC d'une **plateforme agentique météo** en TypeScript/Node.js.
L'objectif est de générer un rapport météo en langage naturel (français) pour une ville donnée,
en orchestrant 5 agents autonomes via NATS message broker.
Chaque agent tourne dans son propre container Docker, communique exclusivement par messages,
et est instrumenté OpenTelemetry pour une observabilité complète.

---

## Niveau 2 — Vision fonctionnelle

### Ce que fait le système

1. L'utilisateur saisit un nom de ville dans l'UI web
2. L'API reçoit la requête et déclenche le supervisor
3. 5 agents s'exécutent séquentiellement :
   - **Geocoding** : résout la ville en coordonnées GPS (Open-Meteo)
   - **Weather Fetch** : récupère les données météo actuelles (Open-Meteo)
   - **Weather Risk** : analyse les risques (pluie, vent, gel, chaleur) — logique pure, sans LLM
   - **Report Writer** : génère un rapport en français via Ollama (llama3.2:3b)
   - **Quality Check** : vérifie la présence des 4 sections requises dans le rapport
4. Le rapport s'affiche dans l'UI avec : résumé, conditions, risques, conseils

### Sorties

- Rapport texte structuré en 4 sections : Résumé / Conditions actuelles / Risques / Conseils
- Badges de risques (pluie, vent, chaleur, froid, gel)
- Métriques météo déterministes (température, probabilité pluie, vent, humidité)
- Trace de chaque agent dans l'UI (trace agentique)

### Prompt forgé (4 itérations — score 15/15)

Fichier de référence : `weather-report-writer-agent.md`
Clés du prompt : interdire explicitement les données absentes, imposer les 4 sections nommées exactement, `num_predict: 1000`.

---

## Niveau 3 — Vision technique

### Stack

| Couche | Technologie | Rôle |
|--------|-------------|------|
| Frontend | Next.js 15 + Shadcn 4.11 + Tailwind v4 | UI web (:3001) |
| API Gateway | Koa + @koa/router | HTTP (:3000), supervisor NATS |
| Message broker | NATS 2 (alpine) | Request/reply entre supervisor et agents |
| Agents | Node.js/TypeScript | 5 processus autonomes |
| LLM | Ollama (llama3.2:3b) | Génération du rapport (hôte) |
| Traces | OpenTelemetry + Jaeger | Spans distribués (:16686) |
| Logs | Pino + Promtail + Loki | Logs JSON structurés (:3100) |
| Observabilité UI | Grafana | Dashboard logs + traces (:3002) |
| Déploiement | Docker Compose | Compatible Portainer |

### Architecture monorepo

```
poc-agent-meteo/
├── apps/
│   ├── api/                     ← Gateway Koa + Orchestrator
│   │   └── src/
│   │       ├── index.ts         ← point d'entrée (import tracing en premier)
│   │       ├── tracing.ts       ← OTel SDK (OTEL_SERVICE_NAME=api)
│   │       ├── logger.ts        ← Pino + traceCtx()
│   │       ├── api/
│   │       │   ├── server.ts    ← Koa app
│   │       │   └── routes.ts    ← POST /weather-report, GET /agents, GET /tasks/:id/events
│   │       ├── orchestrator/
│   │       │   └── WeatherReportOrchestrator.ts  ← nc.request() × 5, spans OTel
│   │       ├── harness/
│   │       │   └── TaskStore.ts ← in-memory, events par tâche
│   │       ├── registry/
│   │       │   ├── AgentRegistry.ts
│   │       │   └── agents.json  ← liste statique des agents + natsSubject
│   │       └── types/
│   │           └── task.ts
│   ├── agents/                  ← 5 processus autonomes
│   │   └── src/
│   │       ├── tracing.ts       ← OTel SDK (OTEL_SERVICE_NAME par env)
│   │       ├── shared/
│   │       │   ├── types.ts     ← GeoLocation, WeatherData, WeatherRisk, AgentResponse
│   │       │   └── logger.ts    ← Pino + traceCtx()
│   │       ├── clients/
│   │       │   ├── OpenMeteoGeocodingClient.ts
│   │       │   ├── OpenMeteoForecastClient.ts
│   │       │   └── OllamaClient.ts
│   │       ├── geocoding/index.ts        → agents.location.resolve
│   │       ├── weather-fetch/index.ts    → agents.weather.fetch
│   │       ├── weather-risk/index.ts     → agents.weather.risk
│   │       ├── report-writer/index.ts    → agents.report.write
│   │       └── quality-check/index.ts   → agents.report.check
│   └── web/                     ← Next.js 15 standalone
│       ├── app/
│       │   ├── page.tsx
│       │   └── api/
│       │       ├── weather/route.ts           ← proxy POST → api:3000
│       │       ├── agents/route.ts            ← proxy GET
│       │       └── tasks/[taskId]/events/route.ts
│       └── components/
│           ├── WeatherForm.tsx
│           ├── WeatherReport.tsx  ← conditions déterministes (pas dépendantes Ollama)
│           └── AgentTrace.tsx     ← affiche les events de chaque agent
├── config/
│   ├── promtail.yml             ← collecte logs Docker → Loki
│   └── grafana/
│       └── datasources.yml      ← Loki + Jaeger, lien traceId → Jaeger
├── docker-compose.yml
├── .env.example                 ← OLLAMA_URL, OLLAMA_MODEL
├── ROADMAP.md
└── package.json                 ← npm workspaces (apps/*)
```

### Pattern NATS request/reply

```
Supervisor (apps/api)                    Agent (apps/agents)
─────────────────────                    ──────────────────
nc.request(subject, payload, {           nc.subscribe(subject)
  headers: W3C TraceContext,             for await (msg of sub) {
  timeout: 30_000                          // extraire contexte OTel
})                                         // créer span enfant
  → attend réponse                         // traiter
  ← AgentResponse<T>                       msg.respond(result)
                                         }
```

### Sujets NATS

| Sujet | Agent | Type |
|-------|-------|------|
| `agents.location.resolve` | geocoding-agent | programmatique |
| `agents.weather.fetch` | weather-fetch-agent | programmatique |
| `agents.weather.risk` | weather-risk-agent | programmatique |
| `agents.report.write` | report-writer-agent | LLM (Ollama) |
| `agents.report.check` | quality-check-agent | programmatique |

### Observabilité

- **Propagation de contexte** : W3C TraceContext injecté dans les headers NATS (`traceparent`)
- **Spans** : un span parent `weather-report.run` dans le supervisor, 5 spans enfants `nats.request {subject}`, puis un span dans chaque agent (`geocoding.resolve`, `weather.fetch`, etc.)
- **Logs** : Pino JSON avec `traceId` + `spanId` sur chaque ligne → Loki
- **Lien log→trace** : derived field Grafana sur `"traceId":"([0-9a-f]{32})"` → ouvre Jaeger
- **Variables d'env** : `OTEL_SERVICE_NAME` par service, `OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318`

### Ollama

- Tourne sur le **poste hôte** (pas dans Docker)
- Accessible depuis les containers via `host.docker.internal:11434`
- Sur Linux/Portainer : `extra_hosts: - "host.docker.internal:host-gateway"` dans `agent-report-writer`
- Configurable via `.env` : `OLLAMA_URL`, `OLLAMA_MODEL`

### Dockerfiles

- `apps/api/Dockerfile` : multi-stage, `npm install` (pas `npm ci` — pas de lock file par workspace)
- `apps/agents/Dockerfile` : multi-stage, `ARG AGENT_TYPE` → `ENTRYPOINT ["sh","-c","node dist/${AGENT_TYPE}/index.js"]`
- `apps/web/Dockerfile` : Next.js standalone (`output: "standalone"` dans `next.config.ts`)

---

## Niveau 4 — État courant et décisions prises

### Décisions architecturales

| Décision | Choix retenu | Alternative écartée | Raison |
|----------|-------------|---------------------|--------|
| Message broker | NATS | MQTT, RabbitMQ | Request/reply natif, binaire léger, Docker simple |
| Orchestration | Supervisor déterministe | LLM planner | Fiabilité pour un POC, LLM planner en roadmap |
| Agents | Processus séparés | In-process | Autonomie réelle, scalabilité indépendante |
| Conditions météo UI | Déterministes (weatherData) | Parsées depuis Ollama | Ollama hallucine parfois les conditions |
| LLM | Ollama local (llama3.2:3b) | API cloud | Pas de coût, démo offline |

### Bugs corrigés (historique)

- `npm ci` → `npm install` dans Dockerfiles (workspaces npm = pas de lock file par app)
- `types: ["node"]` ajouté aux tsconfig (console/process introuvables sans)
- `output: "standalone"` dans next.config.ts pour le Dockerfile web
- Sections Ollama absentes : prompt itéré 4 fois, regex parseReport étendue aux `**bold**`
- Probabilité de pluie absente dans l'UI : conditions rendues déterministes via `weatherData`

### Ce qui reste en mémoire (in-memory, non persisté)

- `TaskStore` — tâches et events perdus au redémarrage de l'API

---

## Niveau 5 — Roadmap (résumé)

| Item | Priorité | Statut |
|------|----------|--------|
| Streaming SSE (progression agent par agent) | Haute | À faire |
| Health check des agents (heartbeat NATS) | Haute | À faire |
| Découverte dynamique des agents | Moyenne | À faire |
| Skills externalisés — pattern Semantic Kernel | Moyenne | À faire |
| Scalabilité horizontale — NATS Queue Groups | Moyenne | À faire |
| Orchestration LLM dynamique (remplace supervisor) | Exploratoire | À faire |
| Persistance des tâches — Redis | Basse | À faire |

Détail complet : `ROADMAP.md`

---

## Niveau 6 — Références

| Fichier | Contenu |
|---------|---------|
| `weather-report-writer-agent.md` | Spec complète du prompt Ollama, 4 itérations, critères qualité, exemple entrée/sortie |
| `prompt-success.md` | Critères de succès du prompt (grille de scoring 15/15) |
| `ROADMAP.md` | Items backlog détaillés avec sous-tâches |
| `apps/agents/src/shared/types.ts` | Types partagés entre agents (GeoLocation, WeatherData, WeatherRisk, AgentResponse) |
| `config/grafana/datasources.yml` | Provisioning Grafana : Loki + Jaeger + lien traceId |
| `config/promtail.yml` | Collecte logs Docker, parsing JSON Pino, labels level/traceId |
| `.env.example` | Variables d'environnement Docker (OLLAMA_URL, OLLAMA_MODEL) |
