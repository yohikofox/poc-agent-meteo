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

### Persistance des tâches (Redis)
**Priorité : basse — utile pour la stabilité long terme**

Le `TaskStore` est en mémoire : un redémarrage de l'API efface l'historique.

- [ ] Ajouter Redis dans docker-compose
- [ ] Adapter `TaskStore` pour persister dans Redis
- [ ] TTL configurable sur les tâches terminées
