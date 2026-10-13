# Architecture et couverture Office

## Choix effectivement implémentés

1. **React JS/JSX + Vite + Bun** : une application web, sans TypeScript ni framework serveur. Routage par fragment et paramètres de sélection ; liens standards avec historique navigateur. Style de surfaces sombres, hiérarchie visuelle, formulaires nommés, focus visible, dialogues clavier et disposition responsive. Aucune police/CDN externe.
2. **`src/api.js`** : frontière HTTP injectée seulement pour tests ; sessions cookie, CSRF mémoire, états session réactifs via `useSyncExternalStore`. Abort + génération commune à toutes les opérations et transitions ; erreurs expurgées/françaises. Pas de cache persistant.
3. **`src/useResource.js`** : états lecture par ressource/filtre/révision, annulation à chaque changement et garde active indépendante de la coopération du transport. Effacement des données obsolètes plutôt que maintien trompeur pendant une nouvelle lecture.
4. **`src/components.jsx`** : tableaux métier avec clés camelCase/SQL MAJUSCULES, recherche/pagination, formulaires de commandes, confirmations qui montrent valeurs et conséquences. Pas d’éditeur JSON brut. Révision de lectures après succès, sans mutation optimiste. Les contrôles HTML complètent les validations serveur.
5. **`src/commands.js`, `src/pages.jsx`, `src/Stats.jsx`** : catalogue explicite méthode/chemin/champs/effets. Le métier reste dans Feezit ; ni règle de classement, ni attribution, ni échéance reconstruite depuis une donnée absente.

## Traçabilité des décisions

| ID | Source actuelle | Couverture frontend | Preuves |
| --- | --- | --- | --- |
| FO-01 | Office/implementation, contrat Office §Session | François seul, login/refus, CSRF, logout, nettoyages 401/stale | session, access, safety |
| FO-02 | Convention §7, modalités §5, contrat stats | compte/période, quotidien 2 mesures, source/limites | stats |
| FO-03 | Convention §4/8, contrat reservations | accord/version/date/référence, draft, conflit, codes exacts | reservations |
| FO-04 | Gratuité §4, contrat brands/waitlist | alias, attente, réception réponses sans attribution/rang | waitlist, dashboard |
| FO-05 | Convention §5/9, modalités §4, contrat management | dossiers et transitions distinctes, conséquences, profil nouveau | moderation, safety, limitations |
| FO-06 | Contrat outbox/jobs et email-deliveries | pending/sent/incertain, émission attestée, confirmations jobs | notifications, limitations |
| FO-08 | Extension dédiée du contrat Office | répertoires serveur, recherche/pagination, sélection UUID | reservations, dashboard, browser |
| FO-07 | Proposition différée dans Office/implementation | aucun audit nominatif durable fabriqué | exclusion explicite |

Sources Office historiques « initialisation uniquement » remplacées pour ce lot par `Office/feezit-office-implementation.md` et la demande actuelle. Prospection/kit commercial, ancien FEZ-14, paiements/équipe/SSO/mobile : exclus, non transformés en exigences. Aucune lecture exhaustive des notes du portefeuille ni validation juridique revendiquée.

## TDD et niveaux de vérification

Tranches observées rouge → vert : accès refusé ; session/navigation et nettoyage ; réservation/conflit et pagination ; attente/alias ; confirmations des décisions ; notifications/jobs ; statistiques ; tableau opérationnel ; valeurs/focus de confirmation ; limitations incidents et transport incertain. Les garde-fous de courses supplémentaires ont également été rejoués contre des promesses HTTP contrôlées.

Les tests fonctionnels rendent les vrais composants et manipulent les vrais formulaires via Testing Library, sans mock des hooks, du routage ou du catalogue de commandes. Les doubles restent à la frontière HTTP. Les tests Chromium utilisent une interception HTTP limitée à `tests/browser/`, avec données synthétiques déclarées et captures régénérées. Lint/build/audit sont des gates techniques séparées, pas des tests métier.

Limites : pas de transport email ni identifiants réels utilisés, pas de mutation réelle de backend par cette sous-tâche, pas de certification sécurité/accessibilité, intégration backend isolée à mener par l’orchestrateur propriétaire de cette stack. Le contrat de lecture incidents ne donne actuellement aucun type ou ouverture propre dans le schéma existant ; `null` reste `—`.
