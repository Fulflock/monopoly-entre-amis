/* Monopoly entre amis — client */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const socket = io();

  const GROUP_COLORS = {
    brown: 'var(--c-brown)', lightblue: 'var(--c-lightblue)', pink: 'var(--c-pink)',
    orange: 'var(--c-orange)', red: 'var(--c-red)', yellow: 'var(--c-yellow)',
    green: 'var(--c-green)', darkblue: 'var(--c-darkblue)',
  };
  const TYPE_ICONS = {
    go: '🏁', jail: '⛓️', parking: '🅿️', gotojail: '👮',
    chance: '❓', community: '🗃️', tax: '💸', station: '🚂', utility: '💡',
  };
  const EMOJIS = ['🎩', '🐕', '🚗', '🚢', '👢', '🐈', '🎲', '🛵'];

  let BOARD = [];
  let state = null;
  let me = null; // { code, playerId, token, name }
  let selectedEmoji = EMOJIS[0];
  let lastLogLen = 0;
  let lastChatLen = 0;
  let lastDiceKey = '';
  let activeTab = 'journal';
  let unreadChat = 0;

  const SAVE_KEY = 'monopoly_session';

  // ───────────────────── utilitaires ─────────────────────

  function saveSession() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(me));
  }

  function clearSession() {
    localStorage.removeItem(SAVE_KEY);
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), 3200);
  }

  function send(event, payload = {}) {
    socket.emit(event, payload, (res) => {
      if (res && !res.ok) toast(res.error);
    });
  }

  function showScreen(name) {
    for (const s of ['home', 'lobby', 'game']) {
      $('#screen-' + s).classList.toggle('hidden', s !== name);
    }
  }

  function myPlayer() {
    return state ? state.players.find((p) => p.id === me.playerId) : null;
  }

  function isMyTurn() {
    return state && state.players[state.turn] && state.players[state.turn].id === me.playerId;
  }

  function fmtMoney(n) {
    return n.toLocaleString('fr-FR') + ' €';
  }

  // ───────────────────── accueil ─────────────────────

  function buildEmojiPicker() {
    const wrap = $('#emoji-picker');
    wrap.innerHTML = '';
    for (const e of EMOJIS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-pick' + (e === selectedEmoji ? ' selected' : '');
      b.textContent = e;
      b.onclick = () => {
        selectedEmoji = e;
        buildEmojiPicker();
      };
      wrap.appendChild(b);
    }
  }

  function onJoined(res) {
    me = { code: res.code, playerId: res.playerId, token: res.token };
    saveSession();
    state = res.state;
    render();
  }

  $('#btn-create').onclick = () => {
    const name = $('#inp-name').value.trim();
    if (!name) return toast('Choisis un pseudo !');
    socket.emit('create', { name, emoji: selectedEmoji }, (res) => {
      if (!res.ok) return toast(res.error);
      onJoined(res);
    });
  };

  $('#btn-join').onclick = () => {
    const name = $('#inp-name').value.trim();
    const code = $('#inp-code').value.trim().toUpperCase();
    if (!name) return toast('Choisis un pseudo !');
    if (code.length !== 4) return toast('Le code fait 4 caractères.');
    socket.emit('join', { code, name, emoji: selectedEmoji }, (res) => {
      if (!res.ok) return toast(res.error);
      onJoined(res);
    });
  };

  $('#inp-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  // pré-remplissage du code via lien d'invitation (?code=XXXX)
  const urlCode = new URLSearchParams(location.search).get('code');
  if (urlCode) $('#inp-code').value = urlCode.toUpperCase().slice(0, 4);

  // ───────────────────── lobby ─────────────────────

  $('#btn-copy-link').onclick = () => {
    const url = `${location.origin}/?code=${me.code}`;
    navigator.clipboard.writeText(url).then(
      () => toast('Lien copié ! Envoie-le à tes amis 📨'),
      () => toast('Code : ' + me.code)
    );
  };

  $('#btn-start').onclick = () => send('start');

  function renderLobby() {
    $('#lobby-code').textContent = me.code;
    const ul = $('#lobby-players');
    ul.innerHTML = '';
    for (const p of state.players) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${p.emoji}</span><span>${esc(p.name)}</span>` +
        (p.id === state.hostId ? '<span class="host-tag">Hôte</span>' : '');
      ul.appendChild(li);
    }
    const isHost = state.hostId === me.playerId;
    const enough = state.players.length >= 2;
    $('#btn-start').classList.toggle('hidden', !isHost);
    $('#btn-start').disabled = !enough;
    $('#lobby-wait').textContent = enough
      ? (isHost ? 'Tout le monde est là ? À toi de lancer !' : 'En attente du lancement par l’hôte…')
      : 'En attente de joueurs… (2 minimum)';
  }

  // ───────────────────── plateau ─────────────────────

  function gridPos(idx) {
    // retourne [row, col] dans la grille 11x11 (1-indexé)
    if (idx <= 10) return [11, 11 - idx];
    if (idx <= 20) return [11 - (idx - 10), 1];
    if (idx <= 30) return [1, idx - 20 + 1];
    return [idx - 30 + 1, 11];
  }

  function sideClass(idx) {
    if (idx % 10 === 0) return 'corner';
    if (idx < 10) return 'side-bottom';
    if (idx < 20) return 'side-left';
    if (idx < 30) return 'side-top';
    return 'side-right';
  }

  function shortName(name) {
    return name
      .replace('Boulevard', 'Bd').replace('Avenue', 'Av.').replace('Compagnie de distribution', 'Cie')
      .replace('Compagnie', 'Cie').replace('Faubourg', 'Fbg');
  }

  function buildBoard() {
    const board = $('#board');
    // supprime les anciennes cases (garde le centre et la couche pions)
    board.querySelectorAll('.sq').forEach((el) => el.remove());
    for (const sq of BOARD) {
      const el = document.createElement('div');
      const [row, col] = gridPos(sq.idx);
      el.className = `sq ${sideClass(sq.idx)}`;
      el.style.gridArea = `${row} / ${col}`;
      el.dataset.idx = sq.idx;

      let inner = '';
      if (sq.type === 'prop') {
        inner = `<div class="band" style="background:${GROUP_COLORS[sq.group]}"></div>
          <div class="sq-body">
            <div class="sq-name">${esc(shortName(sq.name))}</div>
            <div class="sq-price">${sq.price} €</div>
          </div>`;
      } else if (sq.type === 'station' || sq.type === 'utility') {
        inner = `<div class="sq-body">
            <div class="sq-name">${esc(shortName(sq.name))}</div>
            <div class="sq-icon">${TYPE_ICONS[sq.type]}</div>
            <div class="sq-price">${sq.price} €</div>
          </div>`;
      } else if (sq.type === 'tax') {
        inner = `<div class="sq-body">
            <div class="sq-name">${esc(sq.name)}</div>
            <div class="sq-icon">${TYPE_ICONS.tax}</div>
            <div class="sq-price">${sq.amount} €</div>
          </div>`;
      } else {
        inner = `<div class="sq-body">
            <div class="sq-name">${esc(sq.name)}</div>
            <div class="sq-icon">${TYPE_ICONS[sq.type] || ''}</div>
          </div>`;
      }
      el.innerHTML = inner + '<div class="houses"></div><div class="owner-mark"></div>';
      el.onclick = () => openSquareModal(sq.idx);
      board.appendChild(el);
    }
  }

  function updateBoardDynamic() {
    for (const sq of BOARD) {
      const el = $(`.sq[data-idx="${sq.idx}"]`);
      if (!el) continue;
      const st = state.props[sq.idx];
      const owner = st && st.owner ? state.players.find((p) => p.id === st.owner) : null;
      el.classList.toggle('owned', !!owner);
      el.classList.toggle('mortgaged', !!(st && st.mortgaged));
      const mark = el.querySelector('.owner-mark');
      if (owner) mark.style.background = owner.color;
      const houses = el.querySelector('.houses');
      if (st && st.houses > 0) {
        houses.textContent = st.houses === 5 ? '🏨' : '🏠'.repeat(st.houses);
      } else {
        houses.textContent = '';
      }
    }
  }

  function updateTokens() {
    const layer = $('#tokens-layer');
    const boardRect = $('#board').getBoundingClientRect();
    const byPos = {};
    for (const p of state.players) {
      if (p.bankrupt) continue;
      byPos[p.pos] = byPos[p.pos] || [];
      byPos[p.pos].push(p);
    }
    for (const p of state.players) {
      let tok = layer.querySelector(`[data-pid="${p.id}"]`);
      if (p.bankrupt) {
        if (tok) tok.remove();
        continue;
      }
      if (!tok) {
        tok = document.createElement('div');
        tok.className = 'token';
        tok.dataset.pid = p.id;
        tok.textContent = p.emoji;
        layer.appendChild(tok);
      }
      tok.style.borderColor = p.color;
      tok.classList.toggle('is-turn', state.phase === 'playing' && state.players[state.turn].id === p.id);

      const sqEl = $(`.sq[data-idx="${p.pos}"]`);
      if (!sqEl) continue;
      const r = sqEl.getBoundingClientRect();
      const group = byPos[p.pos];
      const k = group.indexOf(p);
      const n = group.length;
      // petite répartition pour éviter la superposition
      const offX = n > 1 ? (k % 3 - Math.min(n - 1, 2) / 2) * 16 : 0;
      const offY = n > 2 ? (Math.floor(k / 3) - 0.5) * 16 : 0;
      tok.style.left = r.left - boardRect.left + r.width / 2 + offX + 'px';
      tok.style.top = r.top - boardRect.top + r.height / 2 + offY + 'px';
    }
  }

  window.addEventListener('resize', () => { if (state && state.phase !== 'lobby') updateTokens(); });

  // ───────────────────── dés ─────────────────────

  const PIPS = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  };

  function renderDie(el, val) {
    el.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      if (PIPS[val].includes(i)) cell.className = 'pip';
      cell.style.gridArea = `${Math.floor(i / 3) + 1} / ${(i % 3) + 1}`;
      el.appendChild(cell);
    }
  }

  function updateDice() {
    const wrap = $('#dice');
    if (!state.dice) {
      wrap.classList.add('hidden');
      lastDiceKey = '';
      return;
    }
    wrap.classList.remove('hidden');
    renderDie($('#die1'), state.dice[0]);
    renderDie($('#die2'), state.dice[1]);
    const key = state.dice.join('-') + '-' + state.turn + '-' + state.log.length;
    if (key !== lastDiceKey) {
      lastDiceKey = key;
      for (const id of ['#die1', '#die2']) {
        const d = $(id);
        d.classList.remove('rolling');
        void d.offsetWidth;
        d.classList.add('rolling');
      }
    }
  }

  // ───────────────────── panneau joueurs ─────────────────────

  function renderPlayers() {
    const wrap = $('#players-strip');
    wrap.innerHTML = '';
    for (const p of state.players) {
      const div = document.createElement('div');
      div.className = 'player-card' +
        (state.phase === 'playing' && state.players[state.turn].id === p.id ? ' is-turn' : '') +
        (p.bankrupt ? ' is-bankrupt' : '');
      div.style.borderLeftColor = p.color;
      const badges = [];
      if (p.inJail) badges.push('⛓️');
      if (p.jailCards > 0) badges.push('🃏'.repeat(p.jailCards));
      const tradeBtn = (p.id !== me.playerId && !p.bankrupt && state.phase === 'playing')
        ? `<button class="p-trade-btn" data-trade="${p.id}" title="Proposer un échange">🤝</button>` : '';
      div.innerHTML = `
        <span class="p-dot ${p.connected ? '' : 'off'}"></span>
        <span class="p-emoji">${p.emoji}</span>
        <span class="p-name">${esc(p.name)}${p.id === me.playerId ? ' (toi)' : ''}</span>
        <span class="p-badges">${badges.join(' ')}</span>
        ${tradeBtn}
        <span class="p-money ${p.money < 0 ? 'negative' : ''}">${fmtMoney(p.money)}</span>`;
      wrap.appendChild(div);
    }
    wrap.querySelectorAll('[data-trade]').forEach((b) => {
      b.onclick = () => openTradeModal(b.dataset.trade);
    });
  }

  // ───────────────────── zone d'action ─────────────────────

  function renderActions() {
    const zone = $('#action-zone');
    const my = myPlayer();
    const cur = state.players[state.turn];
    zone.innerHTML = '';

    if (state.phase === 'ended') {
      const w = state.players.find((p) => p.id === state.winner);
      zone.innerHTML = `<div class="az-title">🏆 ${esc(w.name)} a gagné !</div>`;
      return;
    }

    const html = [];

    if (my && my.money < 0 && !my.bankrupt) {
      html.push(`<div class="az-debt">⚠️ Tu es à découvert (${fmtMoney(my.money)}).<br>
        Clique sur tes propriétés pour hypothéquer ou vendre des maisons.</div>`);
      html.push(`<button class="btn btn-red" id="az-bankrupt">💀 Déclarer faillite</button>`);
    }

    if (!isMyTurn()) {
      html.push(`<div class="az-title">${cur.emoji} ${esc(cur.name)} joue…</div>`);
      html.push(`<div class="az-sub">Clique sur une case pour voir les détails, ou propose un échange 🤝</div>`);
    } else if (my.bankrupt) {
      html.push(`<div class="az-title">Tu es en faillite 💀</div>`);
    } else if (state.sub === 'roll') {
      if (my.inJail) {
        html.push(`<div class="az-title">⛓️ Tu es en prison (essai ${my.jailTurns + 1}/3)</div>`);
        html.push(`<button class="btn btn-red" id="az-roll">🎲 Tenter un double</button>`);
        const row = [];
        if (my.money >= 50) row.push(`<button class="btn btn-green" id="az-payjail">Payer 50 €</button>`);
        if (my.jailCards > 0) row.push(`<button class="btn btn-green" id="az-jailcard">🃏 Carte sortie</button>`);
        if (row.length) html.push(`<div class="az-row">${row.join('')}</div>`);
      } else {
        html.push(`<div class="az-title">À toi de jouer !</div>`);
        html.push(`<button class="btn btn-red" id="az-roll">🎲 Lancer les dés</button>`);
      }
    } else if (state.sub === 'buy' && state.pendingBuy !== null) {
      const sq = BOARD[state.pendingBuy];
      const afford = my.money >= sq.price;
      html.push(`<div class="az-title">🏠 ${esc(sq.name)}</div>`);
      html.push(`<div class="az-sub">Prix : ${fmtMoney(sq.price)}${afford ? '' : ' — hypothèque d’abord pour financer !'}</div>`);
      html.push(`<div class="az-row">
        <button class="btn btn-green" id="az-buy" ${afford ? '' : 'disabled'}>Acheter</button>
        <button class="btn btn-red" id="az-skip">Passer</button>
      </div>`);
    } else if (state.sub === 'end') {
      html.push(`<div class="az-title">Tour terminé ?</div>`);
      html.push(`<div class="az-sub">Tu peux encore construire, hypothéquer ou échanger.</div>`);
      html.push(`<button class="btn btn-green" id="az-end">✔️ Finir mon tour</button>`);
    }

    zone.innerHTML = html.join('');
    const bind = (id, ev) => { const b = $(id); if (b) b.onclick = () => send(ev); };
    bind('#az-roll', 'roll');
    bind('#az-buy', 'buy');
    bind('#az-skip', 'skipBuy');
    bind('#az-end', 'endTurn');
    bind('#az-payjail', 'payJail');
    bind('#az-jailcard', 'useJailCard');
    const bk = $('#az-bankrupt');
    if (bk) bk.onclick = () => {
      if (confirm('Déclarer faillite ? C’est définitif !')) send('bankrupt');
    };

    // message du centre
    const cm = $('#center-msg');
    if (state.phase === 'playing') {
      cm.textContent = isMyTurn() ? '⭐ C’est ton tour !' : `Au tour de ${cur.emoji} ${cur.name}`;
    } else {
      cm.textContent = '';
    }
  }

  // ───────────────────── journal & chat ─────────────────────

  function renderLog() {
    const log = $('#log');
    const last = state.log[state.log.length - 1];
    const key = last ? last.t + '|' + last.text + '|' + state.log.length : '';
    if (key === renderLog._key && log.children.length) return;

    const prevLastT = renderLog._lastT || 0;
    log.innerHTML = state.log
      .map((l) => `<div class="l-${l.kind}">${esc(l.text)}</div>`)
      .join('');
    log.scrollTop = log.scrollHeight;

    // animation "carte tirée" pour les nouvelles entrées uniquement
    if (renderLog._key) {
      const fresh = state.log.filter((l) => l.t > prevLastT);
      const card = fresh.find((l) => l.kind === 'card');
      if (card) showCardFlash(card.text);
    }
    renderLog._key = key;
    renderLog._lastT = last ? last.t : 0;
  }

  function showCardFlash(text) {
    const m = text.match(/carte (Chance|Caisse de communauté) : « (.+) »/);
    if (!m) return;
    document.querySelectorAll('.card-flash').forEach((e) => e.remove());
    const div = document.createElement('div');
    div.className = 'card-flash';
    div.innerHTML = `<div class="cf-title">${m[1]}</div><div class="cf-text">${esc(m[2])}</div>`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3500);
  }

  function renderChat() {
    const box = $('#chat-messages');
    const last = state.chatLog[state.chatLog.length - 1];
    const key = last ? last.t + '|' + last.text + '|' + state.chatLog.length : '';
    if (key !== renderChat._key) {
      const prevLastT = renderChat._lastT || 0;
      if (activeTab !== 'chat' && renderChat._key !== undefined) {
        unreadChat += state.chatLog.filter((c) => c.t > prevLastT).length;
      }
      renderChat._key = key;
      renderChat._lastT = last ? last.t : 0;
      box.innerHTML = state.chatLog
        .map((c) => `<div><span class="c-from" style="color:${c.color}">${c.emoji} ${esc(c.from)} :</span> ${esc(c.text)}</div>`)
        .join('');
      box.scrollTop = box.scrollHeight;
    }
    const badge = $('#chat-badge');
    badge.classList.toggle('hidden', unreadChat === 0);
    badge.textContent = unreadChat;
  }

  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      activeTab = t.dataset.tab;
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      $('#tab-journal').classList.toggle('hidden', activeTab !== 'journal');
      $('#tab-chat').classList.toggle('hidden', activeTab !== 'chat');
      if (activeTab === 'chat') {
        unreadChat = 0;
        $('#chat-badge').classList.add('hidden');
        $('#chat-input').focus();
      }
    };
  });

  $('#chat-form').onsubmit = (e) => {
    e.preventDefault();
    const inp = $('#chat-input');
    const text = inp.value.trim();
    if (text) send('chat', { text });
    inp.value = '';
  };

  // ───────────────────── modale propriété ─────────────────────

  function openSquareModal(idx) {
    const sq = BOARD[idx];
    if (!['prop', 'station', 'utility'].includes(sq.type)) return;
    const st = state.props[idx];
    const owner = st && st.owner ? state.players.find((p) => p.id === st.owner) : null;
    const mine = owner && owner.id === me.playerId;
    const my = myPlayer();

    let rentRows = '';
    if (sq.type === 'prop') {
      rentRows = `
        <tr><td>Loyer (terrain nu)</td><td>${sq.rent[0]} €</td></tr>
        <tr><td>— avec groupe complet</td><td>${sq.rent[0] * 2} €</td></tr>
        <tr><td>Avec 1 maison</td><td>${sq.rent[1]} €</td></tr>
        <tr><td>Avec 2 maisons</td><td>${sq.rent[2]} €</td></tr>
        <tr><td>Avec 3 maisons</td><td>${sq.rent[3]} €</td></tr>
        <tr><td>Avec 4 maisons</td><td>${sq.rent[4]} €</td></tr>
        <tr><td>Avec un hôtel 🏨</td><td>${sq.rent[5]} €</td></tr>
        <tr><td>Prix d’une maison</td><td>${sq.houseCost} €</td></tr>`;
    } else if (sq.type === 'station') {
      rentRows = `
        <tr><td>1 gare possédée</td><td>25 €</td></tr>
        <tr><td>2 gares</td><td>50 €</td></tr>
        <tr><td>3 gares</td><td>100 €</td></tr>
        <tr><td>4 gares</td><td>200 €</td></tr>`;
    } else {
      rentRows = `
        <tr><td>1 compagnie</td><td>4 × les dés</td></tr>
        <tr><td>2 compagnies</td><td>10 × les dés</td></tr>`;
    }

    const actions = [];
    if (mine) {
      if (sq.type === 'prop' && !st.mortgaged) {
        if (st.houses < 5) actions.push(`<button class="btn btn-green" data-act="build">🏗️ Construire (${sq.houseCost} €)</button>`);
        if (st.houses > 0) actions.push(`<button class="btn btn-red" data-act="sellHouse">🏚️ Vendre une maison (+${Math.floor(sq.houseCost / 2)} €)</button>`);
      }
      if (!st.mortgaged && (sq.type !== 'prop' || st.houses === 0)) {
        actions.push(`<button class="btn btn-red" data-act="mortgage">🏦 Hypothéquer (+${Math.floor(sq.price / 2)} €)</button>`);
      }
      if (st.mortgaged) {
        actions.push(`<button class="btn btn-green" data-act="unmortgage">🏦 Lever l’hypothèque (−${Math.ceil(sq.price * 0.55)} €)</button>`);
      }
    }

    openModal(`
      <h3>${esc(sq.name)}</h3>
      ${sq.type === 'prop' ? `<div class="m-band" style="background:${GROUP_COLORS[sq.group]}"></div>` : `<div class="m-sub" style="font-size:34px">${TYPE_ICONS[sq.type]}</div>`}
      <div class="m-sub">
        Prix : <b>${fmtMoney(sq.price)}</b> ·
        ${owner ? `Propriétaire : <b style="color:${owner.color}">${owner.emoji} ${esc(owner.name)}</b>` : '<b>À vendre</b>'}
        ${st && st.mortgaged ? ' · <b style="color:var(--mono-red)">Hypothéquée</b>' : ''}
        ${st && st.houses ? ` · ${st.houses === 5 ? '🏨' : '🏠'.repeat(st.houses)}` : ''}
      </div>
      <table class="rent-table">${rentRows}</table>
      <div class="m-actions">${actions.join('')}</div>
      <button class="m-close">Fermer</button>
    `);

    $('#modal').querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => {
        send(b.dataset.act, { idx });
        closeModal();
      };
    });
  }

  // ───────────────────── échanges ─────────────────────

  function openTradeModal(targetId) {
    const target = state.players.find((p) => p.id === targetId);
    const my = myPlayer();
    const tradable = (pid) =>
      Object.entries(state.props)
        .filter(([idx, st]) => st.owner === pid)
        .map(([idx]) => Number(idx))
        .filter((idx) => {
          const sq = BOARD[idx];
          if (sq.type !== 'prop') return true;
          return !sq.group || !Object.entries(state.props).some(
            ([i, s]) => BOARD[Number(i)].group === sq.group && s.houses > 0
          );
        });

    const listHtml = (idxs) => idxs.length
      ? idxs.map((idx) => {
          const sq = BOARD[idx];
          const band = sq.group ? GROUP_COLORS[sq.group] : '#999';
          return `<label class="trade-item">
            <input type="checkbox" value="${idx}" />
            <span class="ti-band" style="background:${band}"></span>
            <span>${esc(shortName(sq.name))}${state.props[idx].mortgaged ? ' (hyp.)' : ''}</span>
          </label>`;
        }).join('')
      : '<div style="font-size:13px;color:#999;text-align:center;padding:8px">Rien à échanger</div>';

    openModal(`
      <h3>🤝 Échange avec ${target.emoji} ${esc(target.name)}</h3>
      <div class="trade-cols">
        <div class="trade-col">
          <h4>Tu donnes</h4>
          <div class="trade-list" id="tr-give">${listHtml(tradable(me.playerId))}</div>
          <div class="trade-money"><input type="text" id="tr-give-money" inputmode="numeric" placeholder="+ argent (€)" /></div>
        </div>
        <div class="trade-col">
          <h4>Tu demandes</h4>
          <div class="trade-list" id="tr-want">${listHtml(tradable(targetId))}</div>
          <div class="trade-money"><input type="text" id="tr-want-money" inputmode="numeric" placeholder="+ argent (€)" /></div>
        </div>
      </div>
      <div class="m-actions">
        <button class="btn btn-green" id="tr-send">Envoyer la proposition</button>
      </div>
      <button class="m-close">Annuler</button>
    `);

    $('#tr-send').onclick = () => {
      const giveProps = [...$('#tr-give').querySelectorAll('input:checked')].map((i) => Number(i.value));
      const wantProps = [...$('#tr-want').querySelectorAll('input:checked')].map((i) => Number(i.value));
      const giveMoney = parseInt($('#tr-give-money').value, 10) || 0;
      const wantMoney = parseInt($('#tr-want-money').value, 10) || 0;
      send('proposeTrade', { to: targetId, giveMoney, giveProps, wantMoney, wantProps });
      closeModal();
    };
  }

  function renderTrade() {
    const t = state.trade;
    const modal = $('#modal');
    const showing = modal.dataset.trade;
    if (!t) {
      if (showing) closeModal();
      return;
    }
    if (showing === t.id) return;
    const from = state.players.find((p) => p.id === t.from);
    const to = state.players.find((p) => p.id === t.to);
    const iAmTarget = t.to === me.playerId;
    const iAmSender = t.from === me.playerId;
    if (!iAmTarget && !iAmSender) return; // les autres ne voient que le journal

    const list = (idxs) => idxs.length ? idxs.map((i) => `« ${esc(BOARD[i].name)} »`).join(', ') : 'rien';
    const money = (n) => (n > 0 ? ` + ${fmtMoney(n)}` : '');

    openModal(`
      <h3>🤝 Proposition d’échange</h3>
      <div class="trade-summary">
        <b style="color:${from.color}">${from.emoji} ${esc(from.name)}</b> donne : ${list(t.giveProps)}${money(t.giveMoney)}<br><br>
        <b style="color:${to.color}">${to.emoji} ${esc(to.name)}</b> donne : ${list(t.wantProps)}${money(t.wantMoney)}
      </div>
      <div class="m-actions">
        ${iAmTarget ? `
          <button class="btn btn-green" id="tr-accept">✅ Accepter</button>
          <button class="btn btn-red" id="tr-decline">❌ Refuser</button>
        ` : `
          <div class="m-sub">En attente de la réponse de ${esc(to.name)}…</div>
          <button class="btn btn-red" id="tr-cancel">Annuler ma proposition</button>
        `}
      </div>
    `);
    modal.dataset.trade = t.id;
    const a = $('#tr-accept'), d = $('#tr-decline'), c = $('#tr-cancel');
    if (a) a.onclick = () => { send('respondTrade', { accept: true }); closeModal(); };
    if (d) d.onclick = () => { send('respondTrade', { accept: false }); closeModal(); };
    if (c) c.onclick = () => { send('respondTrade', { accept: false }); closeModal(); };
  }

  // ───────────────────── modales génériques ─────────────────────

  function openModal(html) {
    const m = $('#modal');
    delete m.dataset.trade;
    m.innerHTML = html;
    $('#modal-backdrop').classList.remove('hidden');
    const close = m.querySelector('.m-close');
    if (close) close.onclick = closeModal;
  }

  function closeModal() {
    const m = $('#modal');
    delete m.dataset.trade;
    m.innerHTML = '';
    $('#modal-backdrop').classList.add('hidden');
  }

  $('#modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget && !$('#modal').dataset.trade) closeModal();
  });

  // ───────────────────── victoire ─────────────────────

  function renderWinner() {
    if (state.phase !== 'ended' || document.querySelector('.win-overlay')) return;
    const w = state.players.find((p) => p.id === state.winner);
    const div = document.createElement('div');
    div.className = 'win-overlay';
    div.innerHTML = `<div class="win-card">
      <div class="w-emoji">${w.emoji}</div>
      <h2>${esc(w.name)} a gagné !</h2>
      <p>Le magnat de l’immobilier 🏆</p>
      <button class="btn btn-red" id="w-again">Nouvelle partie</button>
    </div>`;
    document.body.appendChild(div);
    $('#w-again').onclick = () => {
      clearSession();
      location.href = '/';
    };
  }

  // ───────────────────── rendu principal ─────────────────────

  function render() {
    if (!state) return;
    if (state.phase === 'lobby') {
      showScreen('lobby');
      renderLobby();
      return;
    }
    showScreen('game');
    if (!$('#board').querySelector('.sq')) buildBoard();
    updateBoardDynamic();
    renderPlayers();
    renderActions();
    renderLog();
    renderChat();
    renderTrade();
    updateDice();
    renderWinner();
    updateTokens();
    // repositionne après chargement des polices / stabilisation de la mise en page
    setTimeout(updateTokens, 350);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ───────────────────── socket ─────────────────────

  socket.on('state', (s) => {
    state = s;
    render();
  });

  socket.on('errorMsg', toast);

  socket.on('connect', () => {
    // tentative de reconnexion à une partie en cours
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved && !me) {
      const sess = JSON.parse(saved);
      socket.emit('rejoin', { code: sess.code, token: sess.token }, (res) => {
        if (res.ok) {
          me = { code: res.code, playerId: res.playerId, token: res.token };
          state = res.state;
          render();
        } else {
          clearSession();
        }
      });
    } else if (me) {
      socket.emit('rejoin', { code: me.code, token: me.token }, (res) => {
        if (res.ok) {
          state = res.state;
          render();
        }
      });
    }
  });

  // ───────────────────── init ─────────────────────

  fetch('/api/board')
    .then((r) => r.json())
    .then((b) => {
      BOARD = b;
      if (state) render();
    });

  buildEmojiPicker();
})();
