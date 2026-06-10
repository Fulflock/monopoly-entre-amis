// Serveur web + temps réel du Monopoly entre amis.
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Game } = require('./game');
const { BOARD } = require('./board');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/api/board', (req, res) => res.json(BOARD));

const games = new Map(); // code -> Game

// Nettoyage des parties inactives depuis plus de 24 h
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [code, game] of games) {
    if (game.lastActivity < cutoff) games.delete(code);
  }
}, 60 * 60 * 1000);

function makeCode() {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans I/L/O/0/1 (lisibilité)
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  } while (games.has(code));
  return code;
}

function broadcast(game) {
  io.to(game.code).emit('state', game.publicState());
}

io.on('connection', (socket) => {
  // contexte de la connexion
  let game = null;
  let player = null;

  const safe = (fn) => (payload, cb) => {
    try {
      fn(payload || {});
      if (cb) cb({ ok: true });
    } catch (err) {
      if (cb) cb({ ok: false, error: err.message });
      else socket.emit('errorMsg', err.message);
    }
  };

  socket.on('create', (payload, cb) => {
    try {
      const code = makeCode();
      game = new Game(code, broadcast);
      games.set(code, game);
      player = game.addPlayer(payload.name, payload.emoji);
      socket.join(code);
      cb({ ok: true, code, playerId: player.id, token: player.token, state: game.publicState() });
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on('join', (payload, cb) => {
    try {
      const code = String(payload.code || '').trim().toUpperCase();
      const g = games.get(code);
      if (!g) throw new Error('Partie introuvable. Vérifie le code.');
      game = g;
      player = game.addPlayer(payload.name, payload.emoji);
      socket.join(code);
      cb({ ok: true, code, playerId: player.id, token: player.token, state: game.publicState() });
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on('rejoin', (payload, cb) => {
    try {
      const code = String(payload.code || '').trim().toUpperCase();
      const g = games.get(code);
      if (!g) throw new Error('Cette partie n’existe plus.');
      const p = g.playerByToken(payload.token);
      if (!p) throw new Error('Joueur inconnu dans cette partie.');
      game = g;
      player = p;
      player.connected = true;
      socket.join(code);
      game.addLog(`🔌 ${player.name} s’est reconnecté.`);
      game.emit();
      cb({ ok: true, code, playerId: player.id, token: player.token, state: game.publicState() });
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on('start', safe(() => game && game.start(player.id)));
  socket.on('roll', safe(() => game && game.roll(player.id)));
  socket.on('buy', safe(() => game && game.buy(player.id)));
  socket.on('skipBuy', safe(() => game && game.skipBuy(player.id)));
  socket.on('endTurn', safe(() => game && game.endTurn(player.id)));
  socket.on('payJail', safe(() => game && game.payJailFine(player.id)));
  socket.on('useJailCard', safe(() => game && game.useJailCard(player.id)));
  socket.on('build', safe((p) => game && game.build(player.id, Number(p.idx))));
  socket.on('sellHouse', safe((p) => game && game.sellHouse(player.id, Number(p.idx))));
  socket.on('mortgage', safe((p) => game && game.mortgage(player.id, Number(p.idx))));
  socket.on('unmortgage', safe((p) => game && game.unmortgage(player.id, Number(p.idx))));
  socket.on('proposeTrade', safe((p) => game && game.proposeTrade(player.id, p)));
  socket.on('respondTrade', safe((p) => game && game.respondTrade(player.id, !!p.accept)));
  socket.on('bankrupt', safe(() => game && game.bankrupt(player.id)));
  socket.on('chat', safe((p) => game && game.chat(player.id, p.text)));

  socket.on('disconnect', () => {
    if (!game || !player) return;
    if (game.phase === 'lobby') {
      game.removeFromLobby(player.id);
    } else {
      player.connected = false;
      game.addLog(`🔌 ${player.name} s’est déconnecté.`);
      game.emit();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Monopoly entre amis — http://localhost:${PORT}`);
});
