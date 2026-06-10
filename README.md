# 🎩 Monopoly entre amis

> Projet de fan, non officiel et **non commercial**, créé pour jouer entre amis. Monopoly est une marque déposée de Hasbro, Inc. Ce projet n'est ni affilié à, ni approuvé par Hasbro.

Un Monopoly en ligne **privé**, pour jouer uniquement entre amis, chacun depuis son navigateur (PC ou téléphone). Règles classiques de l'édition française : rues de Paris, gares, prison, cartes Chance et Caisse de communauté, maisons, hôtels, hypothèques, échanges, faillites.

## Jouer en local (sur ce PC)

Double-clique sur **`Lancer le jeu.bat`** → le jeu s'ouvre dans le navigateur.
Laisse la fenêtre noire ouverte pendant la partie.

> Pour tester à plusieurs sur le même PC : ouvre plusieurs onglets en **navigation privée** (sinon les onglets partagent le même joueur).

## Comment on joue

1. Le premier joueur clique sur **Créer une partie** → il obtient un code (ex. `VXUY`)
2. Il partage le code (ou le lien d'invitation) à ses amis
3. Les amis entrent le code et **Rejoindre** (2 à 6 joueurs)
4. L'hôte lance la partie. Chacun joue à son tour : dés → achat/loyer → fin de tour
5. Clique sur n'importe quelle case pour voir sa fiche (loyers, construire, hypothéquer)
6. Le bouton 🤝 à côté d'un joueur permet de lui proposer un échange
7. Onglet **Chat** pour discuter. Si quelqu'un ferme l'onglet par erreur, il lui suffit de rouvrir le site : il retrouve sa place

## Mettre en ligne (pour jouer à distance)

Le jeu est prêt à être déployé gratuitement sur **Render.com** :

1. Mettre ce dossier sur un dépôt GitHub (privé, c'est très bien)
2. Sur [render.com](https://render.com) : *New* → *Web Service* → connecter le dépôt
3. Render détecte tout automatiquement grâce au fichier `render.yaml` → *Deploy*
4. Tu obtiens une adresse du type `https://monopoly-entre-amis.onrender.com` à partager à tes amis

⚠️ Le plan gratuit de Render endort le serveur après 15 min d'inactivité : la première visite met ~1 min à charger, ensuite c'est instantané. Les parties en cours sont perdues si le serveur s'endort — terminez vos parties d'une traite 🙂

> Pourquoi pas Vercel ? Le jeu utilise une connexion temps réel permanente (Socket.IO) que Vercel ne gère pas. Render, Railway ou Fly.io oui.

## Sous le capot

- `server/index.js` — serveur web + temps réel (Express + Socket.IO)
- `server/game.js` — moteur du jeu (toutes les règles, validées côté serveur)
- `server/board.js` / `server/cards.js` — plateau français et cartes
- `public/` — interface (plateau, lobby, chat, modales)
- `test-engine.js` — `node test-engine.js` fait jouer 300 parties par des robots pour vérifier les règles
