# Roadmap — POC Plateforme Agentique Météo

## En cours / Fait

- [x] Architecture monorepo (`apps/api`, `apps/agents`, `apps/web`)
- [x] 5 agents autonomes via NATS request/reply
- [x] Orchestrator séquentiel avec propagation de contexte de trace
- [x] Observabilité : OpenTelemetry + Jaeger + Pino + Loki + Grafana

---

## À faire

### Streaming temps réel (SSE)
**Priorité : haute — impact visuel fort**

Remplacer l'attente bloquante (~8s) par un flux Server-Sent Events.
L'UI s'anime au fur et à mesure que chaque agent répond.

- [ ] Endpoint `GET /weather-report/stream` côté API (SSE)
- [ ] Route Next.js proxy vers le stream
- [ ] Composant UI avec progression agent par agent

---

### Health check des agents (observation)
**Priorité : haute — indispensable en conditions réelles**

Chaque agent publie un heartbeat périodique. L'orchestrator peut détecter les agents
silencieux avant de leur envoyer une requête.

> Concept : **observation passive** — on sait si un agent est UP ou DOWN, mais on ne réagit pas encore automatiquement.

- [ ] Heartbeat NATS sur `agents.health.{id}` toutes les 5s
- [ ] Endpoint `GET /agents/health` sur l'API
- [ ] Indicateurs UP/DOWN dans l'UI

---

### Supervisor actif (retry + fallback)
**Priorité : haute — distingue l'observation de la réaction**

Le health check observe. Le supervisor *réagit* : si le `report-writer-agent` ne répond pas,
il relance, tente un fallback ou dégrade gracieusement.

> Concept : **supervision active** — distinct de l'orchestration (qui séquence) et de l'observation (qui surveille).
> Exemple fonctionnel : Ollama est surchargé, le premier appel timeout. Le supervisor relance jusqu'à 3 fois
> avec backoff exponentiel. Si toujours en échec, il retourne un rapport partiel (données météo + risques)
> sans la narration LLM plutôt qu'une erreur 500.

- [ ] Retry avec backoff exponentiel dans `WeatherReportOrchestrator.request()`
- [ ] Fallback configurable par agent (ex: rapport tronqué si `report-writer` indisponible)
- [ ] Circuit breaker : après N échecs consécutifs, ne plus appeler l'agent pendant X secondes
- [ ] Exposer l'état du circuit breaker dans `GET /agents/health`

---

### Fan-out Orchestrator (agrégation multi-sources)
**Priorité : moyenne — démontre la valeur du pattern parallèle**

Appeler plusieurs sources météo en parallèle et agréger les résultats, au lieu de dépendre
d'une seule source. Démonstration du pattern fan-out / reduce.

> Concept : **orchestration parallèle sans adhérence** — aucun agent n'attend un autre,
> tous partent en même temps, l'orchestrator collecte et tranche.
> Exemple fonctionnel : Open-Meteo, un agent simulant Météo France et un troisième fournisseur
> sont interrogés simultanément. L'orchestrator retient la médiane de température et la
> probabilité de pluie maximale (stratégie pessimiste).

- [ ] Créer `weather-fetch-alt-agent` (même interface, source différente ou simulée)
- [ ] Ajouter `FanOutOrchestrator` qui appelle les N agents weather-fetch en parallèle via `nc.request()`
- [ ] Stratégie d'agrégation configurable (médiane, vote majoritaire, pessimiste)
- [ ] Comparer la latence : fan-out (max des N) vs séquentiel (somme des N)

---

### Découverte dynamique des agents
**Priorité : moyenne — cœur du concept agentique**

Les agents s'enregistrent eux-mêmes au démarrage. L'API découvre les capacités
disponibles sans `agents.json` statique.

- [ ] Publication `agents.register` au démarrage de chaque agent
- [ ] Registry dynamique dans l'API (remplace `agents.json`)
- [ ] Désinscription à l'arrêt (`SIGTERM`)

---

### Scalabilité horizontale d'un agent (NATS Queue Groups)
**Priorité : moyenne — démo de la valeur de NATS**

NATS distribue nativement les messages sur plusieurs instances d'un même agent
(queue group). Le `report-writer` (~6-8s Ollama) est le candidat idéal.

- [ ] Activer queue group dans les agents (`{ queue: "agents.report.write" }`)
- [ ] Lancer 2 instances de `agent-report-writer` dans docker-compose
- [ ] Mesurer la réduction de latence sous charge

---

### Planner LLM + Executor (orchestration dynamique)
**Priorité : exploratoire — prochaine frontière agentique**

Introduire le split **Planner / Executor** : un LLM raisonne sur *quels* agents appeler
et dans *quel ordre* selon la requête. L'Executor se charge d'appeler les agents NATS
selon le plan produit, sans logique de décision.

> Concept : **séparation décision / exécution**.
> - `Planner` (LLM) : reçoit "Dois-je partir en rando ce weekend ?" et décide
>   `[geocoding, weather-fetch ×2 jours, weather-risk]` — pas de `report-writer` ni `quality-check`.
> - `Executor` : reçoit le plan, appelle les agents NATS dans l'ordre, retourne les résultats.
> - Même requête simple "météo à Paris" → plan différent → appels différents.
>
> L'`WeatherReportOrchestrator` actuel fait les deux à la fois (plan figé dans le code + exécution).
> Ce pattern les sépare, ce qui permet de changer le plan sans toucher à l'exécution.

- [ ] Définir le schéma d'un plan : `[{ agentId, subject, inputFrom }]`
- [ ] Implémenter `PlanExecutor` : prend un plan, appelle les agents NATS en séquence
- [ ] Exposer chaque agent comme un tool LLM (nom, description, schéma entrée/sortie)
- [ ] Implémenter `LLMPlanner` (Ollama + modèle function-calling, ex: `llama3.1:8b`)
- [ ] Comparer les plans générés : orchestrator déterministe vs planner LLM sur différentes requêtes

---

### Skills externalisés (pattern Semantic Kernel)
**Priorité : moyenne — évite les prompts en dur dans le code**

Extraire les prompts des agents dans des fichiers versionnés (`skills/`).
Chaque skill est un artefact indépendant : template, modèle cible, paramètres,
critères de qualité. L'agent devient un exécuteur générique qui charge son skill
au démarrage.

Bénéfices : changer un prompt sans redéployer, versionner les itérations,
A/B tester deux templates en parallèle.

```
skills/
  weather-report-write/
    v1.json   ← prompt itération 4 (15/15, actuellement en dur)
    v2.json   ← future itération
```

```json
{
  "id": "weather.report.write",
  "version": "1.0.0",
  "model": "llama3.2:3b",
  "num_predict": 1000,
  "template": "Tu es un météorologue factuel..."
}
```

- [ ] Définir le schéma JSON d'un skill (id, version, model, num_predict, template)
- [ ] Migrer le prompt de `report-writer/index.ts` → `skills/weather-report-write/v1.json`
- [ ] Charger le skill au démarrage de l'agent (fichier ou variable d'env `SKILL_PATH`)
- [ ] Étendre aux futurs agents LLM sans modifier leur code

---

### Persistance des tâches (Redis)
**Priorité : basse — utile pour la stabilité long terme**

Le `TaskStore` est en mémoire : un redémarrage de l'API efface l'historique.

- [ ] Ajouter Redis dans docker-compose
- [ ] Adapter `TaskStore` pour persister dans Redis
- [ ] TTL configurable sur les tâches terminées
