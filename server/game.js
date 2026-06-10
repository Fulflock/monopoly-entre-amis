// Moteur de jeu Monopoly — toute la logique des règles vit ici.
// Le serveur est l'unique source de vérité : les clients envoient des intentions,
// le moteur valide et diffuse l'état complet.

const crypto = require('crypto');
const { BOARD, GROUPS, STATIONS, UTILITIES } = require('./board');
const { CHANCE, COMMUNITY } = require('./cards');

const START_MONEY = 1500;
const GO_SALARY = 200;
const JAIL_FINE = 50;
const JAIL_POS = 10;
const MAX_PLAYERS = 6;

const TOKENS = ['🎩', '🐕', '🚗', '🚢', '👢', '🐈', '🎲', '🛵'];
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Game {
  constructor(code, onChange) {
    this.code = code;
    this.onChange = onChange; // appelé après chaque changement d'état
    this.phase = 'lobby'; // lobby | playing | ended
    this.players = []; // { id, token(secret), name, emoji, color, money, pos, inJail, jailTurns, jailCards, bankrupt, connected, lastCreditor }
    this.hostId = null;
    this.props = {}; // idx -> { owner, houses (0-5, 5=hôtel), mortgaged }
    this.turn = 0; // index dans players
    this.sub = 'roll'; // roll | buy | end  (sous-état du tour)
    this.dice = null;
    this.doublesCount = 0;
    this.pendingDoubles = false; // doubles en attente après une décision d'achat
    this.pendingBuy = null; // idx de la case en attente de décision d'achat
    this.chanceDeck = shuffle(CHANCE);
    this.communityDeck = shuffle(COMMUNITY);
    this.log = [];
    this.chatLog = [];
    this.trade = null; // { id, from, to, giveMoney, giveProps, wantMoney, wantProps }
    this.winner = null;
    this.lastActivity = Date.now();
  }

  // ---------- utilitaires ----------

  touch() {
    this.lastActivity = Date.now();
  }

  emit() {
    this.touch();
    if (this.onChange) this.onChange(this);
  }

  addLog(text, kind = 'info') {
    this.log.push({ text, kind, t: Date.now() });
    if (this.log.length > 200) this.log.shift();
  }

  playerById(id) {
    return this.players.find((p) => p.id === id);
  }

  playerByToken(token) {
    return this.players.find((p) => p.token === token);
  }

  current() {
    return this.players[this.turn];
  }

  activePlayers() {
    return this.players.filter((p) => !p.bankrupt);
  }

  assertTurn(playerId) {
    const p = this.current();
    if (!p || p.id !== playerId) throw new Error('Ce n’est pas ton tour.');
    return p;
  }

  square(idx) {
    return BOARD[idx];
  }

  ownerOf(idx) {
    const st = this.props[idx];
    return st && st.owner ? this.playerById(st.owner) : null;
  }

  propsOwnedBy(playerId) {
    return Object.entries(this.props)
      .filter(([, st]) => st.owner === playerId)
      .map(([idx]) => Number(idx));
  }

  ownsFullGroup(playerId, group) {
    return GROUPS[group].every((i) => this.props[i] && this.props[i].owner === playerId);
  }

  // ---------- lobby ----------

  addPlayer(name, emoji) {
    if (this.phase !== 'lobby') throw new Error('La partie a déjà commencé.');
    if (this.players.length >= MAX_PLAYERS) throw new Error('La partie est pleine (6 joueurs max).');
    name = String(name || '').trim().slice(0, 20);
    if (!name) throw new Error('Il faut un pseudo.');
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
      throw new Error('Ce pseudo est déjà pris dans cette partie.');

    const usedEmojis = this.players.map((p) => p.emoji);
    if (!emoji || usedEmojis.includes(emoji)) {
      emoji = TOKENS.find((t) => !usedEmojis.includes(t)) || '🎲';
    }
    const player = {
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      name,
      emoji,
      color: COLORS[this.players.length % COLORS.length],
      money: START_MONEY,
      pos: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
      connected: true,
      lastCreditor: null,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    this.addLog(`${player.emoji} ${player.name} a rejoint la partie.`);
    this.emit();
    return player;
  }

  removeFromLobby(playerId) {
    if (this.phase !== 'lobby') return;
    const i = this.players.findIndex((p) => p.id === playerId);
    if (i === -1) return;
    const [gone] = this.players.splice(i, 1);
    this.addLog(`${gone.name} a quitté la partie.`);
    if (this.hostId === gone.id && this.players.length) this.hostId = this.players[0].id;
    this.emit();
  }

  start(playerId) {
    if (this.phase !== 'lobby') throw new Error('Déjà commencé.');
    if (playerId !== this.hostId) throw new Error('Seul l’hôte peut lancer la partie.');
    if (this.players.length < 2) throw new Error('Il faut au moins 2 joueurs.');
    this.phase = 'playing';
    this.turn = Math.floor(Math.random() * this.players.length);
    this.sub = 'roll';
    this.addLog(`🎉 La partie commence ! ${this.current().emoji} ${this.current().name} joue en premier.`);
    this.emit();
  }

  // ---------- déroulement du tour ----------

  roll(playerId) {
    if (this.phase !== 'playing') throw new Error('La partie n’est pas en cours.');
    const p = this.assertTurn(playerId);
    if (this.sub !== 'roll') throw new Error('Tu as déjà lancé les dés.');
    if (p.money < 0) throw new Error('Tu dois d’abord régler tes dettes (hypothèque ou vente).');

    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    this.dice = [d1, d2];
    const isDouble = d1 === d2;

    if (p.inJail) {
      this.addLog(`${p.emoji} ${p.name} lance les dés en prison : ${d1} + ${d2}.`);
      if (isDouble) {
        p.inJail = false;
        p.jailTurns = 0;
        this.addLog(`🔓 Double ! ${p.name} sort de prison.`);
        this.moveAndResolve(p, d1 + d2, { noDoubleReplay: true });
      } else {
        p.jailTurns++;
        if (p.jailTurns >= 3) {
          this.charge(p, JAIL_FINE, null, `amende de sortie de prison`);
          p.inJail = false;
          p.jailTurns = 0;
          this.addLog(`💸 3e échec : ${p.name} paie ${JAIL_FINE} € et sort de prison.`);
          this.moveAndResolve(p, d1 + d2, { noDoubleReplay: true });
        } else {
          this.addLog(`🔒 Pas de double, ${p.name} reste en prison (essai ${p.jailTurns}/3).`);
          this.sub = 'end';
        }
      }
      this.emit();
      return;
    }

    if (isDouble) {
      this.doublesCount++;
      if (this.doublesCount >= 3) {
        this.addLog(`🚨 ${p.emoji} ${p.name} fait 3 doubles d’affilée et file en prison !`);
        this.sendToJail(p);
        this.sub = 'end';
        this.doublesCount = 0;
        this.emit();
        return;
      }
    }

    this.addLog(`${p.emoji} ${p.name} lance les dés : ${d1} + ${d2} = ${d1 + d2}${isDouble ? ' (double !)' : ''}.`);
    this.moveAndResolve(p, d1 + d2, { noDoubleReplay: !isDouble });
    this.emit();
  }

  moveAndResolve(p, steps, { noDoubleReplay }) {
    const newPos = (p.pos + steps) % 40;
    if (newPos < p.pos) {
      p.money += GO_SALARY;
      this.addLog(`💰 ${p.name} passe par la case Départ et reçoit ${GO_SALARY} €.`);
    }
    p.pos = newPos;
    this.resolveSquare(p, { afterDoubles: !noDoubleReplay });
  }

  // Résout la case où se trouve le joueur. afterDoubles: si true et pas d'événement
  // bloquant, le joueur rejouera.
  resolveSquare(p, { afterDoubles }) {
    const sq = this.square(p.pos);
    let nextSub = afterDoubles ? 'roll' : 'end';

    switch (sq.type) {
      case 'go':
      case 'jail':
      case 'parking':
        this.addLog(`${p.emoji} ${p.name} arrive sur « ${sq.name} ».`);
        break;

      case 'tax':
        this.charge(p, sq.amount, null, sq.name);
        this.addLog(`💸 ${p.name} paie ${sq.amount} € (${sq.name}).`);
        break;

      case 'gotojail':
        this.sendToJail(p);
        nextSub = 'end'; // pas de relance après la prison
        break;

      case 'prop':
      case 'station':
      case 'utility': {
        const st = this.props[p.pos];
        if (!st || !st.owner) {
          // case libre → décision d'achat (le joueur peut hypothéquer pour financer)
          this.addLog(`🏠 ${p.name} arrive sur « ${sq.name} » (à vendre : ${sq.price} €).`);
          this.pendingBuy = p.pos;
          this.pendingDoubles = afterDoubles;
          this.sub = 'buy';
          return;
        } else if (st.owner === p.id) {
          this.addLog(`${p.emoji} ${p.name} est chez lui : « ${sq.name} ».`);
        } else if (st.mortgaged) {
          this.addLog(`${p.name} arrive sur « ${sq.name} » (hypothéquée, pas de loyer).`);
        } else {
          const owner = this.playerById(st.owner);
          const rent = this.computeRent(p.pos);
          this.charge(p, rent, owner, `loyer de « ${sq.name} »`);
          this.addLog(`💶 ${p.name} paie ${rent} € de loyer à ${owner.name} (« ${sq.name} »).`);
        }
        break;
      }

      case 'chance':
        this.drawCard(p, 'chance');
        return; // drawCard gère this.sub
      case 'community':
        this.drawCard(p, 'community');
        return;
    }

    this.sub = nextSub;
    if (nextSub === 'roll') this.addLog(`🎲 Double : ${p.name} rejoue !`);
    this.checkDebt(p);
  }

  computeRent(idx) {
    const sq = this.square(idx);
    const st = this.props[idx];
    const ownerId = st.owner;

    if (sq.type === 'station') {
      const owned = STATIONS.filter((i) => this.props[i] && this.props[i].owner === ownerId && !this.props[i].mortgaged).length;
      return 25 * Math.pow(2, owned - 1);
    }
    if (sq.type === 'utility') {
      const owned = UTILITIES.filter((i) => this.props[i] && this.props[i].owner === ownerId && !this.props[i].mortgaged).length;
      const diceSum = this.dice ? this.dice[0] + this.dice[1] : 7;
      return diceSum * (owned === 2 ? 10 : 4);
    }
    // propriété classique
    if (st.houses > 0) return sq.rent[st.houses];
    const full = this.ownsFullGroup(ownerId, sq.group);
    return full ? sq.rent[0] * 2 : sq.rent[0];
  }

  drawCard(p, deckName) {
    const deck = deckName === 'chance' ? this.chanceDeck : this.communityDeck;
    const card = deck.shift();
    deck.push(card); // remise en bas du paquet
    const label = deckName === 'chance' ? 'Chance' : 'Caisse de communauté';
    this.addLog(`🃏 ${p.name} tire une carte ${label} : « ${card.text} »`, 'card');

    // si on est arrivé ici après un double, le joueur rejouera (sauf prison)
    const replay = this.doublesCount > 0 && this.dice && this.dice[0] === this.dice[1] && !p.inJail;

    const e = card.effect;
    switch (e.type) {
      case 'money':
        if (e.amount >= 0) p.money += e.amount;
        else this.charge(p, -e.amount, null, label);
        break;
      case 'perplayer': {
        for (const other of this.activePlayers()) {
          if (other.id === p.id) continue;
          if (e.amount > 0) {
            this.charge(other, e.amount, p, `anniversaire de ${p.name}`);
          } else {
            this.charge(p, -e.amount, other, label);
          }
        }
        break;
      }
      case 'jailcard':
        p.jailCards++;
        break;
      case 'gotojail':
        this.sendToJail(p);
        this.sub = 'end';
        this.checkDebt(p);
        return;
      case 'repairs': {
        let total = 0;
        for (const idx of this.propsOwnedBy(p.id)) {
          const st = this.props[idx];
          if (st.houses === 5) total += e.hotel;
          else total += st.houses * e.house;
        }
        if (total > 0) {
          this.charge(p, total, null, 'réparations');
          this.addLog(`🔧 ${p.name} paie ${total} € de réparations.`);
        }
        break;
      }
      case 'goto': {
        if (e.pos <= p.pos && e.pos !== p.pos) {
          p.money += GO_SALARY;
          this.addLog(`💰 ${p.name} passe par la case Départ et reçoit ${GO_SALARY} €.`);
        }
        p.pos = e.pos;
        this.resolveSquare(p, { afterDoubles: replay });
        return;
      }
      case 'back': {
        p.pos = (p.pos - e.steps + 40) % 40;
        this.resolveSquare(p, { afterDoubles: replay });
        return;
      }
      case 'neareststation': {
        const next = STATIONS.find((s) => s > p.pos);
        if (next === undefined) {
          p.money += GO_SALARY;
          this.addLog(`💰 ${p.name} passe par la case Départ et reçoit ${GO_SALARY} €.`);
          p.pos = STATIONS[0];
        } else {
          p.pos = next;
        }
        this.resolveSquare(p, { afterDoubles: replay });
        return;
      }
    }

    this.sub = replay ? 'roll' : 'end';
    if (replay) this.addLog(`🎲 Double : ${p.name} rejoue !`);
    this.checkDebt(p);
  }

  sendToJail(p) {
    p.pos = JAIL_POS;
    p.inJail = true;
    p.jailTurns = 0;
    this.doublesCount = 0;
    this.addLog(`🚔 ${p.emoji} ${p.name} va en prison.`);
  }

  // Débite un joueur. creditor = joueur qui reçoit (ou null pour la banque).
  // Le solde peut devenir négatif : le joueur devra hypothéquer/vendre ou faire faillite.
  charge(p, amount, creditor, reason) {
    p.money -= amount;
    if (creditor) creditor.money += amount;
    if (p.money < 0) {
      p.lastCreditor = creditor ? creditor.id : null;
    }
  }

  checkDebt(p) {
    if (p.money < 0) {
      this.addLog(
        `⚠️ ${p.name} est à découvert (${p.money} €). Il doit hypothéquer, vendre des maisons ou déclarer faillite.`,
        'warn'
      );
    }
  }

  buy(playerId) {
    const p = this.assertTurn(playerId);
    if (this.sub !== 'buy' || this.pendingBuy === null) throw new Error('Rien à acheter.');
    const idx = this.pendingBuy;
    const sq = this.square(idx);
    if (p.money < sq.price) throw new Error('Pas assez d’argent.');
    p.money -= sq.price;
    this.props[idx] = { owner: p.id, houses: 0, mortgaged: false };
    this.addLog(`✅ ${p.emoji} ${p.name} achète « ${sq.name} » pour ${sq.price} €.`);
    this.finishBuyPhase(p);
  }

  skipBuy(playerId) {
    const p = this.assertTurn(playerId);
    if (this.sub !== 'buy' || this.pendingBuy === null) throw new Error('Rien à refuser.');
    const sq = this.square(this.pendingBuy);
    this.addLog(`${p.name} ne veut pas de « ${sq.name} ».`);
    this.finishBuyPhase(p);
  }

  finishBuyPhase(p) {
    const replay = this.pendingDoubles;
    this.pendingBuy = null;
    this.pendingDoubles = false;
    this.sub = replay ? 'roll' : 'end';
    if (replay) this.addLog(`🎲 Double : ${p.name} rejoue !`);
    this.checkDebt(p);
    this.emit();
  }

  endTurn(playerId) {
    const p = this.assertTurn(playerId);
    if (this.sub !== 'end') throw new Error('Termine d’abord ton action en cours.');
    if (p.money < 0) throw new Error('Tu es à découvert : hypothèque, vends ou déclare faillite avant de finir ton tour.');
    this.advanceTurn();
    this.emit();
  }

  advanceTurn() {
    this.doublesCount = 0;
    this.dice = null;
    this.pendingBuy = null;
    this.pendingDoubles = false;
    let next = this.turn;
    for (let i = 0; i < this.players.length; i++) {
      next = (next + 1) % this.players.length;
      if (!this.players[next].bankrupt) break;
    }
    this.turn = next;
    this.sub = 'roll';
    const p = this.current();
    this.addLog(`👉 Au tour de ${p.emoji} ${p.name}.`);
  }

  // ---------- prison : options avant de lancer ----------

  payJailFine(playerId) {
    const p = this.assertTurn(playerId);
    if (!p.inJail || this.sub !== 'roll') throw new Error('Tu n’es pas en prison.');
    if (p.money < JAIL_FINE) throw new Error('Pas assez d’argent.');
    p.money -= JAIL_FINE;
    p.inJail = false;
    p.jailTurns = 0;
    this.addLog(`💸 ${p.name} paie ${JAIL_FINE} € et sort de prison.`);
    this.emit();
  }

  useJailCard(playerId) {
    const p = this.assertTurn(playerId);
    if (!p.inJail || this.sub !== 'roll') throw new Error('Tu n’es pas en prison.');
    if (p.jailCards < 1) throw new Error('Tu n’as pas de carte « sortie de prison ».');
    p.jailCards--;
    p.inJail = false;
    p.jailTurns = 0;
    this.addLog(`🃏 ${p.name} utilise sa carte « Vous êtes libéré de prison ».`);
    this.emit();
  }

  // ---------- constructions / hypothèques (possibles à tout moment) ----------

  build(playerId, idx) {
    const p = this.playerById(playerId);
    if (!p || p.bankrupt) throw new Error('Joueur invalide.');
    const sq = this.square(idx);
    if (!sq || sq.type !== 'prop') throw new Error('On ne construit que sur les rues.');
    const st = this.props[idx];
    if (!st || st.owner !== playerId) throw new Error('Ce n’est pas ta propriété.');
    if (!this.ownsFullGroup(playerId, sq.group)) throw new Error('Il faut posséder toutes les rues du groupe.');
    if (GROUPS[sq.group].some((i) => this.props[i].mortgaged)) throw new Error('Impossible : une rue du groupe est hypothéquée.');
    if (st.houses >= 5) throw new Error('Il y a déjà un hôtel.');
    if (p.money < sq.houseCost) throw new Error('Pas assez d’argent.');
    // règle de construction équilibrée
    const minHouses = Math.min(...GROUPS[sq.group].map((i) => this.props[i].houses));
    if (st.houses > minHouses) throw new Error('Construis d’abord sur les autres rues du groupe (construction équilibrée).');
    p.money -= sq.houseCost;
    st.houses++;
    this.addLog(`🏗️ ${p.name} construit ${st.houses === 5 ? 'un hôtel' : `une maison (${st.houses})`} sur « ${sq.name} ».`);
    this.emit();
  }

  sellHouse(playerId, idx) {
    const p = this.playerById(playerId);
    if (!p || p.bankrupt) throw new Error('Joueur invalide.');
    const sq = this.square(idx);
    const st = this.props[idx];
    if (!st || st.owner !== playerId) throw new Error('Ce n’est pas ta propriété.');
    if (st.houses < 1) throw new Error('Rien à vendre ici.');
    const maxHouses = Math.max(...GROUPS[sq.group].map((i) => this.props[i].houses));
    if (st.houses < maxHouses) throw new Error('Vends d’abord sur les rues les plus construites du groupe.');
    st.houses--;
    p.money += Math.floor(sq.houseCost / 2);
    this.addLog(`🏚️ ${p.name} vend ${st.houses === 4 ? 'son hôtel' : 'une maison'} sur « ${sq.name} » (+${Math.floor(sq.houseCost / 2)} €).`);
    this.emit();
  }

  mortgage(playerId, idx) {
    const p = this.playerById(playerId);
    if (!p || p.bankrupt) throw new Error('Joueur invalide.');
    const sq = this.square(idx);
    const st = this.props[idx];
    if (!st || st.owner !== playerId) throw new Error('Ce n’est pas ta propriété.');
    if (st.mortgaged) throw new Error('Déjà hypothéquée.');
    if (sq.type === 'prop' && GROUPS[sq.group].some((i) => this.props[i] && this.props[i].houses > 0))
      throw new Error('Vends d’abord toutes les maisons du groupe.');
    st.mortgaged = true;
    p.money += Math.floor(sq.price / 2);
    this.addLog(`🏦 ${p.name} hypothèque « ${sq.name} » (+${Math.floor(sq.price / 2)} €).`);
    this.emit();
  }

  unmortgage(playerId, idx) {
    const p = this.playerById(playerId);
    if (!p || p.bankrupt) throw new Error('Joueur invalide.');
    const sq = this.square(idx);
    const st = this.props[idx];
    if (!st || st.owner !== playerId) throw new Error('Ce n’est pas ta propriété.');
    if (!st.mortgaged) throw new Error('Pas hypothéquée.');
    const cost = Math.ceil(sq.price * 0.55); // moitié + 10% d'intérêts
    if (p.money < cost) throw new Error(`Il faut ${cost} € pour lever l’hypothèque.`);
    p.money -= cost;
    st.mortgaged = false;
    this.addLog(`🏦 ${p.name} lève l’hypothèque de « ${sq.name} » (−${cost} €).`);
    this.emit();
  }

  // ---------- échanges ----------

  proposeTrade(playerId, { to, giveMoney, giveProps, wantMoney, wantProps }) {
    const from = this.playerById(playerId);
    const target = this.playerById(to);
    if (!from || from.bankrupt) throw new Error('Joueur invalide.');
    if (!target || target.bankrupt || target.id === from.id) throw new Error('Destinataire invalide.');
    if (this.trade) throw new Error('Un échange est déjà en cours, attends qu’il soit réglé.');

    giveMoney = Math.max(0, Math.floor(Number(giveMoney) || 0));
    wantMoney = Math.max(0, Math.floor(Number(wantMoney) || 0));
    giveProps = (giveProps || []).map(Number);
    wantProps = (wantProps || []).map(Number);

    if (giveMoney > from.money) throw new Error('Tu ne peux pas offrir plus que ce que tu as.');
    if (!giveMoney && !wantMoney && !giveProps.length && !wantProps.length) throw new Error('Échange vide.');

    const validate = (idxs, ownerId, who) => {
      for (const idx of idxs) {
        const st = this.props[idx];
        const sq = this.square(idx);
        if (!st || st.owner !== ownerId) throw new Error(`« ${sq ? sq.name : idx} » n’appartient pas à ${who}.`);
        if (sq.type === 'prop' && GROUPS[sq.group].some((i) => this.props[i] && this.props[i].houses > 0))
          throw new Error(`Impossible d’échanger « ${sq.name} » : il y a des maisons sur ce groupe.`);
      }
    };
    validate(giveProps, from.id, from.name);
    validate(wantProps, target.id, target.name);

    this.trade = { id: crypto.randomUUID(), from: from.id, to: target.id, giveMoney, giveProps, wantMoney, wantProps };
    this.addLog(`🤝 ${from.name} propose un échange à ${target.name}.`);
    this.emit();
  }

  respondTrade(playerId, accept) {
    if (!this.trade) throw new Error('Aucun échange en cours.');
    const t = this.trade;
    const from = this.playerById(t.from);
    const to = this.playerById(t.to);
    if (playerId !== t.to && !(playerId === t.from && !accept)) throw new Error('Cet échange ne te concerne pas.');

    if (!accept) {
      this.addLog(`❌ Échange ${playerId === t.from ? 'annulé par ' + from.name : 'refusé par ' + to.name}.`);
      this.trade = null;
      this.emit();
      return;
    }
    if (to.money < t.wantMoney) throw new Error('Tu n’as pas assez d’argent pour cet échange.');
    if (from.money < t.giveMoney) throw new Error(`${from.name} n’a plus assez d’argent.`);

    from.money -= t.giveMoney;
    to.money += t.giveMoney;
    to.money -= t.wantMoney;
    from.money += t.wantMoney;
    for (const idx of t.giveProps) this.props[idx].owner = to.id;
    for (const idx of t.wantProps) this.props[idx].owner = from.id;
    this.addLog(`✅ Échange conclu entre ${from.name} et ${to.name} !`);
    this.trade = null;
    this.emit();
  }

  // ---------- faillite ----------

  bankrupt(playerId) {
    const p = this.playerById(playerId);
    if (!p || p.bankrupt) throw new Error('Joueur invalide.');
    if (p.money >= 0) throw new Error('Tu n’es pas à découvert, pas besoin de faillite.');

    const creditor = p.lastCreditor ? this.playerById(p.lastCreditor) : null;
    for (const idx of this.propsOwnedBy(p.id)) {
      const st = this.props[idx];
      const sq = this.square(idx);
      // les maisons retournent à la banque (remboursées moitié prix au créancier le cas échéant)
      if (st.houses > 0 && creditor) creditor.money += Math.floor((sq.houseCost * st.houses) / 2);
      st.houses = 0;
      if (creditor) {
        st.owner = creditor.id;
      } else {
        delete this.props[idx];
      }
    }
    if (creditor) {
      if (p.money > 0) creditor.money += p.money;
      creditor.jailCards += p.jailCards;
    }
    p.jailCards = 0;
    p.money = 0;
    p.bankrupt = true;
    this.addLog(`💀 ${p.emoji} ${p.name} fait faillite${creditor ? ` ! Ses biens vont à ${creditor.name}.` : ' ! Ses biens retournent à la banque.'}`, 'warn');

    if (this.trade && (this.trade.from === p.id || this.trade.to === p.id)) this.trade = null;

    const alive = this.activePlayers();
    if (alive.length === 1) {
      this.phase = 'ended';
      this.winner = alive[0].id;
      this.addLog(`🏆 ${alive[0].emoji} ${alive[0].name} remporte la partie !`, 'win');
    } else if (this.current().id === p.id) {
      this.advanceTurn();
    }
    this.emit();
  }

  // ---------- chat ----------

  chat(playerId, text) {
    const p = this.playerById(playerId);
    if (!p) return;
    text = String(text || '').trim().slice(0, 300);
    if (!text) return;
    this.chatLog.push({ from: p.name, emoji: p.emoji, color: p.color, text, t: Date.now() });
    if (this.chatLog.length > 100) this.chatLog.shift();
    this.emit();
  }

  // ---------- sérialisation (sans les tokens secrets) ----------

  publicState() {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        color: p.color,
        money: p.money,
        pos: p.pos,
        inJail: p.inJail,
        jailTurns: p.jailTurns,
        jailCards: p.jailCards,
        bankrupt: p.bankrupt,
        connected: p.connected,
      })),
      props: this.props,
      turn: this.turn,
      sub: this.sub,
      dice: this.dice,
      pendingBuy: this.pendingBuy,
      trade: this.trade,
      log: this.log.slice(-60),
      chatLog: this.chatLog.slice(-50),
      winner: this.winner,
    };
  }
}

module.exports = { Game, BOARD, MAX_PLAYERS, TOKENS };
