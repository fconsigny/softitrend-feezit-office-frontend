# Feezit Office — Frontend

Dashboard interne **JavaScript / React, en français**, réservé à **François seul**. Pas d’inscription, d’équipe, de SSO ni de compte par défaut. Aucun jeu de données simulé dans l’application ; toutes les lectures et mutations utilisent le backend Office.

## Démarrer localement

Pré requis : Bun, backend Office configuré et démarré sur `127.0.0.1:8091`, backend Feezit raccordé par Office. Les identifiants opérateur et le secret management se configurent **uniquement côté serveur**, jamais dans une variable `VITE_*`. Ne pas utiliser d’identité réelle pour les tests.

```sh
export PATH="$HOME/.local/bin:$PATH"
bun install --frozen-lockfile
bun --bun run dev
```

Frontend : `http://127.0.0.1:3011`, loopback strict, proxy `/office-api` vers `http://127.0.0.1:8091`. Ces paramètres concernent le développement isolé ; le déploiement Docker/HTTPS distinct est documenté en fin de fichier. Une erreur 502 sans backend n’ouvre pas la vue privée et ne crée pas de données de remplacement.

```sh
bun --bun run build
bun --bun run preview
```

Le serveur de preview hérite du proxy local. Il ne constitue pas un hébergement de production. Le build produit `dist/`, ignoré par Git. La configuration de livraison HTTPS, cookies et reverse proxy a été validée séparément le 12 octobre 2026 ; ne pas exposer ce serveur de preview en production.

## Écrans et commandes disponibles

- **Tableau de bord** : raccourcis opérationnels, procédures et états réels des notifications. Aucun KPI global ni classement déduit.
- **Comptes** : recherche/pagination serveur, profils publics/masqués/absents et bannissement. Un compte sans profil n’est pas présenté comme supprimé.
- **Offres et réservations** : offres incluant brouillons/masquages ; réservation avec UUID propriétaire, marque et code inchangés, article/catégorie/destination, accord reçu UTC, référence et version des documents. Réservation ≠ publication.
- **Marques** : référentiel et fusion d’alias, avec confirmation des conséquences.
- **Attente** : consultation par marque, inscription et réponse favorable horodatée. Aucun rang d’ancienneté et aucune attribution automatique.
- **Modération** : incidents, lecture du dossier, signalement, résolution, retrait pour fraude **établie** avec motif/référence/confirmation explicite, masquage/levée, bannissement/levée et création d’un nouveau profil. Toutes les transitions sensibles montrent les valeurs exactes et leurs conséquences avant confirmation.
- **Statistiques** : compte/période ISO, quotidien et totaux de période des seules visites profil et sorties promotionnelles. Source réelle, UTC, maximum 366 jours. Pas de revenus, conversions ou visiteurs uniques déduits.
- **Notifications** : outbox `pending` distincte de `sent`, lecture des émissions attestées côté Feezit ; confirmation manuelle indisponible (garde Feezit 409), suivi `email-deliveries`, résultat incertain distinct d’un envoi. Jobs au temps serveur avec confirmation des possibles suppressions ; pas de simulation.

## Contenu des offres — version 0.2.0 livrée le 12 octobre 2026

La réservation propose une **description facultative (2 000 caractères maximum)** et une **image facultative par URL HTTP(S)**, transmises à `POST /office-api/management/reservations` ; une réservation reste un brouillon. La liste affiche les deux valeurs textuelles et propose **Modifier le contenu**. `#/offres?promoId=UUID` charge l’offre complète via `GET /office-api/management/promos/{UUID}`, y compris une offre masquée ou en brouillon.

L’éditeur préremplit ces deux champs. Après confirmation, `PUT /office-api/management/promos/{UUID}/content` envoie **uniquement** `{articleDescription, articleImage}`, deux chaînes explicites ; une chaîne vide efface le champ correspondant. L’édition ne publie pas, ne lève aucune modération et ne modifie ni code, marque ou dates. Le succès exige le PUT accepté puis la relecture du détail ; les listes sont ensuite actualisées. Un refus garde le brouillon et le contenu serveur affiché. Les rafraîchissements indépendants conservent le brouillon dirty ; changer d’offre ou de session le réinitialise. Les lectures et mutations tardives sont annulées/ignorées.

Les descriptions sont rendues comme texte React, jamais HTML. Les aperçus n’acceptent que les URL absolues HTTP(S), sans identifiants embarqués, avec `referrerPolicy="no-referrer"`, dimensions maximales 320 × 240 px et repli explicite en cas d’échec. L’URL reste visible dans la liste/détail même sans aperçu. Le chargement d’une image tierce demeure une requête vers son hébergeur ; HTTP peut être refusé comme contenu mixte sous HTTPS. `nginx.conf` ne définit pas de CSP : le vhost Apache de livraison doit autoriser les images externes **via `img-src` uniquement**, sans élargir script/style/connect. Cette configuration a été activée par le parent lors de la livraison 0.2.0 ; configtest/reload Apache et en-tête public CSP relus, sans élargir script/connect.

Preuves locales : `docs/evidence/promo-content-verification.json`, logs `promo-content-*.txt`, capture `promo-content-mobile-synthetic.png`. Les nouvelles tranches création, préremplissage/édition, aperçu, validation HTTP(S) et aperçu de création ont chacune un rouge observé puis un vert. Les régressions couvrent également effacement, erreurs PUT/relecture, confirmations annulées, brouillon dirty, changements de sélection/session, réponses tardives et six URL non sûres. Le parcours Chromium charge une image synthétique interceptée, vérifie l’absence de Referer, ses dimensions et le repli avec URL longue. Ces tests ne prouvent pas l’intégration réelle des nouveaux endpoints : le parent la vérifie séparément avec les backends isolés. Scripts publics/anonymes inchangés ; aucune connexion ni mutation de production, aucun commit/push.

## Session et asynchronisme

Cookie de session géré par le serveur. CSRF `{headerName,token}` conservé en mémoire, login URL encoded, renouvellement CSRF après login/logout. Aucun identifiant, mot de passe, token ou secret management dans `localStorage`/`sessionStorage`.

Une génération de session et des `AbortController` empêchent les anciennes lectures, mutations ou réponses 401 de republier des données après déconnexion ou changement de session. Chaque sélection/filtre a également son annulation et sa garde de publication. Logout efface immédiatement les données UI ; un échec serveur est signalé explicitement. Les succès ne sont affichés qu’après réponse serveur, puis les lectures visibles sont renouvelées. Un brouillon de formulaire n’est effacé qu’après succès ou sortie de page/session.

Les permissions et invariants métier restent contrôlés par le serveur : les confirmations UI ne les remplacent pas. Les erreurs sont françaises et n’affichent ni corps externe brut ni URL/secret upstream.

## Vérification exécutée

```sh
bun --bun run test
bun --bun x playwright install chromium
bun --bun run test:browser
bun --bun run lint
bun --bun run build
bun audit
# Rejoue installation verrouillée, tests, navigateur, lint, build, audit :
python3 scripts/verify.py
```

Bun permet ici l’exécution sans `node` ni `npm`. Dépendances exactes et `bun.lock` fournis. Vitest/Testing Library : **64 tests fonctionnels**, composants React réels, seul transport HTTP simulé. Playwright Chromium : **4 parcours**, desktop et mobile, navigation des huit écrans, formulaires natifs, édition de contenu et aperçu d’image externe, absence de débordement global et d’erreurs JS ; HTTP intercepté **uniquement dans les tests**. Ces suites seules ne prouvent pas l’intégration aux backends ; la recette réelle décrite ci-dessous la vérifie séparément.

Les premiers outils épinglés ont révélé des vulnérabilités à l’audit : Vite/Vitest/plugin React ont été mis à jour, les tests/build rejoués et l’audit final est conservé. Logs : `docs/evidence/verification.txt`. Captures desktop/mobile : `docs/evidence/*-synthetic.png`, explicitement **synthétiques**, jamais preuve de données de production. Les traces des phases rouges sont résumées dans `docs/evidence/tdd-red.txt`.

### Intégration réelle vérifiée par le parent — 10 octobre 2026

`python3 ../softitrend-feezit-office-backend/scripts/integration-isolated.py` : **61 contrôles HTTP et un parcours Chromium réussis**, sans mocks HTTP. Vrais jars Feezit (H2 jetable, jobs et fournisseur email désactivés) et Office, Vite loopback, données synthétiques. Connexion/session/CSRF, huit écrans, statistiques réelles avec source, attente/réponse, réservation en brouillon, conflit et logout. Tous les enfants sont arrêtés, puis H2 supprimée.

Régression 202 sans corps du signalement : rouge puis vert côté Office, recette réelle réussie. Confirmation manuelle : refus 409 Feezit conservé, aucune mutation outbox ; formulaire retiré après test UI rouge, état pending jamais présenté comme envoyé. Le garde legacy reste inchangé.

Preuves : `../softitrend-feezit-office-backend/docs/parent-verification.json`, `docs/evidence/parent-verification.txt`, capture `docs/evidence/real-servers-synthetic.png`. Les suites propriétaire passent également sur PostgreSQL **jetable**, jamais la production. Recontrôle indépendant final **approuvé**, sans défaut bloquant. Ses deux suggestions ont été intégrées : trois régressions HTTP négatives côté Office et vérification notice/absence Attester dans Chromium ; dernière vraie recette réussie.

## Références et limites

Contrat autoritatif : `../softitrend-feezit-office-backend/docs/office-api-contract.md`, complété par `../softitrend-feezit-backend/docs/api-contract.md` et les DTO/controllers lus. Notes Office et participation sous Obsidian consultées ; cadrage et suivi Office actualisés par le parent. Architecture et matrice locale : `docs/architecture.md`.

- Le répertoire des incidents peut fournir `kind` et `openedAt` à `null` ; affichage `—`, aucun type/date/compte à rebours inventé.
- Pagination serveur pour comptes/offres/incidents ; recherche et pagination locales pour les routes historiques qui renvoient des tableaux entiers. Cela ne réduit pas la taille de ces réponses côté backend.
- Pas d’import ni composition/envoi email, d’export, de paiement, de métrique sociale, d’audit nominatif durable ou de restauration automatique de contenu supprimé.
- L’attestation ne prouve ni fraude, ni accord original, ni réception email ; l’opérateur conserve/examine les preuves par son circuit externe.
- Une requête annulée dans le navigateur peut avoir déjà été traitée côté serveur : relire avant de réessayer une mutation incertaine. Aucun retry automatique destructif.
- Responsive vérifié sur Chromium ; pas d’audit d’accessibilité exhaustif ni de test multi-navigateurs revendiqué.

Aucun secret réel dans les sources ou captures, aucun commit/push. Le parent a raccordé les deux backends et mis à jour les notes Office ; les tests isolés sont distincts de la livraison production autorisée ci-dessous.

## Production actuelle — 0.2.0, vérifiée le 12 octobre 2026

Release actuelle `20261012T232115Z-office`, contenu description/image livré et CSP adaptée active. **24 contrôles HTTP publics** et deux vues Chromium publiques réussis, sans mutation métier ; vraie intégration isolée contenu : 79 HTTP + 1 Chromium réussie. Versions 0.2.0 des deux `package.json` relues, images/sources conformes, PostgreSQL V14 pour le Creator Studio livré simultanément. Preuves : `../production/evidence/office-production-verification.json`, `studio-release-verification.json` et `office-public-browser.json`. Le bilan ci-dessous est la livraison initiale historique.

## Production initiale livrée et vérifiée — 12 octobre 2026

`https://office.feezit.softitrend.com`, même serveur que Feezit. Frontend statique Nginx non-root sur **127.0.0.1:9009**, backend Office sur **127.0.0.1:8089**, projet Compose Office distinct. Apache route `/office-api/` avant le catch-all frontend et termine le TLS avec certificat spécifique. Aucune variable frontend ne contient de secret ; la session reste same-origin.

**23 contrôles HTTP publics réussis**, dont authentification réelle/CSRF/logout et lectures management ; **2 vues Chromium anonymes desktop/mobile** réussies, formulaire réellement hydraté, sans débordement ni erreur JS/CSP. Aucun mot de passe saisi dans le navigateur, mutation métier ou email effectué par ces tests de production. Recette publique anonyme rejouable : `OFFICE_PUBLIC_EVIDENCE=/chemin/prive/hors-depot bun --bun scripts/smoke-public.mjs`.

Livraison, provisioning opérateur privé, sauvegarde, renouvellement HTTPS testé, preuves et cadre du rollback : `../office-production/README.md` dans le workspace Feezit et note Obsidian `Feezit/Office/feezit-office-deploiement-2026-10-12.md`.
