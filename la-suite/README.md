# La Suite — capsule temporelle

Application web statique publiée avec GitHub Pages, avec Supabase pour l'authentification, les données et les médias. Les invités utilisent leur navigateur ; aucune application n'est nécessaire.

## Pages
- `index.html` : présentation et offres.
- `auth.html` : connexion et retour d'activation du compte.
- `create.html` : création d'une capsule.
- `dashboard.html` : espace organisateur, personnalisation et réception.
- `capsule.html` : parcours invité, accueil puis dépôt et confirmation.
- `admin.html` : administration.
- `cgv.html` : conditions de vente.

## Parcours actuel
La capsule se personnalise avant activation. L'éditeur propose la fiche QR et uniquement la première page d'accueil invité. Le compte permet de retrouver les capsules et leurs paramètres : date, téléchargement des souvenirs ouverts, suppression avec confirmation. Le stylo de la date règle son affichage ; la modification se fait dans les paramètres. Le téléchargement des souvenirs est désactivé pour les brouillons.

L'invité choisit texte, photo, audio ou vidéo selon la formule. La photo peut être choisie ou prise. L'audio et la vidéo se capturent directement, puis reviennent à l'aperçu sans validation supplémentaire. Le prénom est demandé au moment d'envoyer. La date de révélation est bornée par les règles serveur. Les souvenirs futurs restent verrouillés.

## Maintenance
Consulter [l'architecture](docs/architecture.md) pour les modules et les règles de modification. Le manifeste `runtime-files.json` recense les pages, scripts et styles locaux de premier niveau ; les assets sont dans `assets/`.

Une modification de ressource doit mettre à jour sa version dans les pages qui la chargent. Les dépendances Supabase et QR sont épinglées dans le HTML. Les nouvelles clés persistées doivent être compatibles avec les contraintes de la base avant publication.

## Vérification
```sh
for file in la-suite/*.js; do node --check "$file" || exit 1; done
node la-suite/tests/catalog.test.cjs
git diff --check
```

Servir le dépôt via HTTP pour tester le navigateur ; ne pas utiliser `file://`. Les permissions caméra/micro nécessitent HTTPS, sauf localhost. Tester les opérations destructives uniquement avec une capsule de test.

La validation smartphone sur appareil reste nécessaire : clavier, barre d'adresse, zoom, plein écran, autorisations et capture réelle. La revue du 12 octobre est dans `docs/mobile-review-2026-10-12.md` ; elle distingue les contrôles exécutés et les points non testés.
