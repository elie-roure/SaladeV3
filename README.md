# Salade

Tournois de badminton en doubles à partenaires tournants.
Vue 3, TypeScript, Vite, serveur Express et PostgreSQL.
Le mode de publication est **privé par défaut**, sans inscription publique.
Pour une utilisation simple sur votre ordinateur, utiliser le mode local ci-dessous.

## Docker : transporter le mode local sur un autre PC

Installer [Docker Desktop](https://www.docker.com/products/docker-desktop/) et
utiliser les conteneurs Linux (sur Windows, activer le moteur WSL 2).
Depuis la racine du projet :

```powershell
docker compose up --build -d
docker compose ps
```

Ouvrir **http://127.0.0.1:5173/**. Node.js n'est pas nécessaire sur le PC :
l'image compile Vue puis sert le build local avec Nginx, sans serveur API,
compte ou PostgreSQL. Nginx tourne sans privilèges administrateur.
Le port est accessible uniquement depuis le PC, pas depuis le réseau.

Si Vite utilise déjà le port 5173, l'arrêter dans son terminal avec Ctrl+C
avant de lancer Docker. Ne pas changer le port ou remplacer `127.0.0.1`
par `localhost` si vous voulez retrouver la sauvegarde de cette origine.

```powershell
docker compose logs --tail 100 salade
docker compose stop
docker compose start
```

Pour retirer le conteneur sans supprimer les sauvegardes du navigateur :

```powershell
docker compose down
```

**Les données restent dans le navigateur, pas dans un volume Docker.**
Exporter le tournoi JSON avant de changer de PC, puis l'importer sur le
nouveau. Relancer ou recréer le conteneur ne transfère pas le tournoi.

Pour construire sur un autre PC, copier les sources et les fichiers de
configuration, notamment `Dockerfile`, `.dockerignore`, `compose.yaml` et
`docker/nginx.conf`, puis exécuter `docker compose up --build -d`.
Ne pas copier `node_modules`, `.tools`, `dist` ni les fichiers `.env`.
Le premier build nécessite Internet pour télécharger les images et dépendances.

On peut aussi transférer l'image déjà construite sans reconstruire :

```powershell
docker image save -o salade-local.tar salade:local
```

Sur l'autre PC, avec une architecture compatible et le fichier `compose.yaml` :

```powershell
docker image load -i salade-local.tar
docker compose up --no-build -d
```

Cette image est **uniquement destinée au mode local**. La version privée
Node.js/PostgreSQL reste dans les sources, mais n'est pas lancée par ce Compose.
Ne pas publier cette image en pensant qu'elle demande une authentification.
`npm run build` conserve le mode privé ; `npm run build:local` produit
explicitement le build sans compte utilisé par Docker.

Le build local servi statiquement est testé par :

```powershell
npm.cmd run test:e2e:local-build
```

## Démarrage simple : sans compte ni PostgreSQL

Depuis le dossier du projet, avec Node.js 22.22.2 ou supérieur dans la branche 22 :

```powershell
npm.cmd ci
npm.cmd run dev:local
```

Les dépendances sont déjà installées sur cette machine. Si Node n'est pas dans
le PATH, utiliser la version portable avant de lancer l'application :

```powershell
$env:PATH = "$PWD\.tools\node-v22.23.3-win-x64;$env:PATH"
npm.cmd run dev:local
```

Ouvrir **http://127.0.0.1:5173**. Aucun fichier `.env`, serveur API, compte
ou base PostgreSQL n'est nécessaire. Laisser le terminal ouvert ; Ctrl+C
arrête le serveur. Relancer la même commande pour reprendre plus tard.

Le tournoi est sauvegardé dans ce navigateur, sur cette adresse. Utiliser
toujours le même navigateur et la même adresse (pas `localhost` à la place
de `127.0.0.1`). La commande refuse de changer automatiquement de port s'il
est occupé, afin de ne pas changer l'origine de la sauvegarde. Exporter
régulièrement une copie JSON ; effacer les données du navigateur efface
la sauvegarde. Les tournois ne sont pas partagés entre appareils.

Ce mode est explicitement choisi par `dev:local`. Les commandes de publication
et le build normal conservent les comptes et les contrôles d'accès.

## Comptes et tournois partagés

- Le premier administrateur est activé par un lien généré en ligne de commande.
- L'administrateur crée des invitations ou des liens de réinitialisation à
  transmettre manuellement au destinataire (48 h, usage unique).
- Les invités choisissent un mot de passe de 12 à 128 caractères.
- Les mots de passe sont hachés avec scrypt et un sel aléatoire.
- Sessions de 7 jours dans PostgreSQL, cookie HttpOnly, SameSite Strict,
  Secure en production. Aucun jeton de session dans le stockage local.
- Les routes de données exigent une session ; les routes de comptes exigent
  le rôle administrateur. Aucun rôle n'est choisi par le navigateur.
- Désactiver un organisateur révoque ses sessions et ses liens d'invitation.
  Réinitialiser son mot de passe invalide ses anciennes sessions.
- Tous les organisateurs autorisés peuvent lire et modifier tous les tournois.
- Écritures vérifiées par numéro de version : une modification concurrente
  est refusée, pas écrasée. Après un conflit ou une panne, les écritures de
  l'écran sont suspendues. Exporter une copie avant de recharger le serveur.
- Le partage n'est pas du temps réel : actualiser la liste ou recharger le
  tournoi pour voir les modifications des autres appareils.

## Démarrage local avec comptes et PostgreSQL (facultatif)

Node.js 22 (22.22.2 minimum, 22.23.3 testé), et un serveur PostgreSQL.
Heroku utilise la branche Node 22 déclarée dans le manifeste.
Le fichier `.env.example` donne les paramètres nécessaires. Copier ce fichier
vers `.env`, configurer l'adresse de la base et ne jamais versionner `.env`.

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run admin:init
```

`admin:init` utilise `ADMIN_EMAIL` et affiche le lien d'activation initial.
Le transmettre uniquement au propriétaire du compte. Une fois l'administrateur
créé, cette commande refuse de créer un autre administrateur.
Avant activation, relancer la commande invalide le précédent lien initial.

Dans deux terminaux :

```powershell
npm.cmd run dev:server
```

```powershell
npm.cmd run dev
```

Le navigateur ouvre `http://127.0.0.1:5173`. Vite relaie `/api` vers le serveur
sur le port 3000. `APP_ORIGIN` doit correspondre **exactement** à l'adresse
ouverte (sans barre finale). Les requêtes provenant d'une autre origine sont
refusées. Les changements d'adresse nécessitent de reconfigurer cette variable.

Node portable est installé localement dans `.tools` (ignoré par Git). Pour
l'utiliser dans chaque terminal PowerShell :

```powershell
$env:PATH = "$PWD\.tools\node-v22.23.3-win-x64;$env:PATH"
```

Pour servir le build et l'API sur un seul port en local :

```powershell
npm.cmd run build
$env:APP_ORIGIN = "http://127.0.0.1:3000"
npm.cmd start
```

Le serveur ne crée pas automatiquement de base, ne passe pas en mode local si
la base est indisponible et ne crée pas de compte avec un mot de passe par défaut.

## Heroku

Un hébergement statique seul ne suffit plus. Le serveur utilise `PORT`, fourni
par Heroku, et écoute sur `0.0.0.0`. Le `Procfile` définit :

- `release` : migration du schéma PostgreSQL avant chaque nouvelle version ;
- `web` : serveur API et fichiers Vue compilés dans `dist`.

1. Créer l'application Heroku et ajouter un service PostgreSQL. L'add-on fournit
   `DATABASE_URL`. Choisir le plan et les sauvegardes adaptés (ne pas supposer
   que ces services sont gratuits).
2. Définir `NODE_ENV=production`,
   `APP_ORIGIN=https://nom-reel-de-l-app.herokuapp.com` et `ADMIN_EMAIL`.
   Ne pas définir `VITE_LOCAL_ONLY=true` en production.
3. Utiliser le buildpack Node.js et déployer le projet, y compris le lockfile.
   Heroku lance le script `build` avec les dépendances de développement, puis
   `npm start`. Ne pas omettre les dépendances de développement pendant le build.
4. Exécuter `heroku run npm run admin:init --app NOM_APP`, puis ouvrir le lien
   affiché pour créer le mot de passe administrateur. Ce lien est sensible :
   ne pas le publier ou le laisser dans un journal partagé.
5. Se connecter, ouvrir « Gérer les accès », inviter les organisateurs.
6. Configurer et vérifier les sauvegardes PostgreSQL et leur restauration.

La connexion PostgreSQL exige TLS avec vérification des certificats en
production. `PG_CA_CERT` permet de fournir le certificat CA PEM du fournisseur
si son certificat n'est pas reconnu par Node. Les options SSL de l'URL sont
retirées en production pour éviter qu'elles remplacent cette configuration.
Ne pas désactiver la vérification pour contourner une erreur de connexion.
Aucun fichier de données n'est écrit sur le disque éphémère du dyno.

Le dépôt n'est pas encore initialisé en Git et aucune application Heroku n'a
été créée par cet outil. La configuration du compte, de la base et le
déploiement restent à effectuer par le propriétaire.

Le renouvellement du mot de passe se fait via l'administrateur, sans envoi
d'e-mail automatique. Pour récupérer le compte administrateur perdu, un
opérateur de confiance disposant d'un accès au serveur peut exécuter
`heroku run npm run admin:reset --app NOM_APP`. `ADMIN_EMAIL` doit correspondre
à l'administrateur actif. Le lien affiché est à transmettre uniquement à ce
dernier. Ses anciennes sessions seront révoquées après utilisation du lien ;
aucun endpoint public ne permet cette opération.

## Tests

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:e2e:private
```

Les tests API utilisent PGlite (moteur PostgreSQL embarqué en mémoire), pas
une simulation des requêtes SQL, ni la base de production. Ils valident les
invitations, connexions, cookies, contrôles d'accès, réinitialisations et
conflits. Il faut encore tester la connexion TLS et le déploiement avec
le service PostgreSQL réellement provisionné.

Les tests navigateur utilisent Microsoft Edge installé sur la machine.
`test:e2e` vérifie le mode local historique sur le port 5174.
`test:e2e:private` compile la version privée puis sert l'API et la même
interface depuis un serveur de test PostgreSQL en mémoire sur le port 3001 :
comptes fictifs, invitations, deux contextes navigateur, partage, conflits et
révocation d'accès. Ce serveur est limité à `127.0.0.1` et n'est jamais démarré
par `npm start`. Les contextes de test ne touchent pas à vos sauvegardes.

## Règles du tournoi

- 4 à 128 joueurs ; 4 joueurs par terrain, jusqu'à 32 terrains.
- 1 à 100 manches, de 0,1 à 180 minutes.
- Chrono commun, pause/reprise et échéance conservée après rechargement.
- Chaque carte représente un terrain de badminton en CSS (proportions
  13,40 × 6,10 m), lignes de simple/double, services et filet. Les pastilles
  affichent les initiales des joueurs ; leurs noms complets et les scores
  restent sous le terrain. Ce schéma décoratif ne fixe pas leur placement réel.
- Scores entiers positifs ou nuls, sans plafond à 21 (limite technique :
  `floor(Number.MAX_SAFE_INTEGER / 400)`).
- Rotation après les deux scores de chaque terrain, chrono arrêté ou en pause.
- Les joueurs ayant le moins joué sont prioritaires : pauses équilibrées.
  La recherche compare jusqu'à 500 compositions, pénalisant les partenaires
  et adversaires répétés ; pas de garantie d'optimalité.
- Classement : points marqués / matchs joués, puis différence de points /
  matchs joués ; ex aequo possibles. Chaque joueur reçoit le score de son équipe.
- Classement et récapitulatif partenaires/adversaires excluent les matchs
  partiellement saisis. Les joueurs au repos restent visibles.
- Les scores passés sont corrigeables, mais ne peuvent pas être effacés.
- Export/import JSON validé, compatible avec le format HTML `version: 1`.

## Anciennes sauvegardes / mode local

Exporter le tournoi depuis l'ancienne application, se connecter à la nouvelle,
préparer un tournoi partagé nommé puis importer le JSON dans le formulaire.
Les équipes, scores, manches et chrono sont conservés. La sauvegarde de
l'ancien navigateur n'est ni automatiquement transférée ni supprimée.

Le mode sans compte existe pour une démonstration locale :
`VITE_LOCAL_ONLY=true` au démarrage de Vite ou lors du build. Il utilise la clé
locale `volant.tournament.v1`, conservée malgré le renommage en Salade pour
retrouver les sauvegardes existantes, et ne partage aucune donnée. Les exports
portent désormais le nom `salade-AAAA-MM-JJ.json` ; les anciens exports restent
compatibles.
**Ne pas activer ce mode pour une publication privée.** Il n'enlève pas les
contrôles d'accès de l'API, mais expose l'interface locale sans connexion.

## Structure

- `src/domain/tournament.ts` : moteur et validation partagés avec le serveur.
- `src/composables/useTournament.ts` : état, chrono, sauvegarde locale ou distante.
- `src/Root.vue` : connexion, invitations, liste partagée, administration.
- `src/App.vue` et `src/components` : gestion du tournoi et tableaux.
- `src/services/api.ts` : client API ; cookies de session gérés par le navigateur.
- `server` : API Express, schéma PostgreSQL, hachage et scripts d'initialisation.
