// Plateau Monopoly classique français (édition parisienne)
// type: 'go' | 'prop' | 'station' | 'utility' | 'chance' | 'community' | 'tax' | 'jail' | 'gotojail' | 'parking'

const BOARD = [
  { idx: 0, type: 'go', name: 'Départ' },
  { idx: 1, type: 'prop', name: 'Boulevard de Belleville', group: 'brown', price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50 },
  { idx: 2, type: 'community', name: 'Caisse de communauté' },
  { idx: 3, type: 'prop', name: 'Rue Lecourbe', group: 'brown', price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50 },
  { idx: 4, type: 'tax', name: 'Impôts sur le revenu', amount: 200 },
  { idx: 5, type: 'station', name: 'Gare Montparnasse', price: 200 },
  { idx: 6, type: 'prop', name: 'Rue de Vaugirard', group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  { idx: 7, type: 'chance', name: 'Chance' },
  { idx: 8, type: 'prop', name: 'Rue de Courcelles', group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
  { idx: 9, type: 'prop', name: 'Avenue de la République', group: 'lightblue', price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50 },
  { idx: 10, type: 'jail', name: 'Prison' },
  { idx: 11, type: 'prop', name: 'Boulevard de la Villette', group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  { idx: 12, type: 'utility', name: 'Compagnie d’électricité', price: 150 },
  { idx: 13, type: 'prop', name: 'Avenue de Neuilly', group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
  { idx: 14, type: 'prop', name: 'Rue de Paradis', group: 'pink', price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100 },
  { idx: 15, type: 'station', name: 'Gare de Lyon', price: 200 },
  { idx: 16, type: 'prop', name: 'Avenue Mozart', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  { idx: 17, type: 'community', name: 'Caisse de communauté' },
  { idx: 18, type: 'prop', name: 'Boulevard Saint-Michel', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
  { idx: 19, type: 'prop', name: 'Place Pigalle', group: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100 },
  { idx: 20, type: 'parking', name: 'Parc gratuit' },
  { idx: 21, type: 'prop', name: 'Avenue Matignon', group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  { idx: 22, type: 'chance', name: 'Chance' },
  { idx: 23, type: 'prop', name: 'Boulevard Malesherbes', group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
  { idx: 24, type: 'prop', name: 'Avenue Henri-Martin', group: 'red', price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150 },
  { idx: 25, type: 'station', name: 'Gare du Nord', price: 200 },
  { idx: 26, type: 'prop', name: 'Faubourg Saint-Honoré', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  { idx: 27, type: 'prop', name: 'Place de la Bourse', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
  { idx: 28, type: 'utility', name: 'Compagnie des eaux', price: 150 },
  { idx: 29, type: 'prop', name: 'Rue La Fayette', group: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150 },
  { idx: 30, type: 'gotojail', name: 'Allez en prison' },
  { idx: 31, type: 'prop', name: 'Avenue de Breteuil', group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  { idx: 32, type: 'prop', name: 'Avenue Foch', group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
  { idx: 33, type: 'community', name: 'Caisse de communauté' },
  { idx: 34, type: 'prop', name: 'Boulevard des Capucines', group: 'green', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200 },
  { idx: 35, type: 'station', name: 'Gare Saint-Lazare', price: 200 },
  { idx: 36, type: 'chance', name: 'Chance' },
  { idx: 37, type: 'prop', name: 'Avenue des Champs-Élysées', group: 'darkblue', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200 },
  { idx: 38, type: 'tax', name: 'Taxe de luxe', amount: 100 },
  { idx: 39, type: 'prop', name: 'Rue de la Paix', group: 'darkblue', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200 },
];

const GROUPS = {};
for (const sq of BOARD) {
  if (sq.type === 'prop') {
    if (!GROUPS[sq.group]) GROUPS[sq.group] = [];
    GROUPS[sq.group].push(sq.idx);
  }
}

const STATIONS = BOARD.filter((s) => s.type === 'station').map((s) => s.idx);
const UTILITIES = BOARD.filter((s) => s.type === 'utility').map((s) => s.idx);

module.exports = { BOARD, GROUPS, STATIONS, UTILITIES };
