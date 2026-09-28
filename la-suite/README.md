# La Suite — MVP

Cette branche introduit le premier socle de **La Suite**, capsule temporelle de La Forge à Souvenirs.

## Déjà préparé

- Landing page dédiée
- Création d'une capsule
- Compte propriétaire avec e-mail / mot de passe, confirmation par e-mail et récupération du mot de passe
- Page invité accessible avec un token non devinable
- Sélection et validation des vidéos jusqu'à 100 Mo
- Tableau de bord + lien invité + QR code
- Schéma Supabase avec RLS
- Bucket vidéo privé
- Edge Function `guest-upload` pour générer des uploads signés
- Lecture des messages et vidéos bloquée jusqu'à la date d'ouverture
- Fallback local tant que Supabase n'est pas configuré
- Aucun secret serveur dans GitHub

## Mise en service Supabase

1. Créer un projet Supabase `la-suite`.
2. Exécuter `supabase/schema.sql`, puis les fichiers `supabase/migrations/*.sql` dans l’ordre (une seule fois).
3. Déployer l'Edge Function :
   `supabase/functions/guest-upload/index.ts`
4. Dans Authentication > URL Configuration, ajouter :
   - le domaine de production ;
   - l'URL de la branche de prévisualisation si nécessaire.
5. Renseigner uniquement les valeurs publiques dans `supabase-config.js` :
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
6. Ne jamais ajouter `SUPABASE_SERVICE_ROLE_KEY` au dépôt. Supabase l'expose à l'Edge Function via les secrets d'environnement.
7. Tester sur Android et iPhone : création, QR, upload MP4/MOV/WebM, ouverture différée.

## Sécurité prévue

- bucket `capsule-media` privé ;
- pas de policy d'upload anonyme ;
- upload invité via URL signée ;
- URL invité basée sur `guest_token`, pas sur un slug facilement devinable ;
- RLS propriétaire sur les capsules ;
- contenu des messages inaccessible au propriétaire avant `unlock_date` ;
- limite serveur de 100 Mo et liste blanche de types vidéo.

## Avant commercialisation

Ajouter au minimum : anti-abus (Turnstile ou équivalent), suppression complète d'une capsule, politique de confidentialité/RGPD, durée de conservation, e-mails d'ouverture, sauvegarde/export et paiement.

## Parcours de compte et activation (septembre 2026)

- Préparation locale conservée 24 h sur ce navigateur, puis connexion/inscription et création d’un brouillon privé. Les mots de passe ne sont jamais enregistrés par l’application.
- « Mes capsules » permet de retrouver chaque capsule, y compris les brouillons.
- Les anciennes connexions par lien restent compatibles : « première connexion » permet de définir un mot de passe sur la même adresse.
- Configurer les URL de retour autorisées dans Supabase Auth : `https://laforgeasouvenirs.fr/la-suite/dashboard.html`, `https://laforgeasouvenirs.fr/la-suite/create.html?resume=1` et `https://laforgeasouvenirs.fr/la-suite/auth.html?mode=recovery` (et leurs équivalents de prévisualisation). La confirmation de l’adresse est activée sur le projet.
- Formules : `photo` = Éclat, `audio` = Écho, `premium` = Éternité. La formule est une intention commerciale ; durant la phase gratuite, tous les médias restent accessibles.
- Le bouton « Activer gratuitement » appelle `activate_capsule`, qui vérifie le propriétaire, la confirmation de l’e-mail et le paramètre serveur. L’opération est idempotente. Les modifications directes des champs d’activation sont refusées aux clients.
- Les capsules existantes restent actives (`activation_source=legacy`). Les nouvelles activations gratuites portent `free_beta`, jamais un statut payé.
- Les invités ne peuvent consulter ou alimenter que les capsules actives, via le jeton du QR code. L’Edge Function vérifie aussi cet état avant toute création de message ou d’URL signée.

### Branchement du paiement ultérieur

1. Désactiver `capsule_billing_settings.free_activation_enabled` côté serveur avant le lancement payant.
2. Ajouter une création de commande/checkout serveur liée au propriétaire, à la capsule et à un catalogue de prix serveur. Ne pas accepter un montant envoyé par le navigateur.
3. Vérifier les webhooks du prestataire et leur idempotence ; seule une confirmation serveur doit activer la capsule avec `activation_source=payment`. Le retour du navigateur ne constitue pas une preuve de paiement.
4. Ajouter les états attente/échec/remboursement et la facture à l’espace organisateur ; appliquer les droits média de la formule côté serveur et côté interface, en conservant les droits des capsules legacy/free_beta.

Aucun prestataire de paiement, encaissement ou webhook fictif n’est branché aujourd’hui.

### Vérification

Tests navigateur : depuis `la-suite/tests`, exécuter `npm install`, `npx playwright install chromium`, puis `npm test`. Le navigateur peut aussi être fourni via `CHROMIUM_EXECUTABLE_PATH`.

`tests/account_activation.sql` vérifie dans une transaction annulée les brouillons privés, l’isolation entre comptes, les modifications directes interdites, la confirmation e-mail, le coupe-circuit des activations gratuites et l’idempotence. Les essais navigateur couvrent inscription, connexion, récupération, conservation de la préparation, activation et affichage mobile/ordinateur avec réponses Auth simulées. La réception des e-mails et les liens réels restent à vérifier avec une boîte de test autorisée.

Les avis Supabase sur les fonctions SECURITY DEFINER sont attendus : la lecture publique est limitée au jeton d’une capsule active, l’activation à son propriétaire confirmé. La table de réglage serveur est volontairement sans policy et sans droits clients. La protection contre les mots de passe compromis était désactivée avant cette évolution ; réglage à activer dans Supabase Auth avant commercialisation : https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
