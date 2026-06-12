# Roadmap — POC Plateforme Agentique Météo

## En cours / Fait

- [x] Architecture monorepo (`apps/api`, `apps/agents`, `apps/web`)
- [x] 5 agents autonomes via NATS request/reply
- [x] Supervisor avec propagation de contexte de trace
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

### Health check des agents
**Priorité : haute — indispensable en conditions réelles**

Chaque agent publie un heartbeat périodique. Le superviseur détecte les agents
silencieux avant de leur envoyer une requête.

- [ ] Heartbeat NATS sur `agents.health.{id}` toutes les 5s
- [ ] Endpoint `GET /agents/health` sur l'API
- [ ] Indicateurs UP/DOWN dans l'UI

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

### Orchestration LLM dynamique (remplacement de l'orchestrator)
**Priorité : exploratoire — prochaine frontière agentique**

Remplacer le `WeatherReportOrchestrator` déterministe par un LLM planificateur
qui décide dynamiquement quels agents appeler et dans quel ordre selon la requête.
Les agents NATS deviennent des *tools* invocables par le LLM.

Ce pattern est celui de LangGraph / AutoGen : l'orchestration sort du code
pour entrer dans le raisonnement du modèle.

- [ ] Exposer chaque agent NATS comme un tool (nom, description, schéma d'entrée/sortie)
- [ ] Implémenter un LLM planner (Ollama + modèle function-calling, ex: `llama3.1:8b`)
- [ ] Le planner reçoit la requête, sélectionne et séquence les agents, agrège les résultats
- [ ] Comparer les comportements : orchestrator déterministe vs planner LLM

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
