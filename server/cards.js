// Cartes Chance et Caisse de communauté (version française)
// effect types:
//  goto      { pos, collectGo: true }  — aller à une case (passe par Départ sauf indication)
//  gotojail  — aller en prison directement
//  money     { amount }                — recevoir (positif) ou payer (négatif)
//  perplayer { amount }                — recevoir de chaque joueur (positif) / payer à chaque joueur (négatif)
//  repairs   { house, hotel }          — payer par maison / par hôtel
//  back      { steps }                 — reculer
//  neareststation                      — avancer jusqu'à la gare la plus proche
//  jailcard                            — carte « sortie de prison » à conserver

const CHANCE = [
  { text: 'Avancez jusqu’à la case Départ. Recevez 200 €.', effect: { type: 'goto', pos: 0 } },
  { text: 'Rendez-vous Rue de la Paix.', effect: { type: 'goto', pos: 39 } },
  { text: 'Rendez-vous Avenue Henri-Martin. Si vous passez par la case Départ, recevez 200 €.', effect: { type: 'goto', pos: 24 } },
  { text: 'Rendez-vous Boulevard de la Villette. Si vous passez par la case Départ, recevez 200 €.', effect: { type: 'goto', pos: 11 } },
  { text: 'Avancez jusqu’à la gare la plus proche.', effect: { type: 'neareststation' } },
  { text: 'Amende pour excès de vitesse : payez 15 €.', effect: { type: 'money', amount: -15 } },
  { text: 'Allez en prison. Ne passez pas par la case Départ.', effect: { type: 'gotojail' } },
  { text: 'Vous êtes libéré de prison. Cette carte peut être conservée.', effect: { type: 'jailcard' } },
  { text: 'La banque vous verse un dividende de 50 €.', effect: { type: 'money', amount: 50 } },
  { text: 'Faites des réparations dans toutes vos maisons : payez 25 € par maison et 100 € par hôtel.', effect: { type: 'repairs', house: 25, hotel: 100 } },
  { text: 'Reculez de trois cases.', effect: { type: 'back', steps: 3 } },
  { text: 'Votre immeuble et votre prêt rapportent : recevez 150 €.', effect: { type: 'money', amount: 150 } },
  { text: 'Vous êtes élu président du conseil d’administration : payez 50 € à chaque joueur.', effect: { type: 'perplayer', amount: -50 } },
  { text: 'Payez la note du médecin : 50 €.', effect: { type: 'money', amount: -50 } },
];

const COMMUNITY = [
  { text: 'Erreur de la banque en votre faveur : recevez 200 €.', effect: { type: 'money', amount: 200 } },
  { text: 'Frais médicaux : payez 50 €.', effect: { type: 'money', amount: -50 } },
  { text: 'Vente de vos actions : recevez 50 €.', effect: { type: 'money', amount: 50 } },
  { text: 'Vous êtes libéré de prison. Cette carte peut être conservée.', effect: { type: 'jailcard' } },
  { text: 'Allez en prison. Ne passez pas par la case Départ.', effect: { type: 'gotojail' } },
  { text: 'Les contributions vous remboursent : recevez 20 €.', effect: { type: 'money', amount: 20 } },
  { text: 'C’est votre anniversaire : chaque joueur vous donne 10 €.', effect: { type: 'perplayer', amount: 10 } },
  { text: 'Votre assurance-vie arrive à échéance : recevez 100 €.', effect: { type: 'money', amount: 100 } },
  { text: 'Frais d’hôpital : payez 100 €.', effect: { type: 'money', amount: -100 } },
  { text: 'Frais de scolarité : payez 50 €.', effect: { type: 'money', amount: -50 } },
  { text: 'Vous héritez de 100 €.', effect: { type: 'money', amount: 100 } },
  { text: 'Retournez à la case Départ. Recevez 200 €.', effect: { type: 'goto', pos: 0 } },
  { text: 'Vous gagnez le deuxième prix de beauté : recevez 10 €.', effect: { type: 'money', amount: 10 } },
  { text: 'Réparations des rues : payez 40 € par maison et 115 € par hôtel.', effect: { type: 'repairs', house: 40, hotel: 115 } },
];

module.exports = { CHANCE, COMMUNITY };
