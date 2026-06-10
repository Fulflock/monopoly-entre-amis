// Test de robustesse : des bots jouent des parties entières au hasard.
// Si le moteur plante ou se bloque, on le voit ici.
const { Game } = require('./server/game');

let totalTurns = 0;
let finished = 0;

for (let g = 0; g < 300; g++) {
  const game = new Game('TEST', null);
  const n = 2 + Math.floor(Math.random() * 5);
  const players = [];
  for (let i = 0; i < n; i++) players.push(game.addPlayer('Bot' + i));
  game.start(players[0].id);

  let safety = 5000;
  while (game.phase === 'playing' && safety-- > 0) {
    const cur = game.current();
    totalTurns++;
    try {
      // en dette ? on liquide d'abord, quel que soit le sous-état
      if (cur.money < 0) {
        // vendre les maisons en respectant la règle d'équilibre (plus construites d'abord)
        while (cur.money < 0) {
          const GROUPS = require('./server/board').GROUPS;
          const sellable = game.propsOwnedBy(cur.id).filter((idx) => {
            const st = game.props[idx];
            const sq = game.square(idx);
            if (sq.type !== 'prop' || st.houses < 1) return false;
            return st.houses >= Math.max(...GROUPS[sq.group].map((i) => game.props[i].houses));
          });
          if (!sellable.length) break;
          game.sellHouse(cur.id, sellable[0]);
        }
        for (const idx of game.propsOwnedBy(cur.id)) {
          if (cur.money >= 0) break;
          const sq = game.square(idx);
          const st = game.props[idx];
          if (!st.mortgaged && (sq.type !== 'prop' || !require('./server/board').GROUPS[sq.group].some((i) => game.props[i] && game.props[i].houses > 0))) {
            game.mortgage(cur.id, idx);
          }
        }
        if (cur.money < 0) {
          game.bankrupt(cur.id);
          continue;
        }
      }
      if (game.sub === 'roll') {
        // parfois payer pour sortir de prison
        if (cur.inJail && cur.money >= 50 && Math.random() < 0.3) {
          game.payJailFine(cur.id);
        } else if (cur.inJail && cur.jailCards > 0 && Math.random() < 0.5) {
          game.useJailCard(cur.id);
        } else {
          game.roll(cur.id);
        }
      } else if (game.sub === 'buy') {
        if (cur.money >= game.square(game.pendingBuy).price && Math.random() < 0.8) game.buy(cur.id);
        else game.skipBuy(cur.id);
      } else if (game.sub === 'end') {
        if (cur.money < 0) {
          // tenter de se renflouer : vendre maisons puis hypothéquer
          let fixed = false;
          for (const idx of game.propsOwnedBy(cur.id)) {
            while (cur.money < 0 && game.props[idx].houses > 0) {
              game.sellHouse(cur.id, idx);
              fixed = true;
            }
          }
          for (const idx of game.propsOwnedBy(cur.id)) {
            if (cur.money >= 0) break;
            const sq = game.square(idx);
            const st = game.props[idx];
            if (!st.mortgaged && (sq.type !== 'prop' || !require('./server/board').GROUPS[sq.group].some((i) => game.props[i] && game.props[i].houses > 0))) {
              game.mortgage(cur.id, idx);
              fixed = true;
            }
          }
          if (cur.money < 0) {
            game.bankrupt(cur.id);
            continue;
          }
        }
        // parfois construire
        if (Math.random() < 0.3) {
          for (const idx of game.propsOwnedBy(cur.id)) {
            const sq = game.square(idx);
            if (sq.type === 'prop' && cur.money > sq.houseCost + 200) {
              try { game.build(cur.id, idx); } catch (e) { /* règle non remplie, normal */ }
            }
          }
        }
        game.endTurn(cur.id);
      }
    } catch (err) {
      console.error(`PARTIE ${g} — ERREUR INATTENDUE [sub=${game.sub}, joueur=${cur.name}, pos=${cur.pos}, argent=${cur.money}] :`, err.message);
      console.error(err.stack);
      process.exit(1);
    }
  }
  if (game.phase === 'ended') finished++;
  else if (safety <= 0) {
    // partie très longue, pas forcément un bug, mais vérifions l'état
    if (game.activePlayers().length < 2) {
      console.error(`PARTIE ${g} bloquée avec ${game.activePlayers().length} joueur(s) actif(s) !`);
      process.exit(1);
    }
  }
}

// vérification d'invariants sur une partie témoin
const game = new Game('INV', null);
const a = game.addPlayer('Alice');
const b = game.addPlayer('Bob');
game.start(a.id);
if (game.players.length !== 2) throw new Error('joueurs incorrects');

console.log(`OK — 300 parties simulées, ${finished} terminées par K.O., ${totalTurns} actions jouées sans erreur.`);
