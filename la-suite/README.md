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
- Formules : `photo` = Essentiel, `audio` = Plus, `premium` = Premium. La formule est une intention commerciale ; durant la phase gratuite, tous les médias restent accessibles.
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

## Configuration et répondeur facultatif

La carte propose désormais « Notre capsule temporelle », un petit mot et une explication adaptée aux formats de la formule. Les anciens textes par défaut sont remplacés à l’affichage ; les textes personnalisés restent conservés. Le QR garde ses dimensions fixes. Les limites sont de 42 / 120 / 240 caractères pour le titre, le petit mot et l’explication.

Le répondeur est facultatif : aucun, texte (2 000 caractères), image JPG/PNG/WebP (10 Mo) ou vidéo MP4/MOV/WebM (12 secondes, 100 Mo). Il réutilise `welcome_message` et `intro_path`, sans migration. Les médias restent privés dans le dossier du propriétaire ; `get_intro` fournit un lien signé et son type uniquement pour une capsule active. Désactiver le répondeur retire son affichage sans supprimer définitivement les fichiers précédemment envoyés.

Les tests navigateur couvrent les trois formats, la désactivation et l’échec de sauvegarde. `node tests/guest-intro.cjs` (Node 24) vérifie la réponse image/vidéo et le refus des actions invité sur un brouillon.

## Fiabilisation de l’espace organisateur

- Une file de sauvegarde conserve l’ordre des modifications de carte. L’indicateur distingue l’enregistrement en cours, les modifications restantes et les échecs ; le bouton « Tout enregistrer » permet de réessayer. Un avertissement navigateur protège une sortie avec des modifications restantes.
- Avant la validation puis l’activation, les paramètres, le répondeur et la carte sont enregistrés. Une erreur ou une modification survenue pendant la sauvegarde bloque la validation. Un envoi du répondeur déjà en cours est attendu, sans double upload.
- Nom et date sont modifiables ; la formule l’est en brouillon. Le texte d’explication proposé est ajusté au changement de formule, sans remplacer un texte personnalisé. L’activation est suivie d’une confirmation avec partage, téléchargement et impression.
- Le répondeur propose un aperçu local immédiat, séparé de sa version enregistrée.
- La liste des capsules affiche une miniature générée à la demande et les comptes de souvenirs via `owner_capsule_stats`. La suppression nécessite une confirmation et filtre à la fois l’identifiant et le statut brouillon ; les règles de propriété Supabase restent appliquées. Les anciens fichiers de répondeur non référencés restent privés dans le stockage et nécessitent une tâche de nettoyage distincte ; cette suppression n’est pas une purge physique du stockage.
- Les souvenirs peuvent être actualisés sans recharger la configuration. Les erreurs sont affichées, chaque téléchargement obtient un nouveau lien signé, et les médias peuvent être rechargés ; la lecture audio/vidéo renouvelle son URL après expiration.

Vérifications : tests navigateur avec sauvegardes échouées et retardées, conservation du répondeur à l’activation, paramètres, aperçu, confirmation et suppression de brouillon, erreurs de chargement et renouvellement de média. Le test SQL transactionnel vérifie aussi les modifications/suppressions entre comptes et le filtre protégeant une capsule devenue active. Aucun changement de schéma ni du parcours invité.

## Parcours invité et quotas (septembre 2026)

- Choix Photo / Petit mot / Audio / Vidéo, prénom facultatif, date immédiate par défaut et raccourcis 1 / 6 / 12 mois ou date libre. Les formats absents de la formule sont masqués ; en lancement gratuit les droits restent Premium (5 Go), conformément à l’offre annoncée.
- Envoi TUS signé avec progression, reprises automatiques puis bouton Réessayer. Le fichier et le texte restent en mémoire sur cette page après une erreur. Une fermeture/recharge ne conserve pas le fichier : la reprise inter-pages n’est pas promise. L’identifiant de requête rend les retries texte et média idempotents ; une confirmation finale échouée se relance sans réenvoyer le fichier.
- Photos JPEG/PNG/WebP optimisées dans le navigateur (2048 px maximum, JPEG qualité 0,88). HEIC/HEIF conservés, aperçu dépendant du navigateur. Photos 10 Mo, audios 20 Mo / 3 min, vidéos 50 Mo / 1 min. Les durées sont vérifiées dans le navigateur ; le serveur vérifie les tailles réelles et le MIME déclaré dans Storage, pas le contenu binaire ni une durée indépendante.
- Catalogue payant prévu : Essentiel 1 Go, Plus 2 Go, Premium 5 Go, unités décimales. Le texte reste possible après saturation média.
- Réservations atomiques sous verrou de capsule : objets Storage existants + réservations qui n’ont pas encore d’objet. Les réservations restent 25 h pour couvrir une reprise TUS ; l’objet n’est pas compté deux fois. Un quota rempli par des fichiers plus gros que leur déclaration empêche leur finalisation ; les objets dont taille/MIME ne correspondent pas sont supprimés via l’API Storage. Les URLs signées sont plafonnées globalement à 50 Mo ; elles ne garantissent pas à elles seules la taille réservée de chaque fichier.
- Nouveaux brouillons : dépôts à J et J+1 en Europe/Paris, dévoilement jusqu’au dernier jour des 30 mois suivant l’événement, accès jusqu’à son troisième anniversaire. Les envois réservés avant fermeture disposent de leur période de reprise. La date et la formule sont figées après activation. Les anciennes capsules actives gardent leur fenêtre initiale ; les anciens brouillons passent aux nouvelles règles à l’activation.
- Les brouillons/envois incomplets ne sont pas comptés comme souvenirs reçus. L’organisateur voit l’état, les échéances, le stockage et les avertissements à 80 % / 95 %.
- Pas de paiement ajouté. Les emails d’ouverture/expiration, sauvegardes médias indépendantes, purge automatique des objets expirés/orphelins et protections anti-abus restent à configurer avant commercialisation. La fin d’accès à 3 ans n’est pas une purge physique des médias.

Migration : `supabase/migrations/20260930182838_guest_experience_quotas_calendar.sql` (version générée par Supabase). Tests SQL transactionnels annulés : `tests/guest_limits.sql`. CI : syntaxe, endpoint invité et parcours Playwright organisateur/invité avec services simulés. Aucun email ni souvenir réel n’est envoyé par ces tests.
