const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const logEl = document.getElementById('log');
const joinBtn = document.getElementById('joinBtn');
const teamBtn = document.getElementById('teamBtn');
const nameInput = document.getElementById('nameInput');
const connStatus = document.getElementById('connStatus');
const resourceBox = document.getElementById('resourceBox');
const evoList = document.getElementById('evoList');
const roomInput = document.getElementById('roomInput');
const teamInput = document.getElementById('teamInput');
const teamBox = document.getElementById('teamBox');

const keys = { w: false, a: false, s: false, d: false, attack: false };
let socket;
let myId = null;
let world = { width: 4200, height: 3000 };
let state = { players: [], enemies: [], resources: [] };
let evolutions = {};
let camera = { x: 0, y: 0 };
let inputTimer = null;

const resourceName = { protein: '蛋白质', mineral: '矿物质', gas: '气体' };
const evoName = {
  photosynthesis: '光合作用', attack_organelle: '攻击器官', multicell: '多细胞',
  exoskeleton: '外骨骼', lung: '肺化', toxin: '毒腺', fin: '鳍化', spores: '孢子化',
  crab: '巨钳蟹', lizard: '疾走蜥蜴', jelly: '雷毒水母', ray: '深海鳐', beetle: '甲壳甲虫',
  photo_cell: '光合细胞', spike_cell: '刺突细胞', cluster_cell: '多细胞团',
};

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
  if (logEl.childNodes.length > 15) logEl.lastChild.remove();
}

function drawEvolutionList() {
  const all = Object.entries(evolutions);
  evoList.innerHTML = all.map(([id, e], i) => {
    const hotkey = (i + 1) % 10;
    const name = evoName[id] || id;
    return `<div class="evo-item"><b>[${hotkey}] ${name}</b><br>需求: 蛋白质${e.costs.protein} / 矿物质${e.costs.mineral} / 气体${e.costs.gas}</div>`;
  }).join('');
}

function renderTeamInfo(me) {
  if (!me) return;
  const mates = state.players.filter((p) => p.teamId === me.teamId);
  teamBox.innerHTML = `队伍：<b>${me.teamId || 'solo'}</b><br>成员：${mates.map((m) => m.name).join('、')}`;
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
      ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
  } else if (p.form === 'crab') {
    ctx.fillStyle = '#ff8e70';
    ctx.beginPath(); ctx.rect(-r, -r * 0.7, r * 2, r * 1.4); ctx.fill(); ctx.stroke();
  } else if (p.form === 'lizard') {
    ctx.fillStyle = '#96ff84';
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
  } else {
    ctx.fillStyle = p.id === myId ? '#4de9ff' : '#ff9ff1';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  ctx.restore();
}

function render() {
  const viewW = canvas.clientWidth;
  const viewH = canvas.clientHeight;

  ctx.clearRect(0, 0, viewW, viewH);
  ctx.fillStyle = '#051a33';
  ctx.fillRect(0, 0, viewW, viewH);

  const me = state.players.find(p => p.id === myId);
  if (me) {
    camera.x = Math.max(0, Math.min(world.width - viewW, me.x - viewW / 2));
    camera.y = Math.max(0, Math.min(world.height - viewH, me.y - viewH / 2));
    resourceBox.textContent = `${resourceName.protein}:${me.resources.protein} ${resourceName.mineral}:${me.resources.mineral} ${resourceName.gas}:${me.resources.gas} | 形态:${evoName[me.form] || me.form}`;
    renderTeamInfo(me);
  }

  for (let gx = 0; gx < world.width; gx += 120) {
    for (let gy = 0; gy < world.height; gy += 120) {
      const s = worldToScreen(gx, gy);
      if (s.x < -5 || s.y < -5 || s.x > viewW + 5 || s.y > viewH + 5) continue;
      ctx.fillStyle = '#0b2a4e';
      ctx.fillRect(s.x, s.y, 2, 2);
    }
  }

  state.resources.forEach(r => {
    const s = worldToScreen(r.x, r.y);
    if (s.x < -10 || s.y < -10 || s.x > viewW + 10 || s.y > viewH + 10) return;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = r.type === 'protein' ? '#74ffb2' : r.type === 'mineral' ? '#f8d76f' : '#8fd3ff';
    ctx.fill();
  });

  state.enemies.forEach(e => {
    const s = worldToScreen(e.x, e.y);
    if (s.x < -30 || s.y < -30 || s.x > viewW + 30 || s.y > viewH + 30) return;
    ctx.beginPath(); ctx.arc(s.x, s.y, e.r, 0, Math.PI * 2);
    ctx.fillStyle = e.aggro ? '#ff7373' : '#d58dff';
    ctx.fill();
    ctx.fillStyle = '#230026'; ctx.fillRect(s.x - 16, s.y - 24, 32, 4);
    ctx.fillStyle = '#ff95b6'; ctx.fillRect(s.x - 16, s.y - 24, (e.hp / e.maxHp) * 32, 4);
  });

  state.players.forEach(p => {
    const s = worldToScreen(p.x, p.y);
    if (s.x < -40 || s.y < -40 || s.x > viewW + 40 || s.y > viewH + 40) return;
    const me = state.players.find(x => x.id === myId);
    const isMate = me && me.teamId && me.teamId === p.teamId;
    drawForm(p, s.x, s.y, isMate);
    ctx.fillStyle = isMate ? '#a3ffc2' : '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${p.name}[${p.teamId}] (${p.pveKills}/${p.pvpKills})`, s.x - 45, s.y - 26);
  });

  ctx.fillStyle = '#d6ecff';
  ctx.fillText(`地图: ${world.width} x ${world.height} | 在线: ${state.players.length}`, 12, 20);
}

function sendInput() {
  if (!socket) return;
  socket.emit('input', { up: keys.w, down: keys.s, left: keys.a, right: keys.d, attack: keys.attack });
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'w') keys.w = true;
    if (e.key === 'a') keys.a = true;
    if (e.key === 's') keys.s = true;
    if (e.key === 'd') keys.d = true;
    if (e.key.toLowerCase() === 'j') keys.attack = true;

    const idx = Number(e.key);
    if (!Number.isNaN(idx) && idx >= 0 && idx <= 9) {
      const list = Object.keys(evolutions);
      const pick = idx === 0 ? list[9] : list[idx - 1];
      if (pick && socket) {
        socket.emit('evolve', { evoId: pick });
        log(`尝试进化 -> ${evoName[pick] || pick}`);
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'w') keys.w = false;
    if (e.key === 'a') keys.a = false;
    if (e.key === 's') keys.s = false;
    if (e.key === 'd') keys.d = false;
    if (e.key.toLowerCase() === 'j') keys.attack = false;
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
    drawEvolutionList();
    connStatus.textContent = `已连接 (${payload.roomId} / 队伍:${payload.teamId})`;
    connStatus.style.background = '#1f5b34';
    log('连接成功，开始联机。');
  });

  socket.on('state', (s) => {
    state = s;
    render();
  });

  socket.on('disconnect', () => {
    connStatus.textContent = '已断开';
    connStatus.style.background = '#622e2e';
    log('连接断开。');
  });

  if (inputTimer) clearInterval(inputTimer);
  inputTimer = setInterval(sendInput, 1000 / 20);
}

teamBtn.onclick = () => {
  if (!socket) return log('请先连接服务器。');
  const teamId = teamInput.value.trim() || 'solo';
  socket.emit('setTeam', { teamId });
  log(`已请求切换队伍 -> ${teamId}`);
};

bindKeys();
resizeCanvas();
joinBtn.onclick = connect;
requestAnimationFrame(function raf() { render(); requestAnimationFrame(raf); });
