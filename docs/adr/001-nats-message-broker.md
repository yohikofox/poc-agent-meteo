# ADR-001 — NATS comme message broker

**Statut** : Accepté  
**Date** : 2026-06

---

## Contexte

La plateforme repose sur 5 agents autonomes qui doivent communiquer entre eux de façon découplée. Le supervisor doit envoyer une tâche à un agent et attendre sa réponse avant de passer à l'étape suivante.

Les alternatives étudiées : MQTT, RabbitMQ, Redis Streams, HTTP direct entre services.

## Décision

Utiliser **NATS 2** comme message broker unique.

## Justification

| Critère | NATS | RabbitMQ | MQTT | HTTP direct |
|---------|------|----------|------|-------------|
| Request/reply natif | ✅ | ❌ (corrélation manuelle) | ❌ | ✅ |
| Légèreté (Docker) | ✅ < 20 MB | ❌ > 100 MB | ✅ | — |
| Propagation headers | ✅ `MsgHdrs` | ⚠️ complexe | ❌ | ✅ |
| Queue groups (scale) | ✅ natif | ✅ | ❌ | ❌ |
| Découverte dynamique | ✅ possible | ⚠️ | ❌ | ❌ |

Le pattern `nc.request()` / `msg.respond()` de NATS mappe directement sur le flux supervisor → agent → résultat. Pas besoin de gérer des queues de réponse ou des corrélation IDs manuellement.

## Conséquences

- Le `WeatherReportSupervisor` appelle `nc.request(subject, payload, { headers, timeout })` et bloque jusqu'à la réponse.
- Chaque agent tourne une boucle `for await (const msg of sub)` — traitement séquentiel des messages par instance.
- Pour la scalabilité horizontale d'un agent : NATS Queue Groups (prévu en roadmap).
- Les headers NATS (`MsgHdrs`) permettent la propagation W3C TraceContext sans modifier le payload métier.
