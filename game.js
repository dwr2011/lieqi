const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const logEl = document.getElementById('log');
const joinBtn = document.getElementById('joinBtn');
const teamBtn = document.getElementById('teamBtn');
const saveBtn = document.getElementById('saveBtn');
const tpBtn = document.getElementById('tpBtn');
const claimBtn = document.getElementById('claimBtn');
const buildBtn = document.getElementById('buildBtn');
const nameInput = document.getElementById('nameInput');
const connStatus = document.getElementById('connStatus');
const resourceBox = document.getElementById('resourceBox');
const hpBox = document.getElementById('hpBox');
const evoList = document.getElementById('evoList');
const roomInput = document.getElementById('roomInput');
const teamInput = document.getElementById('teamInput');
const teamBox = document.getElementById('teamBox');
const tpTarget = document.getElementById('tpTarget');
const buildType = document.getElementById('buildType');

const keys = { w: false, a: false, s: false, d: false, attack: false };
let socket;
let myId = null;
let world = { width: 4200, height: 3000 };
let state = { players: [], enemies: [], resources: [], claims: [], structures: [] };
let evolutions = {};
let availableEvos = [];
let camera = { x: 0, y: 0 };
let inputTimer = null;
const smoothPos = new Map();
let lastEvoSignature = '';

const resourceName = { protein: '蛋白质', mineral: '矿物质', gas: '气体' };

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.max(220, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);

function log(msg) {
  if (logEl.textContent.includes('等待加入服务器')) logEl.innerHTML = '';
  const d = document.createElement('div');
  d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.prepend(d);
  if (logEl.childNodes.length > 20) logEl.lastChild.remove();
}

function statText(e) {
  const speed = e.bonus.speed > 0 ? `+${e.bonus.speed.toFixed(2)}` : e.bonus.speed.toFixed(2);
  return `效果: 生命+${e.bonus.maxHp} 攻击+${e.bonus.attack} 护甲+${Math.round(e.bonus.armor * 100)}% 速度${speed}`;
}

function drawEvolutionList() {
  const list = availableEvos.filter((id) => evolutions[id]).slice(0, 10);
  evoList.innerHTML = list.map((id, i) => {
    const e = evolutions[id];
    const hotkey = (i + 1) % 10;
    return `<div class="evo-item"><b>[${hotkey}] ${e.label}</b><br>需求: 蛋白质${e.costs.protein} / 矿物质${e.costs.mineral} / 气体${e.costs.gas}<br>${statText(e)}<br>说明: ${e.desc}</div>`;
  }).join('') || '已没有可进化项（你已接近终极形态）。';
}

function canUnlock(me, evoId) {
  const evo = evolutions[evoId];
  if (!evo || me.evolutions.includes(evoId)) return false;
  if (!evo.prereqAny || evo.prereqAny.length === 0) return true;
  return evo.prereqAny.some((need) => me.evolutions.includes(need));
}

function refreshEvolutionAvailability(me) {
  availableEvos = Object.keys(evolutions).filter((id) => canUnlock(me, id));
  const signature = `${me.evolutions.join('|')}#${availableEvos.join('|')}`;
  if (signature !== lastEvoSignature) {
    drawEvolutionList();
    lastEvoSignature = signature;
  }
}

function renderTeamInfo(me) {
  if (!me) return;
  const mates = state.players.filter((p) => p.teamId === me.teamId);
  teamBox.innerHTML = `队伍：<b>${me.teamId || 'solo'}</b><br>成员：${mates.map((m) => m.name).join('、')}`;

  const current = tpTarget.value;
  const options = mates
    .filter((m) => m.id !== me.id)
    .map((m) => `<option value="${m.id}">${m.name}</option>`)
    .join('');
  tpTarget.innerHTML = options || '<option value="">暂无队友</option>';
  if (current && tpTarget.querySelector(`option[value="${current}"]`)) tpTarget.value = current;
}

function worldToScreen(x, y) {
  return { x: x - camera.x, y: y - camera.y };
}

function drawForm(p, sx, sy, isMate) {
  const r = p.r;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.strokeStyle = isMate ? '#86ffad' : '#fff';
  ctx.lineWidth = 2;

  if (p.form === 'photo_cell') {
    ctx.fillStyle = '#6dff7f';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 1.4, 0);
    ctx.lineTo(r * 1.4, 0);
    ctx.moveTo(0, -r * 1.4);
    ctx.lineTo(0, r * 1.4);
    ctx.stroke();
  } else if (p.form === 'spike_cell') {
    ctx.fillStyle = '#ff8b8b';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const rr = i % 2 ? r * 0.75 : r * 1.25;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (p.form === 'cluster_cell') {
    ctx.fillStyle = '#b0c9ff';
    [[-r * 0.6, 0], [r * 0.6, 0], [0, -r * 0.6], [0, r * 0.6]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  } else if (p.form === 'crab') {
    ctx.fillStyle = '#ff8e70';
    ctx.beginPath(); ctx.rect(-r, -r * 0.7, r * 2, r * 1.4); ctx.fill(); ctx.stroke();
  } else if (p.form === 'lizard' || p.form === 'leopard') {
    ctx.fillStyle = p.form === 'leopard' ? '#ffd67a' : '#96ff84';
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.4, r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 1.4, 0); ctx.lineTo(-r * 2.4, r * 0.2); ctx.stroke();
  } else if (p.form === 'jelly') {
    ctx.fillStyle = '#8cd8ff';
    ctx.beginPath(); ctx.arc(0, -r * 0.2, r, Math.PI, 0); ctx.lineTo(r, r * 0.7); ctx.lineTo(-r, r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (p.form === 'beetle') {
    ctx.fillStyle = '#7c5cff';
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -r * 1.2); ctx.lineTo(0, r * 1.2); ctx.stroke();
  } else if (p.form === 'ray') {
    ctx.fillStyle = '#75d5ff';
    ctx.beginPath(); ctx.moveTo(-r * 1.4, 0); ctx.lineTo(0, -r * 0.8); ctx.lineTo(r * 1.4, 0); ctx.lineTo(0, r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (p.form === 'human') {
    ctx.fillStyle = '#8ec3ff';
    ctx.beginPath(); ctx.arc(0, -r * 0.8, r * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-r * 0.22, -r * 0.5, r * 0.44, r * 1.3);
  } else if (p.form === 'dinosaur') {
    ctx.fillStyle = '#9effa1';
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.6, r * 0.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 1.5, 0); ctx.lineTo(-r * 2.5, -r * 0.4); ctx.stroke();
  } else {
    ctx.fillStyle = p.id === myId ? '#4de9ff' : '#ff9ff1';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  ctx.restore();
}

function getSmoothPos(p) {
  if (!smoothPos.has(p.id)) smoothPos.set(p.id, { x: p.x, y: p.y });
  const current = smoothPos.get(p.id);
  current.x += (p.x - current.x) * 0.35;
  current.y += (p.y - current.y) * 0.35;
  return current;
}

function teamColor(teamId) {
  let hash = 0;
  for (let i = 0; i < teamId.length; i++) hash = ((hash << 5) - hash + teamId.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsla(${hue}, 85%, 60%, 0.18)`;
}

function render() {
  const viewW = canvas.clientWidth;
  const viewH = canvas.clientHeight;

  ctx.clearRect(0, 0, viewW, viewH);
  ctx.fillStyle = '#051a33';
  ctx.fillRect(0, 0, viewW, viewH);

  const me = state.players.find((p) => p.id === myId);
  if (me) {
    camera.x = Math.max(0, Math.min(world.width - viewW, me.x - viewW / 2));
    camera.y = Math.max(0, Math.min(world.height - viewH, me.y - viewH / 2));
    resourceBox.textContent = `${resourceName.protein}:${me.resources.protein}  ${resourceName.mineral}:${me.resources.mineral}  ${resourceName.gas}:${me.resources.gas}`;
    hpBox.textContent = `生命: ${Math.max(0, Math.floor(me.hp))}/${Math.floor(me.maxHp)}  攻击:${me.attack} 护甲:${Math.round(me.armor * 100)}%  形态:${(evolutions[me.form] && evolutions[me.form].label) || me.form}`;
    renderTeamInfo(me);
    refreshEvolutionAvailability(me);
  }

  for (let gx = 0; gx < world.width; gx += 120) {
    for (let gy = 0; gy < world.height; gy += 120) {
      const s = worldToScreen(gx, gy);
      if (s.x < -5 || s.y < -5 || s.x > viewW + 5 || s.y > viewH + 5) continue;
      ctx.fillStyle = '#0b2a4e';
      ctx.fillRect(s.x, s.y, 2, 2);
    }
  }

  state.claims.forEach((c) => {
    const s = worldToScreen(c.x, c.y);
    ctx.beginPath();
    ctx.arc(s.x, s.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = teamColor(c.teamId || 'solo');
    ctx.fill();
    ctx.strokeStyle = 'rgba(199,233,255,0.45)';
    ctx.stroke();
  });

  state.resources.forEach((r) => {
    const s = worldToScreen(r.x, r.y);
    if (s.x < -10 || s.y < -10 || s.x > viewW + 10 || s.y > viewH + 10) return;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = r.type === 'protein' ? '#74ffb2' : r.type === 'mineral' ? '#f8d76f' : '#8fd3ff';
    ctx.fill();
  });

  state.structures.forEach((st) => {
    const s = worldToScreen(st.x, st.y);
    if (s.x < -30 || s.y < -30 || s.x > viewW + 30 || s.y > viewH + 30) return;
    ctx.strokeStyle = '#d8ecff';
    ctx.lineWidth = 2;
    if (st.type === 'turret') {
      ctx.fillStyle = '#c08bff';
      ctx.fillRect(s.x - 9, s.y - 9, 18, 18);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + 10, s.y - 10); ctx.stroke();
    } else if (st.type === 'healer') {
      ctx.fillStyle = '#77ffc2';
      ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s.x - 6, s.y); ctx.lineTo(s.x + 6, s.y); ctx.moveTo(s.x, s.y - 6); ctx.lineTo(s.x, s.y + 6); ctx.stroke();
    } else {
      ctx.fillStyle = '#ffd188';
      ctx.beginPath(); ctx.rect(s.x - 10, s.y - 6, 20, 12); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s.x, s.y - 6); ctx.lineTo(s.x, s.y - 13); ctx.stroke();
    }
  });

  state.enemies.forEach((e) => {
    const s = worldToScreen(e.x, e.y);
    if (s.x < -30 || s.y < -30 || s.x > viewW + 30 || s.y > viewH + 30) return;
    ctx.beginPath(); ctx.arc(s.x, s.y, e.r, 0, Math.PI * 2);
    ctx.fillStyle = e.aggro ? '#ff7373' : '#d58dff';
    ctx.fill();
    ctx.fillStyle = '#230026'; ctx.fillRect(s.x - 16, s.y - 24, 32, 4);
    ctx.fillStyle = '#ff95b6'; ctx.fillRect(s.x - 16, s.y - 24, (e.hp / e.maxHp) * 32, 4);
  });

  const meInfo = state.players.find((x) => x.id === myId);
  state.players.forEach((p) => {
    const smooth = getSmoothPos(p);
    const s = worldToScreen(smooth.x, smooth.y);
    if (s.x < -40 || s.y < -40 || s.x > viewW + 40 || s.y > viewH + 40) return;
    const isMate = meInfo && meInfo.teamId && meInfo.teamId === p.teamId;
    drawForm(p, s.x, s.y, isMate);

    ctx.fillStyle = '#1a2030';
    ctx.fillRect(s.x - 22, s.y - 34, 44, 4);
    ctx.fillStyle = p.id === myId ? '#4dffcf' : '#9ee3ff';
    ctx.fillRect(s.x - 22, s.y - 34, (p.hp / p.maxHp) * 44, 4);

    ctx.fillStyle = isMate ? '#a3ffc2' : '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${p.name}[${p.teamId}] (${p.pveKills}/${p.pvpKills})`, s.x - 45, s.y - 40);
  });

  ctx.fillStyle = '#d6ecff';
  ctx.fillText(`地图: ${world.width} x ${world.height} | 在线: ${state.players.length} | 领地: ${state.claims.length} | 建筑: ${state.structures.length}`, 12, 20);
}

function sendInput() {
  if (!socket) return;
  socket.emit('input', { up: keys.w, down: keys.s, left: keys.a, right: keys.d, attack: keys.attack });
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'w') keys.w = true;
    if (key === 'a') keys.a = true;
    if (key === 's') keys.s = true;
    if (key === 'd') keys.d = true;
    if (key === 'j') keys.attack = true;

    const idx = Number(e.key);
    if (!Number.isNaN(idx) && idx >= 0 && idx <= 9) {
      const pick = idx === 0 ? availableEvos[9] : availableEvos[idx - 1];
      if (pick && socket) socket.emit('evolve', { evoId: pick });
    }
  });

  document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'w') keys.w = false;
    if (key === 'a') keys.a = false;
    if (key === 's') keys.s = false;
    if (key === 'd') keys.d = false;
    if (key === 'j') keys.attack = false;
  });

  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) keys.attack = true; });
  canvas.addEventListener('mouseup', (e) => { if (e.button === 0) keys.attack = false; });
  canvas.addEventListener('mouseleave', () => { keys.attack = false; });
}

function connect() {
  if (socket) socket.disconnect();
  socket = io();
  connStatus.textContent = '连接中...';
  connStatus.style.background = '#5a4d1b';

  socket.on('connect', () => {
    socket.emit('join', {
      name: nameInput.value.trim() || '玩家',
      roomId: roomInput.value.trim() || 'main',
      teamId: teamInput.value.trim() || 'solo',
    });
  });

  socket.on('welcome', (payload) => {
    myId = payload.id;
    world = payload.world;
    evolutions = payload.evolutions;
    availableEvos = payload.availableEvolutions || Object.keys(evolutions);
    drawEvolutionList();
    connStatus.textContent = `已连接 (${payload.roomId} / 队伍:${payload.teamId})`;
    connStatus.style.background = '#1f5b34';
    log(payload.loadedSave ? '已读取存档，继续进化。' : '连接成功，开始联机。');
  });

  socket.on('state', (s) => {
    state = s;
    const liveIds = new Set(state.players.map((p) => p.id));
    for (const id of smoothPos.keys()) {
      if (!liveIds.has(id)) smoothPos.delete(id);
    }
    render();
  });

  socket.on('evolveResult', ({ ok, evoId, availableEvolutions }) => {
    if (Array.isArray(availableEvolutions)) availableEvos = availableEvolutions;
    if (ok) {
      const evo = evolutions[evoId];
      log(`进化成功 -> ${evo ? evo.label : evoId}`);
      drawEvolutionList();
    } else {
      log('进化失败：资源不足或前置条件未满足。');
    }
  });

  socket.on('saved', ({ at, reason }) => {
    const kind = reason === 'manual' ? '手动' : '自动';
    log(`${kind}存档成功：${new Date(at).toLocaleTimeString()}`);
  });

  socket.on('actionResult', ({ ok, msg }) => {
    log(`${ok ? '成功' : '失败'}：${msg}`);
  });

  socket.on('disconnect', () => {
    connStatus.textContent = '已断开';
    connStatus.style.background = '#622e2e';
    log('连接断开。');
  });

  if (inputTimer) clearInterval(inputTimer);
  inputTimer = setInterval(sendInput, 1000 / 30);
}

teamBtn.onclick = () => {
  if (!socket) return log('请先连接服务器。');
  const teamId = teamInput.value.trim() || 'solo';
  socket.emit('setTeam', { teamId });
  log(`已请求切换队伍 -> ${teamId}`);
};

saveBtn.onclick = () => {
  if (!socket) return log('请先连接服务器。');
  socket.emit('saveProgress');
};

tpBtn.onclick = () => {
  if (!socket) return log('请先连接服务器。');
  if (!tpTarget.value) return log('暂无可传送队友。');
  socket.emit('teamTeleport', { targetId: tpTarget.value });
};

claimBtn.onclick = () => {
  if (!socket) return log('请先连接服务器。');
  socket.emit('claimTerritory');
};

buildBtn.onclick = () => {
  if (!socket) return log('请先连接服务器。');
  socket.emit('buildStructure', { type: buildType.value });
};

bindKeys();
resizeCanvas();
joinBtn.onclick = connect;
requestAnimationFrame(function raf() { render(); requestAnimationFrame(raf); });
