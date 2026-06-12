# ADR-002 — Orchestrator déterministe (vs LLM planner)

**Statut** : Accepté  
**Date** : 2026-06

---

## Contexte

Il faut un mécanisme pour orchestrer les 5 agents dans le bon ordre et propager les données entre eux. Deux approches ont été évaluées :

1. **Orchestrator déterministe** : code TypeScript qui appelle les agents dans un ordre fixe.
2. **LLM planner** : un modèle de langage décide dynamiquement quels agents appeler et dans quel ordre.

## Décision

Utiliser un **orchestrator déterministe** (`WeatherReportOrchestrator.ts`).

## Justification

**Avantages du orchestrator déterministe pour un POC :**
- Comportement prévisible et reproductible à chaque exécution
- Erreurs faciles à localiser (stack trace claire)
- Pas de dépendance à un modèle function-calling (llama3.2:3b n'est pas optimisé pour ça)
- Latence contrôlée — pas de round-trip LLM supplémentaire pour l'orchestration

**Pourquoi le LLM planner a été écarté pour l'instant :**
- Nécessite un modèle avec function-calling fiable (ex: `llama3.1:8b`)
- Risque d'hallucination dans la sélection des agents
- Complexité de débogage (le raisonnement du modèle n'est pas déterministe)

## Conséquences

- L'ordre d'exécution est fixé dans le code : geocoding → weather-fetch → weather-risk → report-writer → quality-check.
- Ajouter un agent nécessite de modifier `WeatherReportOrchestrator.ts`.
- Le LLM planner reste en roadmap (priorité exploratoire) pour démontrer l'orchestration dynamique.

## Évolution prévue

Voir `ROADMAP.md` — item "Orchestration LLM dynamique" : exposer chaque agent NATS comme un tool invocable par le LLM, et remplacer l'orchestrator par un planner Ollama.
