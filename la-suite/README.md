# La Suite — MVP

Cette branche introduit le premier socle de **La Suite**, capsule temporelle de La Forge à Souvenirs.

## Déjà préparé

- Landing page dédiée
- Création d'une capsule
- Connexion propriétaire par magic link
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
2. Exécuter `supabase/schema.sql`.
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
