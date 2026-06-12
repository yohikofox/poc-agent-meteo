# ADR-004 — Conditions météo UI déterministes

**Statut** : Accepté  
**Date** : 2026-06

---

## Contexte

L'UI affiche des métriques météo (température, probabilité de pluie, vent, humidité) et des badges de risques. Ces données peuvent provenir de deux sources :

1. **Parsées depuis le rapport Ollama** : on extrait les valeurs du texte généré.
2. **Directement depuis `weatherData`** : on utilise les données brutes retournées par le `weather-fetch-agent`.

## Décision

Rendre les conditions météo **déterministes** en utilisant `weatherData` directement — pas en parsant le rapport Ollama.

## Justification

Lors des tests du prompt, Ollama a produit plusieurs comportements indésirables :
- Inventer des valeurs numériques non fournies ("la température ressentie est de 12°C")
- Omettre des données présentes dans le prompt
- Formater les nombres différemment selon les runs ("20%" vs "20 %" vs "vingt pour cent")

Parser du texte LLM pour en extraire des valeurs numériques est fragile par nature.

Les données brutes de `weather-fetch-agent` (Open-Meteo) sont fiables et déjà structurées — les utiliser directement est plus robuste.

## Conséquences

- `WeatherReport.tsx` reçoit `weatherData` en prop et affiche les valeurs sans traitement.
- Le rapport Ollama sert uniquement au texte narratif des 4 sections.
- Les badges de risques (`risks[]`) viennent du `weather-risk-agent` (logique pure TypeScript, déterministe).
- Si le rapport Ollama contient des valeurs différentes des métriques affichées, ce n'est pas un bug — c'est la séparation voulue entre données factuelles et narration.
