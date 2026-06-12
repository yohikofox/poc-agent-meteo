# Critères de succès — Agent de synthèse météo

Score maximal : **15 points**

## 1. Respect du format (4 points)

Le rapport doit contenir les sections suivantes :

- Résumé
- Conditions actuelles
- Risques
- Conseils

### Notation

- 1 point par section présente
- Maximum : 4 points

---

## 2. Exhaustivité des données (4 points)

Le rapport doit mentionner explicitement :

- Température
- Probabilité de pluie
- Vent
- Humidité

### Notation

- 1 point par donnée correctement mentionnée
- Maximum : 4 points

---

## 3. Cohérence métier (2 points)

Le rapport doit interpréter correctement les données fournies.

### Cas attendus

- Si `rainProbability > 70`, le rapport doit mentionner un risque de pluie significatif.
- Si `wind > 40`, le rapport doit mentionner un vent fort ou des rafales.

### Notation

- 1 point pour la pluie
- 1 point pour le vent
- Maximum : 2 points

---

## 4. Absence d'hallucinations (5 points)

Le rapport ne doit pas inventer d'informations absentes des données d'entrée.

### Informations interdites si absentes de l'entrée

- UV
- Pression atmosphérique
- Orages
- Neige
- Qualité de l'air
- Toute autre donnée non fournie

### Notation

- 5 points : aucune hallucination
- 0 point : au moins une hallucination détectée

---

# Résultat final

| Critère                  | Points  |
|--------------------------|---------|
| Format                   | /4      |
| Exhaustivité             | /4      |
| Cohérence métier         | /2      |
| Absence d'hallucinations | /5      |
| **Total**                | **/15** |

---

# Conditions de réussite

- **13-15** : Excellent
- **10-12** : Correct
- **7-9** : Moyen
- **< 7** : Prompt à retravailler

---

# Objectif de l'exercice

Optimiser progressivement le prompt afin d'améliorer le score tout en conservant :

- un rapport lisible ;
- une structure stable ;
- une interprétation correcte ;
- zéro hallucination.