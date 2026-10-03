# Notifications et changements de formule

État au 3 octobre 2026 : les intégrations sont déployées, mais restent **désactivées par défaut**. La création et l’activation gratuites fonctionnent sans ces services. Une capsule du lancement garde ses formats Premium et ses 5 Go pendant les trois ans à compter de l’événement ; elle n’est jamais proposée à un paiement de changement de formule.

## Notifications : Resend

1. Dans Resend, vérifier le domaine d’envoi et ses enregistrements DNS, puis créer une clé d’API limitée à l’envoi.
2. Dans les secrets des Edge Functions du projet Supabase `yejzxsrmqudhvaikaitb`, ajouter `RESEND_API_KEY` et `NOTIFICATION_FROM` (par exemple `La Suite <capsules@laforgeasouvenirs.fr>`, seulement après vérification du domaine). Ne jamais mettre une clé dans les fichiers du site.
3. Dans l’administration La Suite, ouvrir **Notifications et changements de formule**, puis activer les notifications. Tester avec une capsule contrôlée et une adresse externe avant d’en faire une promesse commerciale.
4. L’organisateur peut désactiver ses notifications dans les paramètres de sa capsule.

Le worker existant traite les notifications chaque minute, indépendamment des sauvegardes. Après 10 h, heure de Paris, il prépare au plus un récapitulatif quotidien des nouveaux souvenirs ouverts. Les souvenirs ouverts après ce récapitulatif passent dans celui du lendemain. Rappels avant échéance : 30 et 7 jours, selon la date de création/activation du service. Aucun e-mail de rattrapage des ouvertures antérieures à cette migration. Pas de pièces jointes, contenu de souvenir, jeton invité ou lien de fichier privé dans les messages. Le lien renvoie vers l’espace avec connexion.

Un ID d’envoi stable et un contenu figé rendent les tentatives idempotentes. Six tentatives au plus, espacées progressivement ; après 23 h, le job passe en échec pour ne pas dépasser la fenêtre d’idempotence de 24 h de Resend. L’administration affiche les échecs à vérifier. Un succès API signifie « accepté par le prestataire », pas une preuve de réception. Les lignes envoyées/annulées sont conservées au plus 90 jours lors du passage du worker configuré ; la suppression de la capsule supprime sa file.

**Les e-mails de confirmation et de récupération de compte restent un réglage distinct** : configurer le SMTP personnalisé dans Supabase Auth. Ajouter seulement la clé Resend aux Edge Functions ne répare pas les e-mails Auth.

## Changements de formule : Stripe

Ce module prépare le passage entre **capsules déjà payantes** : Essentiel → Plus (+5 €), Essentiel → Premium (+15 €), Plus → Premium (+10 €). La vente initiale/activation payante, la facturation commerciale et les conditions de vente restent à finaliser avant un lancement payant. Ne pas désactiver le lancement gratuit pour tester ce module.

1. Créer/configurer Stripe et utiliser d’abord les clés de test.
2. Ajouter `STRIPE_SECRET_KEY` dans les secrets Supabase.
3. Créer un endpoint webhook Stripe vers `https://yejzxsrmqudhvaikaitb.supabase.co/functions/v1/suite-billing`, pour `checkout.session.completed` et `checkout.session.async_payment_succeeded`. Ajouter son secret comme `STRIPE_WEBHOOK_SECRET`.
4. Activer **Changements de formule payants** dans l’administration seulement pour les essais avec des capsules payantes contrôlées. Une présence de clé n’atteste pas la validité de la configuration ; vérifier un paiement de test, une signature rejetée, la livraison/relecture du webhook et un remboursement de test avant le passage en production.

Le serveur calcule la différence et verrouille une commande en cours par capsule. Le retour navigateur n’accorde aucun droit. Seul un webhook signé, suivi d’une lecture de la session Stripe et de la vérification du montant/devise/commande, permet le changement. Les rejeux ne créditent pas deux fois. La date de l’événement et les dates des souvenirs restent identiques. Si la capsule a expiré, été suspendue ou changé entre-temps, le paiement est placé en remboursement ; l’administration affiche ceux nécessitant une vérification. Aucun changement après la période de dépôt n’est proposé. La désactivation empêche les nouvelles commandes, mais les paiements déjà engagés restent traités par webhook.

Ne pas renseigner de clé réelle dans une conversation, un commit ou les tests.

## Téléchargement des souvenirs

Le bouton **Télécharger les souvenirs ouverts** crée un ZIP standard : `Vos-messages.txt` et les médias ouverts. Le RPC vérifie le propriétaire et les trois ans d’accès. Les souvenirs futurs sont exclus, y compris leurs textes et chemins de fichiers.

Chrome/Edge sur ordinateur : écriture directe sur disque, compatible avec des archives de plusieurs Go grâce au ZIP64. Autres navigateurs/téléphones : jusqu’à 150 Mo ; au-delà, l’interface invite à utiliser un ordinateur pour le téléchargement groupé. Les téléchargements individuels restent disponibles. Un fichier manquant interrompt l’export au lieu de créer une archive déclarée complète.

## Références officielles

- [Resend : envoi d’e-mail](https://resend.com/docs/api-reference/emails/send-email)
- [Resend : idempotence sur 24 h](https://resend.com/changelog/idempotency-keys)
- [Stripe : Checkout](https://docs.stripe.com/api/checkout/sessions/create)
- [Supabase : signatures Stripe dans une Edge Function](https://supabase.com/docs/guides/functions/examples/stripe-webhooks)
- [Supabase Auth : SMTP personnalisé](https://supabase.com/docs/guides/auth/auth-smtp)

Si une capsule ou son compte est supprimé pendant un paiement, les identifiants de commande et du prestataire restent privés pour permettre le remboursement du paiement confirmé tardivement. Aucun souvenir ou e-mail client n’est conservé dans ces commandes. Tester également ce cas avant de vendre les changements de formule. Un rappel déjà préparé est annulé si la date de conservation de la capsule a changé.
