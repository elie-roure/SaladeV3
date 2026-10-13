# Salade — contexte de reprise pour une autre IA

Dernière mise à jour : 13 octobre 2026.
Ce document accompagne le code du projet ; il ne remplace pas les sources.
Lire également [README.md](./README.md) pour les procédures détaillées.

## 1. Objectif et choix actuels de l'utilisateur

Salade est une application web en français pour organiser des tournois de
badminton en doubles à partenaires tournants.

Le but est de jouer **avec et contre un maximum de personnes différentes** :
les équipes sont recomposées après chaque manche chronométrée.
Ce n'est pas un tableau d'élimination ni un championnat avec équipes fixes.

Choix confirmés par l'utilisateur :

- Application web utilisable sur ordinateur et téléphone.
- Classement individuel à la **moyenne des points marqués par match**, pour
  tenir compte des pauses.
- Utilisation **locale simple dans un premier temps**, par un organisateur,
  sans compte ni PostgreSQL ; sauvegarde dans le navigateur.
- Utilisation de frameworks souhaitée : Vue 3, TypeScript et Vite.
- Nom définitif : **Salade**, anciennement « Volant ».
- Tableau récapitulant les partenaires et adversaires de chaque joueur.
- Cartes de terrains avec un véritable tracé de badminton réalisé en CSS.

Une version privée avec Node.js, PostgreSQL et comptes sur invitation a déjà
été développée pour une éventuelle publication future. **Ne pas la supprimer,
mais ne pas imposer sa configuration pour utiliser le mode local.**

Heroku a été envisagé, puis l'utilisateur a demandé des options gratuites.
Render + Neon a été proposé, sans déploiement ni engagement de l'utilisateur.
La décision la plus récente est de rester en local pour commencer.

## 2. État du projet

- Projet Vue fonctionnel, interface responsive.
- Mode local explicite via `npm run dev:local`.
- Dockerisation du mode local : `docker compose up --build -d`, adresse
  `http://127.0.0.1:5173/`. Build Vue dans une étape Node 22, serveur statique
  Nginx sans privilèges dans l'image finale. Aucun PostgreSQL ou compte requis.
- Fichiers Docker : `Dockerfile`, `.dockerignore`, `compose.yaml`,
  `docker/nginx.conf`. Les données restent dans le navigateur, pas dans Docker.
- `npm run build:local` compile le mode local ; `npm run test:e2e:local-build`
  vérifie le build statique avec les parcours bureau/mobile existants.
- Docker n'était pas disponible sur le poste de développement lors de l'ajout :
  la construction et l'exécution réelles de l'image restent à vérifier avec
  Docker Desktop. Ne pas présenter les tests du build statique comme des tests
  du conteneur ou de la configuration Nginx.
- Mode privé conservé, avec serveur Express et PostgreSQL.
- Aucun service de production provisionné ou déployé pendant ce travail.
- Aucun compte administrateur réel créé par l'assistant.
- Pas de serveur PostgreSQL externe configuré pour les validations.
- Le dossier n'était pas un dépôt Git lors de la dernière vérification :
  ne pas supposer qu'il existe une branche, un remote ou des commits.
- L'ancien prototype HTML autonome n'est plus la source de développement :
  continuer dans ce projet Vue.

Le poste d'origine utilise Windows et PowerShell. Son dossier de travail était
`C:\Disque_D_Virtuel\GitLab\Projet\Salade`, mais **le chemin sur le nouveau PC
peut être différent**. Les liens internes de ce document sont relatifs.

## 3. Démarrage sur un nouveau PC : mode recommandé

Installer **Node.js 22**, au minimum 22.22.2 ; version testée : 22.23.3.
Depuis la racine du projet :

```powershell
npm.cmd ci
npm.cmd run dev:local
```

Sur Linux/macOS, utiliser `npm` au lieu de `npm.cmd`.

Ouvrir **http://127.0.0.1:5173/**. Garder le terminal ouvert ; Ctrl+C arrête
le serveur. Relancer la même commande pour reprendre.

Ce mode :

- ne nécessite ni fichier `.env`, ni compte, ni serveur API, ni PostgreSQL ;
- sert Vue avec Vite, en mode `local-only` ;
- force explicitement `VITE_LOCAL_ONLY` à `true` via la configuration Vite ;
- écoute seulement sur `127.0.0.1` ;
- garde le port 5173 et refuse de choisir un autre port s'il est occupé.

**Attention aux commandes :**

- `npm run dev:local` = application locale sans compte ;
- `npm run dev` = interface privée, exigeant l'API pour fonctionner ;
- `npm start` = serveur Node avec PostgreSQL, pas le mode local simple ;
- `npm run build` = build normal privé, pas un build local sans compte.
- `npm run build:local` = build statique sans compte destiné à Docker.

Une version portable de Node se trouvait dans `.tools` sur le PC d'origine.
Ce dossier est ignoré par Git et n'est pas garanti sur le nouveau PC.
Installer Node normalement plutôt que supposer sa présence.

## 4. Sauvegardes : préserver impérativement la compatibilité

Le mode local utilise **une seule sauvegarde de tournoi courant** dans
`localStorage`, avec la clé historique :

```text
volant.tournament.v1
```

Cette clé est volontairement conservée malgré le renommage en Salade.
**Ne pas la renommer sans migration**, sinon les tournois sembleraient perdus.

- Le format JSON est `version: 1`.
- Les exports s'appellent maintenant `salade-AAAA-MM-JJ.json`.
- Les anciens exports de Volant et du prototype HTML restent compatibles.
- Les imports sont validés avant remplacement ; taille maximale : 2 Mo.
- Les tournois ne sont pas transférés par la simple copie des sources.
- Le stockage dépend du navigateur et de l'origine (hôte, protocole et port).
  `localhost:5173` et `127.0.0.1:5173` ont des stockages différents.
- La navigation privée ou la suppression des données du navigateur peut
  supprimer la sauvegarde.

Pour déplacer un tournoi vers le nouveau PC : **exporter le JSON depuis
l'ancien navigateur**, transférer ce fichier séparément puis l'importer sur
le nouveau PC. Ne pas demander à l'utilisateur de communiquer à une IA des
données de joueurs dont elle n'a pas besoin.

## 5. Règles métier exactes

### Configuration

- Entre 4 et 128 joueurs ; noms non vides et distincts, comparaison
  insensible à la casse ; 80 caractères maximum par nom.
- De 1 à 32 terrains, avec 4 joueurs disponibles par terrain.
- De 1 à 100 manches.
- Durée de 0,1 à 180 minutes par manche (6 à 10 800 secondes).
- Les joueurs non affectés à un terrain sont au repos.

### Chrono et scores

- Un chrono commun à tous les terrains de la manche.
- Démarrage, pause/reprise et réinitialisation.
- Échéance absolue pour résister au rechargement et aux timers du navigateur
  ralentis en arrière-plan.
- À zéro, l'organisateur arrête les échanges et saisit les scores.
- Pas de rotation automatique à l'expiration du chrono.
- Scores entiers positifs ou nuls ; **pas de plafond à 21** :
  5–25 et 125–0 sont valides.
- Limite numérique technique : `floor(Number.MAX_SAFE_INTEGER / 400)`.
- Les deux scores de chaque terrain sont nécessaires pour passer à la suite.
- Le chrono doit être arrêté ou en pause pour avancer.
- Après la dernière manche, l'action termine le tournoi.
- Les scores restent corrigeables après la fin.
- Les scores des manches passées ne peuvent pas être effacés : une valeur
  complète reste nécessaire pour préserver la cohérence de la sauvegarde.

### Rotation

Le moteur cherche la diversité, sans prétendre garantir un optimum global :

1. Priorité aux joueurs ayant le moins joué pour équilibrer les pauses.
2. Mélange des joueurs à égalité de participation.
3. Évaluation d'au plus 500 compositions.
4. Pénalisation des partenaires déjà rencontrés, puis des adversaires répétés.
5. Conservation de la meilleure composition trouvée.

Les rencontres sont comptées par paires de joueurs. Un adversaire rencontré
deux fois compte deux confrontations, même si son partenaire change.
Les répétitions sont signalées dans l'interface.
Le moteur tient compte des affectations des manches pour les rotations ;
le classement et le récapitulatif n'utilisent que les matchs complets.

**Ne pas promettre un nouveau partenaire et deux adversaires inédits à chaque
manche : cela dépend de l'effectif, des pauses et du nombre de manches.**

### Classement

- Chaque joueur reçoit les points de son équipe.
- Critère principal : points marqués / matchs joués.
- Départage : différence de points / matchs joués.
- Ex aequo conservés si les deux critères sont égaux.
- Les joueurs sans match complet n'ont pas encore de rang.
- Un seul score saisi ne suffit pas pour compter le match.

### Récapitulatif

Tableau « Avec qui et contre qui ? », sur tout le tournoi :

- une ligne par joueur, y compris ceux qui n'ont pas joué ;
- nombre de matchs complets ;
- partenaires et adversaires, triés par nom, avec compteurs `1×`, `2×`, etc. ;
- une personne peut figurer dans les deux catégories ;
- mise à jour immédiate après saisie ou correction d'un score ;
- suppression du match du récapitulatif si un score de la dernière manche
  est effacé ;
- tableau défilable horizontalement sur petit écran.

### Cartes de terrain

[MatchCard.vue](./src/components/MatchCard.vue) dessine un terrain avec du CSS
scopé, sans image externe ni SVG :

- proportions 13,40 × 6,10 m ;
- lignes de simple (largeur 5,18 m), double et services ;
- filet central et poteaux ;
- quatre pastilles d'initiales, couleurs distinctes par équipe ;
- noms complets, champs de score et labels sous le terrain.

Le dessin est décoratif (`aria-hidden`) ; les noms et contrôles restent
accessibles séparément. Les pastilles ne fixent pas la position réelle des
joueurs. Conserver la lisibilité et la saisie au clavier sur mobile et bureau.

## 6. Architecture et fichiers à lire

| Fichier / dossier | Rôle |
|---|---|
| [package.json](./package.json) et [package-lock.json](./package-lock.json) | Scripts, dépendances et versions verrouillées |
| [src/main.ts](./src/main.ts) | Monte le composant racine |
| [src/Root.vue](./src/Root.vue) | Choix local/privé, connexion, liste partagée, administration et navigation |
| [src/App.vue](./src/App.vue) | Interface du tournoi |
| [src/domain/tournament.ts](./src/domain/tournament.ts) | Types, rotation, classement, récapitulatif, validation des imports |
| [src/composables/useTournament.ts](./src/composables/useTournament.ts) | État Vue, chrono et persistance locale/distante |
| [src/services/api.ts](./src/services/api.ts) | Client API, validation des réponses |
| [src/components](./src/components) | Formulaire, cartes, chrono, classement, récapitulatif, connexion |
| [src/style.css](./src/style.css) | Styles globaux ; terrain en CSS scopé dans la carte |
| [server/app.ts](./server/app.ts) | API Express, sessions, autorisations, invitations et tournois |
| [server/database.ts](./server/database.ts) | Connexion PostgreSQL et schéma |
| [server/crypto.ts](./server/crypto.ts) | Hachage des mots de passe et jetons |
| [server/bootstrap.ts](./server/bootstrap.ts) | Initialisation/récupération administrateur |
| [server/config.ts](./server/config.ts) | Validation de l'environnement serveur |
| [vite.config.ts](./vite.config.ts) | Plugin Vue, mode local, proxy API et Vitest |
| [Procfile](./Procfile) | Processus release et web Heroku |
| [.env.example](./.env.example) | Paramètres fictifs de configuration, sans secrets réels |

Modèle principal :

```text
Tournament
  version: 1
  players: string[]
  courts: number
  duration: number (secondes)
  totalRounds: number
  rounds:
    matches:
      teams: [[idJoueur, idJoueur], [idJoueur, idJoueur]]
      score: [number | null, number | null]
    bench: idJoueur[]
  finished: boolean
  timer:
    remaining: number (millisecondes)
    deadline: timestamp (millisecondes) | null
```

Les identifiants de joueurs sont des indices dans `players`, pas des noms.
Le serveur réutilise la validation du domaine : ne pas dupliquer les règles.

## 7. Version privée existante — pour plus tard

Stack : Express 5, `pg`, PostgreSQL, Helmet, `tsx` ; TypeScript strict.

- Connexion e-mail/mot de passe, pas d'inscription publique.
- Administrateur initial via `npm run admin:init`.
- Invitations et réinitialisations via liens privés, 48 h, usage unique.
- Liens transmis manuellement, pas d'envoi automatique d'e-mails.
- Rôles `admin` et `organizer` ; tous les organisateurs accèdent à tous les
  tournois. Pas de séparation par club, pas de rôles spectateur.
- Désactivation/réactivation des organisateurs.
- Récupération administrateur côté opérateur via `npm run admin:reset`.
- Sessions de 7 jours en base ; cookie HttpOnly, SameSite Strict et Secure
  en production ; jetons stockés hachés en base.
- Mots de passe de 12 à 128 caractères, hachés avec scrypt et sel aléatoire.
- Vérification d'origine et en-tête de requête pour les mutations.
- Limitation des tentatives d'authentification stockée en PostgreSQL.
- HTTPS requis en production ; vérification TLS PostgreSQL active.
- Aucune donnée persistante conservée sur le disque éphémère de Heroku.

Les noms internes historiques `volant_session` et `X-Volant-Request` restent
utilisés. Ils ne constituent pas la marque visible ; les renommer exigerait
de synchroniser serveur, client et tests.

API principale :

```text
GET  /api/health
GET  /api/session
POST /api/login
POST /api/logout
POST /api/accept-invitation
GET  /api/users                    (administrateur)
PATCH /api/users/:id               (administrateur)
POST /api/invitations              (administrateur)
GET  /api/tournaments
POST /api/tournaments
GET  /api/tournaments/:id
PUT  /api/tournaments/:id
```

Les tournois partagés ont `id`, `name`, `data`, `revision`, `updated_at`.
Les écritures exigent la révision actuelle. Une révision périmée renvoie 409.
Les écritures de l'écran sont mises en file ; après une erreur elles sont
suspendues, avec un message explicite et possibilité d'export.
La navigation attend les écritures en cours.

**Pas de temps réel** : les autres appareils doivent recharger explicitement.
Ne pas présenter l'application comme ayant déjà une synchronisation WebSocket.

Configuration requise pour cette version : `DATABASE_URL`, `APP_ORIGIN`,
`PORT`, `NODE_ENV`, `ADMIN_EMAIL` pour les scripts opérateur, éventuellement
`PG_CA_CERT`. Voir le README, sans copier des identifiants réels dans ce fichier.

## 8. Validation et tests

Commandes :

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:e2e:private
```

- Vitest + Vue Test Utils + jsdom pour les composants.
- Tests API avec Supertest et PGlite : véritable moteur PostgreSQL embarqué
  en mémoire, pas une simulation des requêtes.
- Playwright avec Microsoft Edge installé, bureau et viewport mobile.
- `test:e2e` démarre le mode local sur 5174.
- `test:e2e:private` compile puis lance le serveur privé isolé de test sur
  3001, avec données fictives ; aucune base de production nécessaire.
- Les tests serveur embarqué ne valident pas le réseau/TLS d'un fournisseur
  PostgreSQL externe.
- Le build vérifie les types Vue et serveur, puis compile Vite.

Derniers résultats constatés pendant le développement :

- Suite complète : **55 tests** réussis avant les derniers changements visuels.
- Parcours privés : **2 tests** bureau/mobile réussis.
- Après renommage et tracé CSS : **13 tests App**, **2 parcours locaux**
  bureau/mobile et build strict réussis.
- Les parcours locaux vérifient aussi le titre Salade, l'export renommé,
  le terrain, ses quatre pastilles, son filet et ses proportions.
- La carte CSS a été inspectée visuellement dans le navigateur intégré.
- Après dockerisation : build local strict et **2 parcours sur le build
  statique** bureau/mobile réussis. Docker absent sur le poste : image et
  démarrage du conteneur non vérifiés.

Ces résultats sont historiques, pas une garantie sur le nouveau PC :
relancer les vérifications après toute modification. Les tests navigateur
exigent Edge ; adapter proprement la configuration si cet outil manque.
Ne pas supposer les tests exécutés simplement parce que l'interface s'affiche.

## 9. Limites et points de vigilance

- Mode local : un tournoi courant par navigateur ; pas une bibliothèque locale
  multi-tournois, pas de synchronisation entre onglets ou appareils.
- Mode privé : partage avec conflits explicites, pas fusion automatique.
- Rotation heuristique, pas calendrier mathématiquement optimal.
- Pas d'application mobile native, pas de PWA/offline installable configurée.
- Le serveur externe et son déploiement/TLS restent à valider réellement.
- Comptes et PostgreSQL déjà développés ne signifient pas que l'application
  est publiée ni que la base est provisionnée.
- Préserver les anciens exports, la clé locale et les données utilisateur.
- Ne pas effacer de fichiers ou de données existantes pour « repartir propre ».
- Ne pas ajouter de limites à 21 points, ni transformer le classement en
  nombre de victoires sans décision de l'utilisateur.
- Conserver Vue et TypeScript ; ne pas repartir sur un HTML monolithique.

## 10. Transfert du projet

Transmettre ce fichier **avec les sources**, notamment :

- `src`, `server`, `e2e`, `e2e-private` ;
- `package.json`, `package-lock.json`, `index.html` ;
- configurations TypeScript, Vite, Playwright ;
- `Dockerfile`, `.dockerignore`, `compose.yaml`, dossier `docker` ;
- `README.md`, `Procfile`, `.gitignore`, `.env.example`.

Inutile de transférer `node_modules`, `dist`, `test-results`,
`playwright-report` et `.tools` : ce sont des dépendances, sorties ou outils
locaux recréables. Ne pas inclure `.env`, des mots de passe, liens d'invitation,
cookies, chaînes de connexion réelles ou exports de joueurs dans un contexte
destiné à une IA. Transférer les sauvegardes personnelles séparément si besoin.

### Message de reprise suggéré

> Tu reprends le projet Salade. Lis CONTEXTE_PROJET.md et README.md, puis les
> fichiers pertinents avant de modifier le code. Le choix actuel est le mode
> local sans compte ni PostgreSQL via npm run dev:local. Préserve la version
> privée déjà développée et la compatibilité des sauvegardes historiques.
> La prochaine demande fonctionnelle te sera fournie par l'utilisateur.
