# La Suite — MVP

Cette branche introduit le premier squelette de **La Suite**, capsule temporelle de La Forge à Souvenirs.

## État actuel

- Landing page dédiée
- Création d'une capsule en mode prototype local
- Page invité
- Sélection vidéo jusqu'à 100 Mo
- Tableau de bord prototype
- Schéma Supabase initial avec RLS
- Aucun secret ni donnée utilisateur stocké dans GitHub

Le mode local utilise `localStorage` uniquement pour valider l'UX. Il n'est pas destiné à la production.

## Prochaine étape

1. Créer un projet Supabase `la-suite`
2. Exécuter `supabase/schema.sql`
3. Configurer Supabase Auth
4. Ajouter une Edge Function pour :
   - récupérer les informations publiques d'une capsule par son slug ;
   - créer une URL d'upload signée ;
   - vérifier les limites de taille/type ;
   - éviter une policy anonyme trop permissive ;
5. Remplacer le stockage local du prototype par les appels Supabase
6. Ajouter QR code, ouverture par date, e-mails puis paiement

## Sécurité

Le bucket `capsule-media` reste privé. Les clés `service_role` ne doivent jamais être ajoutées à ce dépôt. La clé publique/anon pourra être exposée côté navigateur uniquement avec des règles RLS adaptées.
