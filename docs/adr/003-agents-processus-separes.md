# ADR-003 — Agents comme processus Docker séparés

**Statut** : Accepté  
**Date** : 2026-06

---

## Contexte

Les 5 agents peuvent être implémentés soit comme des processus/containers indépendants, soit comme des modules dans un processus unique.

## Décision

Chaque agent tourne dans son **propre container Docker**, buildé depuis un `Dockerfile` commun avec `ARG AGENT_TYPE`.

## Justification

**Isolation réelle** : un crash du `report-writer-agent` (timeout Ollama, OOM) ne tue pas les autres agents.

**Scalabilité indépendante** : le `report-writer-agent` est le goulot d'étranglement (~6-8s pour Ollama). On peut lancer 2 instances sans toucher aux autres agents (NATS Queue Groups).

**Démonstration agentique** : l'intérêt du pattern est que chaque agent est autonome — un agent in-process serait un simple appel de fonction.

**Build partagé** : un seul `Dockerfile` pour les 5 agents. L'`ARG AGENT_TYPE` détermine quel `index.js` est lancé :
```dockerfile
ARG AGENT_TYPE
ENV AGENT_TYPE=${AGENT_TYPE}
ENTRYPOINT ["sh", "-c", "node dist/${AGENT_TYPE}/index.js"]
```

## Conséquences

- 5 services distincts dans `docker-compose.yml`, 1 seule image buildée par agent.
- `npm install` dans le Dockerfile au lieu de `npm ci` — les workspaces npm mettent le `package-lock.json` à la racine, pas dans chaque app.
- Chaque agent a son propre `OTEL_SERVICE_NAME` → traces séparées par service dans Jaeger.
