# WeatherReportWriterAgent

## Rôle

Agent LLM local (Ollama) chargé de transformer des données météo structurées en rapport lisible en français.  
C'est le seul agent LLM de la plateforme — tous les autres agents sont programmatiques.

## Capability

```
weather.report.write
```

## Modèle

| Paramètre | Valeur |
|-----------|--------|
| Moteur | Ollama local |
| Modèle | `llama3.2:3b` (configurable via `OLLAMA_MODEL`) |
| Endpoint | `http://localhost:11434/api/generate` |
| `num_predict` | `600` |
| `stream` | `false` |

---

## Prompt forgé

Le prompt a été optimisé en boucle itérative (4 itérations) pour atteindre 15/15 selon les critères de `prompt-success.md`.  
Les variables entre accolades sont injectées dynamiquement par l'agent.

```
Tu es un météorologue factuel. Génère un rapport météo concis en français pour {location} avec EXACTEMENT ces 4 sections :

## Résumé
## Conditions actuelles
## Risques
## Conseils

Données disponibles (utilise UNIQUEMENT ces données) :
- Température : {temperature}°C
- Probabilité de pluie : {rainProbability}%
- Vent : {wind} km/h
- Humidité : {humidity}%

INTERDIT : tu ne dois jamais inventer ni déduire des données absentes. Ne mentionne PAS : UV, pression atmosphérique, orages, neige, qualité de l'air, ensoleillement, nébulosité, ni aucun autre paramètre absent de la liste ci-dessus.

OBLIGATOIRE dans la section Risques :
- Mentionner un risque de pluie significatif si probabilité de pluie > 70%.
- Mentionner un vent fort ou des rafales si vent > 40 km/h.
```

### Variables attendues en entrée

| Variable | Type | Exemple |
|----------|------|---------|
| `location` | `string` | `"Nantes"` |
| `temperature` | `number` | `22` |
| `rainProbability` | `number` | `75` |
| `wind` | `number` | `45` |
| `humidity` | `number` | `68` |

---

## Exemples

### Entrée

```json
{
  "location": "Nantes",
  "temperature": 22,
  "rainProbability": 75,
  "wind": 45,
  "humidity": 68
}
```

### Sortie attendue (itération 4 — 15/15)

```
## Résumé
La situation météorologique actuelle à Nantes est marquée par une température
relativement élevée de 22°C, avec une probabilité de pluie importante à 75%.
Les vents soufflent forts à 45 km/h.

## Conditions actuelles
- Température : 22°C
- Probabilité de pluie : 75%
- Vent : 45 km/h
- Humidité : 68%

## Risques
- Un risque de pluie significatif est présent, avec une probabilité de 75%.
- Des rafales ventées peuvent se produire à 45 km/h.

## Conseils
- Portez des vêtements adaptés aux conditions pluvieuses (imperméable, chaussures fermées).
- Évitez les activités extérieures prolongées par vent fort.
```

---

## Critères de qualité

Référence complète : [`prompt-success.md`](./prompt-success.md)

| Critère | Points | Condition |
|---------|--------|-----------|
| Format | 4 | 4 sections présentes : Résumé, Conditions actuelles, Risques, Conseils |
| Exhaustivité | 4 | Température, pluie, vent, humidité explicitement mentionnés |
| Cohérence métier | 2 | Risque pluie si > 70% / Vent fort si > 40 km/h |
| Zéro hallucination | 5 | Aucune donnée absente de l'entrée (UV, pression, orages…) |
| **Total** | **15** | Seuil de réussite : ≥ 13 |

---

## Historique d'optimisation du prompt

| Itération | Score | Problème identifié |
|-----------|-------|--------------------|
| 1 | 13/15 | Sections Résumé et Risques absentes |
| 2 | 14/15 | Section Conseils tronquée (`num_predict` insuffisant) |
| 3 | 10/15 | Hallucination : "ensoleillée" inventé |
| 4 | **15/15** | Interdiction explicite des qualificatifs non fournis |

---

## Intégration dans la plateforme

```ts
// src/agents/WeatherReportWriterAgent.ts

const prompt = `Tu es un météorologue factuel. Génère un rapport météo concis en français pour ${payload.location} avec EXACTEMENT ces 4 sections :

## Résumé
## Conditions actuelles
## Risques
## Conseils

Données disponibles (utilise UNIQUEMENT ces données) :
- Température : ${payload.temperature}°C
- Probabilité de pluie : ${payload.rainProbability}%
- Vent : ${payload.wind} km/h
- Humidité : ${payload.humidity}%

INTERDIT : tu ne dois jamais inventer ni déduire des données absentes. Ne mentionne PAS : UV, pression atmosphérique, orages, neige, qualité de l'air, ensoleillement, nébulosité, ni aucun autre paramètre absent de la liste ci-dessus.

OBLIGATOIRE dans la section Risques :
- Mentionner un risque de pluie significatif si probabilité de pluie > 70%.
- Mentionner un vent fort ou des rafales si vent > 40 km/h.`;

const report = await ollamaClient.generate(prompt);
```
