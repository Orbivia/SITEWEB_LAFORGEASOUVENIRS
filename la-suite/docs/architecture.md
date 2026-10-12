# Architecture et conventions

## Modules
| Fichier | Responsabilité |
| --- | --- |
| app.js | Orchestration des pages, accès Supabase, capture, sauvegarde, génération et export QR |
| workspace.js | Compte, liste des capsules, paramètres, suppression |
| typography.js | Catalogue unique des 12 typos, familles CSS et graisses |
| capsule-design.js | Thèmes, fonds personnalisés autorisés, zone dégagée pour le logo |
| welcome-ui.js | Configuration d'apparence et application aux surfaces |
| welcome-visual.js | Éditeur, aperçu réel en iframe, stylos et redimensionnement |
| guest-landing.js | Navigation et présentation invité, fenêtres de dépôt |
| guest-calendar.js | Disponibilité de l'accueil et calendrier invité |
| organizer-layout.js | Structure et fenêtres de l'organisateur |
| suite-memory-state.js | État lu/non lu et classement des souvenirs |
| memory-reader.js | Fenêtre de lecture ; fonctions de date et état injectées par app.js |
| qr-drawing.js / card-pdf.js | Dessin QR et export PDF |
| souvenir-zip.js / backup-archive.js | Archives organisateur et administration |
| suite-shell.js | En-tête et shell partagé |

## Chargement
Scripts classiques, sans bundler. `typography.js` précède `welcome-ui.js`, `welcome-visual.js` et `app.js`. `capsule-design.js` précède les consommateurs des thèmes. `memory-reader.js` précède `app.js` ; son montage s'exécute après le chargement de l'état des souvenirs.

Les identifiants des typos restent stables : ils sont stockés dans `qr_font` et `welcome_config.font`. Leur nom affiché et leur famille sont définis uniquement dans `typography.js`. Ils sont validés par deux contraintes distinctes en base.

## Styles
- `styles.css` : base commune, pages publiques, composants et fenêtres.
- `organizer-layout.css` et `organizer-mobile.css` : espace organisateur et réception mobile.
- `guest-landing.css` : accueil, dépôt et confirmation invités.
- `welcome-visual.css` : studio de personnalisation et aperçus.
- `admin.css` : administration.

Les feuilles historiques contiennent encore des ajustements successifs. Ne pas supprimer une règle simplement parce que son sélecteur réapparaît : les media queries et la spécificité peuvent changer son rôle. Le nettoyage de cette passe retire la logique de masquage des lignes devenue inutile ; la consolidation complète nécessite des captures de référence sur plusieurs dimensions.

Les variables `--capsule-safe-inline`, `--capsule-safe-top`, `--capsule-safe-bottom` et `--capsule-logo-height` définissent les marges partagées. `logoBackground` conserve les motifs des coins et dégage le centre du bas. L'export canvas réalise le même principe. La hauteur stable (`svh`) convient aux pages fixes ; le viewport visuel reste utilisé pour les fenêtres avec clavier.

## Données et sécurité
Les contrôles du navigateur améliorent l'interface ; les contraintes, droits et règles serveur sont autoritaires. Un message verrouillé ne doit pas révéler son contenu dans un extrait. Les médias utilisent des liens temporaires. Les secrets serveur ne doivent jamais être ajoutés aux fichiers publics.

Les SQL de `migrations/` consignent les ajustements de contraintes réalisés. Ils ne constituent pas un export complet du schéma : ne pas les utiliser seuls pour recréer la base.

## Refactorisation
Extraire une responsabilité avec une API explicite, maintenir les clés persistées et l'ordre de chargement, puis vérifier les appelants. `app.js` reste volumineux ; les captures et les exports pourront être séparés lors d'une passe suivante avec des tests de navigateur. Ne pas présenter un contrôle de syntaxe comme une validation visuelle.
