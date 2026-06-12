---
1. Comparaison météo multi-villes

▎ "Où fait-il le mieux vivre ce weekend : Paris, Lyon ou Bordeaux ?"

Lance le pipeline complet en parallèle pour N villes. Si une ville échoue (géocodage introuvable), le supervisor continue avec les autres et dégrade gracieusement. Retourne un rapport comparatif.

→ Démontre : fan-out + supervisor (tolérance aux échecs partiels)

---
2. Bulletin météo agricole (pertinent pour IsAgri)

▎ "Quels sont les risques pour les cultures cette semaine dans le Finistère ?"

Nouveaux agents : agro-risk-agent (gel tardif, excès de pluie pour la récolte, vent pour les traitements phyto) + agro-report-writer. Le quality-check devient critique — un conseil agricole erroné a des conséquences réelles → le supervisor doit retry.

→ Démontre : supervisor avec enjeu métier fort, spécialisation d'agents

---
3. Alerte météo sur seuil

▎ "Préviens-moi si le risque de gel passe en 'high' pour Rennes"

Un agent monitor-agent tourne en boucle, appelle le pipeline périodiquement, et publie un event NATS si un seuil est franchi. Le supervisor décide si l'alerte est légitime (évite les faux positifs).

→ Démontre : supervision continue (pas juste request/reply), agents longue durée

---
4. Prévision itinéraire

▎ "Je pars de Brest à Nice vendredi — quel temps vais-je traverser ?"

N points de passage = N pipelines en parallèle. Le supervisor gère les échecs partiels et construit un rapport de trajet cohérent même si 1 ou 2 étapes sont indisponibles.

→ Démontre : fan-out avec données géospatiales, rapport agrégé multi-sources
> Testé dans le supervisor
---