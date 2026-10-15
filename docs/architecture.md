# Architecture et couverture Office

## Choix effectivement implémentés

1. **React JS/JSX + Vite + Bun** : une application web, sans TypeScript ni framework serveur. Routage par fragment et paramètres de sélection ; liens standards avec historique navigateur. Style de surfaces sombres, hiérarchie visuelle, formulaires nommés, focus visible, dialogues clavier et disposition responsive. Aucune police/CDN externe.
2. **`src/api.js`** : frontière HTTP injectée seulement pour tests ; sessions cookie, CSRF mémoire, états session réactifs via `useSyncExternalStore`. Abort + génération commune à toutes les opérations et transitions ; erreurs expurgées/françaises. Pas de cache persistant.
3. **`src/useResource.js`** : états lecture par ressource/filtre/révision, annulation à chaque changement et garde active indépendante de la coopération du transport. Effacement des données obsolètes plutôt que maintien trompeur pendant une nouvelle lecture.
4. **`src/components.jsx`** : tableaux métier avec clés camelCase/SQL MAJUSCULES, recherche/pagination, formulaires de commandes, confirmations qui montrent valeurs et conséquences. Pas d’éditeur JSON brut. Révision de lectures après succès, sans mutation optimiste. Les contrôles HTML complètent les validations serveur.
5. **`src/commands.js`, `src/pages.jsx`, `src/Stats.jsx`** : catalogue explicite méthode/chemin/champs/effets. Le métier reste dans Feezit ; ni règle de classement, ni attribution, ni échéance reconstruite depuis une donnée absente.

## Évolution JR-04 — candidat 0.3.0

- `Table` rend le texte littéralement par défaut. Le troisième élément d’une colonne désigne explicitement `status`, `date` ou `boolean` ; aucun format n’est inféré depuis le texte d’un code ou d’une référence. Le dictionnaire des statuts ne lit que ses propriétés propres.
- La navigation accepte seulement les paramètres UUID uniques `ownerId`/`promoId` conformes, sans trim ni réparation. Les huit routes restent privées. Recherche de compte par le répertoire management ; pas d’annuaire public ni filtre propriétaire fictif pour les offres.
- `usePromoEditor` centralise le cycle PUT → GET de vérification, sans centraliser les brouillons : chaque formulaire a son état indépendant, version d’édition, annulation et résultat partiel. Une lecture commencée avant la mutation est annulée ; une lecture de révision pendant la mutation ne peut écraser son résultat. Un PUT accepté suivi d’un GET échoué bloque sa répétition et propose exclusivement GET via Relire. Une nouvelle saisie n’est pas remplacée par la réponse de vérification.
- `PromoDetails` sépare le DTO Promo et la projection management de participation. Aucune date d’accord déduite ; l’erreur de participation ne bloque pas les champs de contenu. Destination et contenu ont des confirmations/payloads distincts, les invariants restant propriétaires de Feezit.
- Les totaux dashboard utilisent `Page.total`, jamais `items.length`. Outbox utilise `outbox-page`, pagination serveur sans paramètre q. Le moniteur email reste un tableau limité100, clairement indiqué. `operations-status` montre la configuration, pas le succès d’un fournisseur/job.
- `scripts/jury-browser.py` lance Vite sur port loopback éphémère et arrête navigateur/processus en `finally`. `playwright.jury.config.js` sélectionne uniquement les tests HTTP interceptés ; la recette vrais serveurs ne peut pas être importée implicitement. `jury-final.py` compare les SHA des sources/tests/configurations avant/après les gates et refuse tout succès si elles changent.

Preuves JR-04 : `docs/evidence/jury-release/` ; rapport de sous-lot `../jury-release-20261013/implementation-office-frontend.md`. Le récapitulatif suivant décrit aussi le socle historique, pas une nouvelle validation de production.

## Bannière indépendante — candidat du 15 octobre 2026

`PromoContentEditor` conserve le DTO confirmé et la génération commune ; il utilise `description` avec la seule clé `articleDescription`. `PromoBannerEditor` réutilise `usePromoEditor` pour `banner`, avec sa propre saisie, confirmation, état partiel et vérification privée JSON supplémentaire. La projection image n’est appliquée qu’après relecture Promo + JSON privé réussie et génération toujours actuelle. Le PUT `content` historique n’est pas modifié dans ce frontend et n’est plus utilisé par l’éditeur.

Le FileReader est une frontière asynchrone locale protégée par version ; choisir une nouvelle URL/un autre fichier ou démonter le formulaire invalide les lectures précédentes. Une nouvelle sélection après acceptation partielle survit à Relire. Aucune Data URL de saisie n’est envoyée comme URL serveur : uniquement les octets Base64 et le MIME PNG/JPEG. Les Data URL autorisées au rendu proviennent du fichier local contrôlé ou du JSON authentifié ; une URL utilisateur `data:` reste refusée. Les aperçus d’import ne sollicitent jamais la route publique éventuellement masquée. Le parent doit vérifier `img-src data:` sur la CSP réellement livrée.

Les tests historiques sont conservés et adaptés aux routes/formulaires désormais séparés, sans retrait des scénarios de fraîcheur/erreur/session. Les nouvelles preuves TDD et gates se trouvent dans `../continuous-banner-20261015/feature/office-frontend/` ; elles ne prouvent ni intégration réelle des backends, ni production.

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

Limites JR-04 : aucun transport email ni identifiant réel utilisé, pas de mutation réelle de backend par cette sous-tâche, pas de certification sécurité/accessibilité. L’intégration de ce candidat avec les vrais backends isolés reste à mener par le parent ; les intégrations 0.1/0.2 documentées dans le README sont des preuves historiques distinctes. Le contrat de lecture incidents ne donne actuellement aucun type ou ouverture propre dans le schéma existant ; `null` reste `—`.
