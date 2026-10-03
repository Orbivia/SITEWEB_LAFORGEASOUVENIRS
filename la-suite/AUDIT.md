# Revue du 1er octobre 2026

Périmètre : code/documentation, policies/RPC et buckets réels, rôles admin, quotas, cron, fonctions, journaux Auth et avis Supabase. Cette revue n’est pas un audit de pénétration exhaustif.

## Corrections

1. **Accès anticipé par détournement de l’accueil.** `intro_path` pouvait désigner un souvenir privé ou une autre capsule, puis être signé par le service invité. Trigger de dossier/présence/compatibilité et contrôle complémentaire dans l’Edge Function. Tests SQL et endpoint des deux détournements.
2. **Quota contourné par les introductions.** Retrait des uploads Storage directs organisateur. JWT vérifié, propriété, verrou, réservation partagée avec les invités et finalisation serveur. Tests de propriété, quota, taille divergente, double comptage et RPC privé.
3. **Nettoyage des backups bloqué par la file.** Le nettoyage précède la prise d’un travail. Test avec un travail en cours et un fichier obsolète simultanés.
4. **Imports effacés prématurément.** Le nettoyage protège le chemin physique `stored_key`, pas seulement la clé dédupliquée. Test avec fichier ancien et import valide.
5. **Expiration incomplète.** Les préparations expirées restent désormais marquées `expired` ; lectures d’accueil et historiques alignées sur trois ans, en Europe/Paris.
6. **Documentation et vérifications divergentes.** README réécrit : limites actuelles, aucun brouillon visible, sauvegardes et leurs limites. SDK navigateur fixé, `npm test` couvre tous les parcours.

## À traiter avant lancement

| Priorité | Point | Action |
| --- | --- | --- |
| Bloquant pour l’offre annoncée | Supabase Free : 1 Go de Storage inclus au total | Dimensionner médias + sauvegardes avant de proposer 5 Go par client. Aucun changement de facturation effectué. |
| Bloquant à valider pour les comptes externes | SMTP/URL Auth non vérifiés avec les accès actuels | Tester inscription, confirmation et récupération depuis une adresse cliente extérieure. Le SMTP par défaut ne convient pas à la production. |
| Corrigée le 3 octobre | Purge physique des médias | Worker Storage API, grâce de 26 h, lots de 100, protection des références/envois/sauvegardes, acquittement après suppression. |
| Élevée | Anti-abus des entrées publiques incomplet | Débit et CAPTCHA avant ouverture large. 200 Mo/20 fichiers et 20 textes par navigateur sont désormais appliqués. Un script peut changer d’identifiant : CAPTCHA et débit restent à traiter. |
| Élevée | Archives dépendantes du projet/Vault et des comptes d’origine | Sauvegarde opérateur indépendante et essai de reconstruction complète. |
| Moyenne | Durée et type binaire sans contrôle serveur indépendant | Implémenter ce contrôle ou accepter cette limite pour une bêta restreinte. |
| Moyenne | Protection Auth contre mots de passe compromis désactivée | Activer le réglage Supabase Auth. |
| Moyenne | Pas d’alerte indépendante sur une absence d’exécution cron | Surveiller la dernière sauvegarde réussie. Une erreur de tâche ne couvre pas une absence de tâche. |
| À finaliser | Paiements, notifications, confidentialité et suppression | Lancement gratuit ; aucun paiement ni mail d’ouverture automatique branché. |

## Validation et limites

- Projet `ACTIVE_HEALTHY`, trois tâches de sauvegarde actives ; une archive a déjà été restaurée de façon additive sans erreur.
- Tests serveur dans des transactions annulées, tests fonctions/chiffrement et parcours navigateur en CI. Aucun compte ou souvenir réel supprimé par la revue.
- Services simulés dans les tests navigateur : un essai réel complet, sur plusieurs téléphones et avec une adresse extérieure, reste nécessaire.
- Reconstruction sur projet neuf non exécutée. Adapter l’URL worker présente dans les migrations historiques.
- PostgreSQL annoncé en version 17.6 par l’API : suivre les mises à jour de sécurité Supabase. Aucun changement payant ou de secrets réalisé.

Sources : [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Storage inclus](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size), [suppression Storage](https://supabase.com/docs/guides/storage/management/delete-objects), [mises à jour](https://supabase.com/changelog).

## Complément du 3 octobre

Quota invité lié au navigateur par capsule, contrôle serveur sous verrou, réservations incluses et tentatives idempotentes. Erreurs locales de capture, compte à rebours annulable, autorisation tardive fermée, interruption micro/arrière-plan avec aperçu récupérable. SMTP extérieur non validé ; offre Free et deux petits objets de sauvegarde (2 486 octets) observés avant intervention. Aucun changement de facturation.
