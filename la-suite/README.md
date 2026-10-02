# La Suite — état et exploitation

Site publié par GitHub Pages : https://laforgeasouvenirs.fr/la-suite/. Supabase héberge Auth, PostgreSQL, les médias privés et les fonctions serveur. Projet actuel : `yejzxsrmqudhvaikaitb`, région `eu-west-2`. État revu le 1er octobre 2026 ; [AUDIT.md](AUDIT.md) présente les corrections et les problèmes restant ouverts.

## Parcours client

Le formulaire demande nom, date et e-mail, avec validation visible. La préparation locale expire après 24 h. L’inscription demande un mot de passe d’au moins dix caractères, sa confirmation et la confirmation de l’adresse avant activation. Connexion et récupération : `auth.html`.

L’interface ne propose pas de gestion de brouillons : une capsule unique ouvre directement son espace. Le serveur conserve un état interne `draft` pendant la préparation, puis `active`. Les anciens comptes avec plusieurs capsules les conservent. Les réglages et la carte QR sont enregistrés automatiquement ; les échecs restent visibles et peuvent être relancés. Les modifications restantes déclenchent un avertissement à la fermeture.

Le lancement gratuit autorise une capsule gratuite par compte. Le droit est consommé à l’activation et reste consommé après suppression. Un verrou par compte et une limite de cinq créations réussies en 24 h évitent les créations simultanées.

L’activation gratuite donne les droits Premium, soit 5 Go **par capsule**. Ce quota applicatif ne réserve pas 5 Go chez l’hébergeur : la capacité globale doit couvrir tous les clients et les sauvegardes. Aucun encaissement n’est branché. Catalogue futur : Essentiel/`photo` 1 Go, Plus/`audio` 2 Go, Premium/`premium` 5 Go.

## Invités, calendrier et fichiers

Le QR contient un jeton aléatoire de 36 caractères hexadécimaux. Les invités n’ont pas de compte. Ils choisissent Photo, Petit mot, Audio ou Vidéo, un prénom facultatif et une réception immédiate ou différée.

| Format | Taille maximale | Durée |
| --- | --- | --- |
| Photo JPEG/PNG/WebP/HEIC/HEIF | 10 Mo | — |
| Audio | 20 Mo | 3 minutes |
| Vidéo MP4/MOV/WebM | 50 Mo | 1 minute |
| Petit mot | 4 000 caractères | — |

Les unités sont décimales. JPEG/PNG/WebP sont optimisés à 2 048 px maximum dans le navigateur. HEIC/HEIF restent d’origine, avec aperçu dépendant du navigateur. Le serveur vérifie taille réelle et MIME déclaré dans Storage ; la durée et le contenu binaire ne sont pas vérifiés indépendamment du navigateur.

Les nouvelles capsules acceptent les dépôts le jour de l’événement et le lendemain, en Europe/Paris. Le dévoilement peut aller jusqu’au dernier jour des trente mois suivants. Les souvenirs sont lisibles à partir de `delivery_at`, jusqu’au troisième anniversaire de l’événement. Date et formule sont figées après activation. Les capsules historiques gardent leur ancienne fenêtre de dépôt, avec la limite de conservation de trois ans.

`guest-upload` réserve les octets sous verrou de capsule et délivre une URL signée. L’envoi invité utilise TUS, avec progression et reprise sur la page. Les réservations durent 25 h ; fichiers et réservations sans objet sont comptés une seule fois. La finalisation vérifie taille, MIME et quota. L’identifiant de requête évite les doublons. Une recharge ne conserve pas le fichier choisi. Les petits mots restent possibles lorsque le quota média est rempli. La limite globale de 50 Mo borne chaque upload signé, mais ne garantit pas à elle seule la taille réservée.

La prise en direct est disponible : appareil photo natif sur les mobiles compatibles, caméra et micro via le navigateur pour vidéo/audio. Un décompte de trois secondes précède l’enregistrement ; un chrono compact affiche durée écoulée et temps restant. Arrêt manuel ou automatique à une minute vidéo / trois minutes audio, puis aperçu ou écoute avant envoi. Caméra et micro sont libérés à l’arrêt. Si le navigateur ou les permissions empêchent la capture, le choix d’un fichier reste disponible. Les tests utilisent le vrai MediaRecorder de Chromium avec caméra/micro simulés, sur mobile et ordinateur ; une vérification sur téléphones physiques reste nécessaire.

## Accueil et espace organisateur

L’accueil facultatif peut être un texte de 2 000 caractères, une image JPG/PNG/WebP de 10 Mo ou une vidéo de 12 secondes et 50 Mo. Il utilise `welcome_message` et `intro_path`.

Les médias d’accueil passent par `guest-upload`, avec JWT vérifié, propriété, réservation de quota et finalisation serveur. Le navigateur n’a aucun droit INSERT/UPDATE Storage direct. Le serveur refuse capsules suspendues/expirées et fichiers incompatibles. Dix réservations d’accueil simultanées au maximum sont admises par capsule.

Un trigger interdit d’utiliser comme accueil un souvenir privé ou un fichier d’une autre capsule. `get_intro` vérifie aussi le dossier `<capsule>/organizer/` avant de signer un lien. Les fichiers remplacés ou désactivés restent privés et comptés ; leur purge physique n’est pas automatisée.

La carte propose titre, petit mot, explication et personnalisation QR, avec limites de 42/120/240 caractères. Les textes sont rendus sans HTML utilisateur. L’organisateur voit échéances, stockage et avertissements à 80 %/95 %. Les téléchargements obtiennent de nouveaux liens signés ; les médias peuvent être rechargés après expiration du lien.

## Administration et sauvegardes

`admin.html` contient Capsules/Clients/Sauvegardes. Connexion : https://laforgeasouvenirs.fr/la-suite/auth.html?next=admin. Le rôle est dans une table privée, attribué par invitation unique de 48 h à une adresse confirmée. Un champ de profil modifiable ne donne aucun droit. Quotas et suspension sont protégés côté SQL.

`suite-admin` vérifie chaque JWT via Auth et le rôle privé. Le cron dispose d’un secret Vault séparé et ne peut appeler que le worker. Les listes ne montrent ni contenu des souvenirs, ni liens invités, ni mots de passe.

La sauvegarde automatique est prévue à 02:00 UTC. Le worker traite cinq fichiers maximum par appel, avec bail de deux minutes et reprise serveur. Réglages, messages, dates et médias sont chiffrés en AES-256-GCM ; les fichiers inchangés sont dédupliqués. Un fichier manquant ou changé produit un échec visible.

Rétention des tâches : sept jours, raccourcie par la première échéance de conservation des capsules incluses. Le nettoyage s’exécute aussi avec une file occupée, et chaque heure si les services sont disponibles. Les objets chiffrés sans référence et âgés de plus de 24 h sont supprimés via l’API Storage. Ce délai protège les écritures et implique une période de grâce pour les objets récents. Les imports non expirés sont protégés par leur chemin `stored_key`. Les exports locaux sont sous la responsabilité de l’administrateur.

L’archive `.lasuite` restaure les lignes et médias manquants sans écraser les réglages actuels, nouveaux souvenirs ou dates de dévoilement. **Elle nécessite le projet, la clé Vault et les comptes organisateurs d’origine.** Elle n’inclut pas les mots de passe Auth et ne suffit pas pour reprendre après perte de tout le projet. Prévoir une sauvegarde opérateur indépendante de la base/Auth, des médias et des secrets Vault.

Chrome/Edge ordinateur permettent un téléchargement progressif. Le repli en mémoire sur les autres navigateurs est plafonné à 150 Mo. Les sauvegardes consomment du stockage supplémentaire, avec les versions modifiées ; la déduplication ne dispense pas de dimensionner l’hébergement.

## Installation et mises à jour

Le projet actuel est déjà installé. **Ne pas réexécuter le schéma initial ou les anciennes migrations en production.** Appliquer uniquement les migrations manquantes avec leur suivi de version Supabase.

Pour un nouveau projet, sur environnement de test :

1. Exécuter `supabase/schema.sql` comme socle historique, puis `supabase/migrations/*.sql` dans l’ordre des versions, une fois chacun. Le schéma initial seul ne représente pas le produit actuel.
2. Activer les extensions nécessaires, dont Vault, pg_cron et pg_net. Les migrations créent clé de chiffrement et jeton worker dans Vault. Ne jamais les régénérer si des archives existent.
3. Adapter l’URL de `la_suite_internal.run_backup_worker()` : les migrations historiques ciblent le projet actuel. Renseigner les valeurs publiques du nouveau projet dans `supabase-config.js`.
4. Déployer `guest-upload` et `suite-admin`, avec leurs dépendances relatives. `verify_jwt=false` permet le jeton invité et le cron ; l’authentification propre à chaque action est implémentée dans les fonctions. La service-role reste exclusivement côté serveur.
5. Configurer Auth, SMTP et les URL ci-dessous. Attribuer l’administration par invitation serveur ; aucune route publique ne peut la créer.
6. Tester parcours et restauration avant publication. La reconstruction complète sur un deuxième projet vierge n’a pas encore été exécutée.

URL Auth autorisées en production :

- `https://laforgeasouvenirs.fr/la-suite/dashboard.html`
- `https://laforgeasouvenirs.fr/la-suite/admin.html`
- `https://laforgeasouvenirs.fr/la-suite/create.html?resume=1`
- `https://laforgeasouvenirs.fr/la-suite/auth.html?mode=recovery`
- `https://laforgeasouvenirs.fr/la-suite/auth.html?mode=recovery&next=create`
- `https://laforgeasouvenirs.fr/la-suite/auth.html?mode=recovery&next=admin`

Ajouter explicitement les équivalents de prévisualisation nécessaires. SMTP et allowlist ne sont pas garantis par les tests simulés. Le [SMTP par défaut Supabase](https://supabase.com/docs/guides/auth/auth-smtp) est limité aux adresses de l’équipe et à deux mails par heure. Configurer un SMTP de production avec SPF/DKIM/DMARC ; ne pas désactiver la confirmation pour contourner un problème de mail.

## Vérification

Node 24. Depuis `la-suite/tests` : `npm install`, `npx playwright install chromium`, puis `npm test`. `test:unit` exécute fonctions et chiffrement ; `test:browser` exécute les parcours organisateur/invité/admin sur mobile et ordinateur. `CHROMIUM_EXECUTABLE_PATH` et `QA_NODE_MODULES` permettent d’utiliser des dépendances déjà installées.

Les scripts SQL `tests/*.sql` commencent par BEGIN et finissent par ROLLBACK. Ils vérifient isolation, activation, limites de compte, quotas, calendrier, rôles, restauration et régressions de l’audit. Faux comptes et métadonnées Storage ne sont jamais conservés ; aucun média physique n’est créé. La CI exécute syntaxe, unités et navigateur ; les contrôles SQL se font séparément sur une base Supabase de test ou dans une transaction contrôlée annulée.

La bibliothèque Supabase navigateur et serveur est fixée à `2.58.0`. Les essais navigateur simulent Supabase ; ils ne prouvent ni la livraison des mails ni les envois réels sur tous les téléphones.

## Avant ouverture commerciale

- Adapter l’hébergement. Au 1er octobre 2026 l’organisation est sur Free : 1 Go de Storage inclus pour le projet, à comparer aux 5 Go annoncés par capsule et aux sauvegardes. [Capacité et facturation](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size).
- Valider SMTP, inscription et récupération avec une adresse extérieure ; activer la protection Auth contre les mots de passe compromis.
- Ajouter CAPTCHA/anti-abus et limites de débit pour les liens invités publics. Les quotas média ne bornent pas le nombre de petits mots ou les envois malveillants.
- Automatiser la purge physique des médias expirés, introductions remplacées et uploads abandonnés via Storage API. La fin d’accès à trois ans ne supprime pas encore les fichiers ni leur facturation.
- Finaliser confidentialité, conservation, suppression et notifications d’ouverture/expiration ; ajouter des alertes indépendantes si cron/sauvegardes cessent de fonctionner.
- Préparer une restauration complète après perte du projet, distincte de la restauration additive actuelle.
- Pour un lancement payant : checkout/catalogue serveur, webhooks vérifiés et idempotents, états échec/remboursement/facture. Désactiver `capsule_billing_settings.free_activation_enabled` avant l’ouverture payante. Le retour du navigateur ne prouve pas un paiement.

Les tables privées sans policy RLS sont volontairement inaccessibles. Les RPC SECURITY DEFINER nécessaires vérifient propriété ou jeton et fixent leur `search_path`. Le signalement pg_net dans public est suivi : l’extension n’est pas déplaçable ; ses objets HTTP sont dans `net`, hors API exposée.
