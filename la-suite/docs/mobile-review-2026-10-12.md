# Revue du parcours smartphone — 12 octobre 2026

## Périmètre
Lecture du parcours organisateur et invité, personnalisation, fenêtres de paramètres, capture audio/vidéo, réception des souvenirs et ressources locales. Cette revue porte sur le code ; elle ne remplace pas une validation sur téléphone.

## Corrections
- Les messages des paramètres et de suppression deviennent visibles lorsqu'ils contiennent du texte.
- Les états du téléchargement apparaissent dans la fenêtre active, plutôt que derrière elle.
- Le changement de date ne peut pas être envoyé plusieurs fois en parallèle ; la fermeture et les autres actions sont bloquées pendant sa sauvegarde.
- La fenêtre des paramètres se ferme après la suppression d'une autre capsule ; le retour du focus utilise désormais le bouton des paramètres.
- L'ancien aperçu d'accueil utilise également le fond réservant une zone au logo.
- Suppression de mesures de lignes devenues inutiles dans la réception.

## Vérifications effectuées
- Syntaxe des 16 fichiers JavaScript : aucune erreur.
- Références locales des scripts et feuilles de style des pages HTML : aucune ressource manquante.
- Les 11 thèmes fournissent un fond avec une zone centrale basse dégagée, utilisant leur couleur et leur image existante.
- Une valeur de fond personnalisé non autorisée est rejetée par le constructeur de fond.
- Contrôle des différences Git sans erreur d'espacement.
- Lecture des protections de capture (compte à rebours annulable, arrêt des pistes, durée et taille), des souvenirs verrouillés et de la confirmation de suppression.

## À valider sur appareil
Aucun navigateur de test n'est installé dans l'environnement : aucune validation visuelle ou de session authentifiée n'est revendiquée.
- Chrome Android et Safari iPhone : affichage avec barre d'adresse ouverte/fermée, clavier, zoom et plein écran.
- Autorisation puis refus du micro/de la caméra, interruption d'enregistrement et reprise.
- Dépôt réel, lecture audio/vidéo, téléchargement et impression.
- Changement de date d'une capsule brouillon et maintien du verrouillage après activation.
- Suppression avec confirmation sur une capsule de test uniquement.

La date affichée dans un souvenir est l'heure du dépôt serveur. La revue n'a créé ni supprimé de données utilisateur et n'a modifié aucune règle de la base.
