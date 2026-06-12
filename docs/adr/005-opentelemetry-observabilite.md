# ADR-005 — OpenTelemetry + Pino pour l'observabilité

**Statut** : Accepté  
**Date** : 2026-06

---

## Contexte

La plateforme comprend 7 processus distincts (api + 5 agents + web). Il faut pouvoir :
- Suivre une requête utilisateur à travers tous les agents (traces distribuées)
- Corréler les logs d'un service avec sa trace correspondante
- Visualiser les performances de chaque agent

## Décision

Stack d'observabilité : **OpenTelemetry SDK Node → Jaeger** (traces) + **Pino → Promtail → Loki → Grafana** (logs).

## Justification

**OpenTelemetry** est le standard vendor-neutral pour les traces et métriques. Le SDK Node.js auto-instrumente HTTP, fetch et dns sans code supplémentaire.

**Jaeger all-in-one** (Docker) est la cible la plus simple pour stocker et visualiser les traces OTLP — une seule image, aucune configuration.

**Pino** génère des logs JSON structurés avec latence minimale (streams Node.js natifs). La fonction `traceCtx()` injecte `traceId` + `spanId` dans chaque ligne de log via l'API OTel.

**Loki** indexe uniquement les labels (pas le contenu des logs) — consommation mémoire très faible. Promtail collecte les logs Docker directement via le socket.

**Grafana** unifie les deux sources : un champ dérivé sur `"traceId":"([0-9a-f]{32})"` crée un bouton "Voir dans Jaeger" sur chaque ligne de log.

## Implémentation clé

### Propagation de contexte cross-process

Le contexte W3C TraceContext est injecté dans les headers NATS (`traceparent`) par le supervisor, puis extrait par chaque agent pour créer un span enfant :

```
supervisor (span parent)
  └─ nats.request agents.location.resolve
       └─ geocoding.resolve  ← span enfant dans un autre process
```

### Contrainte critique

`import "./tracing"` **doit être la première ligne** de chaque entrypoint. Le SDK OTel instrumente les modules au moment de leur import — si un import HTTP ou fetch précède l'init OTel, il ne sera pas instrumenté.

## Conséquences

- Chaque service a `OTEL_SERVICE_NAME` et `OTEL_EXPORTER_OTLP_ENDPOINT` en variable d'environnement.
- Les logs Pino incluent systématiquement `traceId` + `spanId` quand un span est actif.
- Grafana est le point d'entrée unique pour déboguer : logs filtrables par service/niveau, lien direct vers la trace Jaeger.
- Promtail nécessite l'accès au socket Docker (`/var/run/docker.sock`) — prévoir les permissions en environnement Portainer.
