const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('.'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const WORLD = { width: 4200, height: 3000 };
const TICK_RATE = 30;
const SAVE_FILE = path.join(__dirname, 'saves.json');
const rooms = new Map();

function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

const EVOLUTIONS = {
  photosynthesis: {
    costs: { protein: 2, mineral: 2, gas: 2 },
    bonus: { maxHp: 12, armor: 0.03, attack: 0, speed: 0.16 },
    form: 'photo_cell',
    prereqAny: [],
    label: '光合作用',
    desc: '被动产气体，续航强，适合发育流。',
  },
  attack_organelle: {
    costs: { protein: 5, mineral: 2, gas: 1 },
    bonus: { maxHp: 8, armor: 0.02, attack: 5, speed: 0.08 },
    form: 'spike_cell',
    prereqAny: [],
    label: '攻击器官',
    desc: '近战爆发提升，前期打架更强。',
  },
  multicell: {
    costs: { protein: 6, mineral: 5, gas: 3 },
    bonus: { maxHp: 28, armor: 0.09, attack: 2, speed: 0.02 },
    form: 'cluster_cell',
    prereqAny: [],
    label: '多细胞',
    desc: '大幅增加生存能力，解锁高级生物分支。',
  },
  exoskeleton: {
    costs: { protein: 8, mineral: 16, gas: 2 },
    bonus: { maxHp: 48, armor: 0.18, attack: 3, speed: -0.18 },
    form: 'armored_cell',
    prereqAny: ['multicell', 'attack_organelle'],
    label: '外骨骼',
    desc: '护甲显著提高，但略微降低机动。',
  },
  lung: {
    costs: { protein: 14, mineral: 3, gas: 12 },
    bonus: { maxHp: 16, armor: 0.03, attack: 2, speed: 0.32 },
    form: 'aero_cell',
    prereqAny: ['photosynthesis', 'multicell'],
    label: '肺化',
    desc: '提高速度与机动，是陆生路线核心。',
  },
  toxin: {
    costs: { protein: 10, mineral: 5, gas: 12 },
    bonus: { maxHp: 10, armor: 0.04, attack: 7, speed: 0.1 },
    form: 'toxic_cell',
    prereqAny: ['attack_organelle', 'photosynthesis'],
    label: '毒腺',
    desc: '攻击成长高，适合PVP压制。',
  },
  fin: {
    costs: { protein: 12, mineral: 6, gas: 7 },
    bonus: { maxHp: 20, armor: 0.02, attack: 4, speed: 0.26 },
    form: 'fin_cell',
    prereqAny: ['lung', 'photosynthesis'],
    label: '鳍化',
    desc: '游走能力更强，追击与拉扯更轻松。',
  },
  spores: {
    costs: { protein: 6, mineral: 8, gas: 14 },
    bonus: { maxHp: 24, armor: 0.1, attack: 3, speed: 0.12 },
    form: 'spore_cell',
    prereqAny: ['photosynthesis', 'multicell'],
    label: '孢子化',
    desc: '综合属性稳健，偏中后期发育。',
  },
  human: {
    costs: { protein: 38, mineral: 22, gas: 28 },
    bonus: { maxHp: 70, armor: 0.12, attack: 10, speed: 0.35 },
    form: 'human',
    prereqAny: ['multicell', 'lung'],
    label: '人类',
    desc: '全面型终极形态，攻防机动均衡。',
  },
  leopard: {
    costs: { protein: 34, mineral: 16, gas: 20 },
    bonus: { maxHp: 42, armor: 0.06, attack: 17, speed: 0.6 },
    form: 'leopard',
    prereqAny: ['attack_organelle', 'lung'],
    label: '豹',
    desc: '高机动高爆发，适合突袭收割。',
  },
  dinosaur: {
    costs: { protein: 46, mineral: 30, gas: 16 },
    bonus: { maxHp: 115, armor: 0.2, attack: 16, speed: 0.1 },
    form: 'dinosaur',
    prereqAny: ['multicell', 'exoskeleton'],
    label: '恐龙',
    desc: '高血量高护甲，正面推进最强。',
  },
  crab: {
    costs: { protein: 24, mineral: 30, gas: 8 },
    bonus: { maxHp: 60, armor: 0.14, attack: 8, speed: -0.05 },
    form: 'crab',
    prereqAny: ['exoskeleton', 'fin'],
    label: '巨钳蟹',
    desc: '防御厚重，适合前排缠斗。',
  },
  lizard: {
    costs: { protein: 30, mineral: 10, gas: 20 },
    bonus: { maxHp: 24, armor: 0.06, attack: 12, speed: 0.25 },
    form: 'lizard',
    prereqAny: ['lung', 'attack_organelle'],
    label: '疾走蜥蜴',
    desc: '速度快，适合游击和追杀。',
  },
  jelly: {
    costs: { protein: 16, mineral: 12, gas: 34 },
    bonus: { maxHp: 22, armor: 0.04, attack: 13, speed: 0.2 },
    form: 'jelly',
    prereqAny: ['spores', 'toxin'],
    label: '雷毒水母',
    desc: '高毒性输出，脆皮克星。',
  },
  ray: {
    costs: { protein: 28, mineral: 20, gas: 16 },
    bonus: { maxHp: 32, armor: 0.08, attack: 10, speed: 0.18 },
    form: 'ray',
    prereqAny: ['fin', 'lung'],
    label: '深海鳐',
    desc: '稳定追击，偏均衡。',
  },
  beetle: {
    costs: { protein: 22, mineral: 32, gas: 10 },
    bonus: { maxHp: 48, armor: 0.16, attack: 9, speed: 0.0 },
    form: 'beetle',
    prereqAny: ['exoskeleton', 'multicell'],
    label: '甲壳甲虫',
    desc: '硬度高，适合持久战。',
  },
};

function canBuy(store, costs) {
  return Object.entries(costs).every(([k, v]) => store[k] >= v);
}

function canUnlock(player, evoId) {
  const evo = EVOLUTIONS[evoId];
  if (!evo) return false;
  if (player.evolutions.includes(evoId)) return false;
  if (!evo.prereqAny || evo.prereqAny.length === 0) return true;
  return evo.prereqAny.some((need) => player.evolutions.includes(need));
}

function getAvailableEvolutions(player) {
  return Object.keys(EVOLUTIONS).filter((id) => canUnlock(player, id));
}

function spawnResource(room, type) {
  room.resources.push({ id: Math.random().toString(36).slice(2), x: rand(30, WORLD.width - 30), y: rand(30, WORLD.height - 30), type, value: 1 + (Math.random() > 0.85 ? 1 : 0) });
}

function spawnEnemy(room) {
  room.enemies.push({
    id: Math.random().toString(36).slice(2), x: rand(100, WORLD.width - 100), y: rand(100, WORLD.height - 100),
    r: 18, hp: 120, maxHp: 120, speed: 1.05, attack: 6, cooldown: 0,
    state: 'wander', stateTick: 50, dirX: rand(-1, 1), dirY: rand(-1, 1), aggro: null,
  });
}

function readSaveMap() {
  try {
    if (!fs.existsSync(SAVE_FILE)) return {};
    return JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeSaveMap(map) {
  fs.writeFileSync(SAVE_FILE, JSON.stringify(map, null, 2), 'utf8');
}

function getRoomState(roomId) {
  if (!rooms.has(roomId)) {
    const room = { roomId, players: new Map(), resources: [], enemies: [] };
    for (let i = 0; i < 140; i++) spawnResource(room, ['protein', 'mineral', 'gas'][i % 3]);
    for (let i = 0; i < 18; i++) spawnEnemy(room);
    rooms.set(roomId, room);
  }
  return rooms.get(roomId);
}

function createPlayer(id, name, roomId, teamId = 'solo', saveData = null) {
  return {
    id, roomId, teamId, name,
    x: rand(200, WORLD.width - 200), y: rand(200, WORLD.height - 200),
    vx: 0, vy: 0,
    r: 20,
    hp: saveData?.hp ?? 150,
    maxHp: saveData?.maxHp ?? 150,
    speed: saveData?.speed ?? 3.6,
    attack: saveData?.attack ?? 14,
    armor: saveData?.armor ?? 0,
    form: saveData?.form ?? 'cell',
    branch: saveData?.branch ?? null,
    evolutions: Array.isArray(saveData?.evolutions) ? saveData.evolutions : [],
    pveKills: saveData?.pveKills ?? 0,
    pvpKills: saveData?.pvpKills ?? 0,
    resources: saveData?.resources ?? { protein: 0, mineral: 0, gas: 0 },
    input: { up: false, down: false, left: false, right: false, attack: false },
    cooldown: 0,
  };
}

function savePlayerProgress(player) {
  const saveMap = readSaveMap();
  saveMap[player.name] = {
    maxHp: player.maxHp,
    hp: clamp(player.hp, 1, player.maxHp),
    speed: player.speed,
    attack: player.attack,
    armor: player.armor,
    form: player.form,
    branch: player.branch,
    evolutions: player.evolutions,
    pveKills: player.pveKills,
    pvpKills: player.pvpKills,
    resources: player.resources,
    updatedAt: Date.now(),
  };
  writeSaveMap(saveMap);
}

function hitPlayer(target, dmg) {
  const final = Math.max(1, Math.floor(dmg * (1 - target.armor)));
  target.hp -= final;
  if (target.hp <= 0) {
    target.hp = target.maxHp;
    target.x = rand(150, WORLD.width - 150);
    target.y = rand(150, WORLD.height - 150);
    target.vx = 0;
    target.vy = 0;
    return true;
  }
  return false;
}

function enemyBrain(room, e) {
  e.stateTick -= 1;
  if (e.cooldown > 0) e.cooldown -= 1;
  if (e.stateTick <= 0) {
    const pick = Math.random();
    e.state = pick < 0.58 ? 'wander' : pick < 0.84 ? 'idle' : 'patrol';
    e.stateTick = Math.floor(rand(35, 90));
    e.dirX = rand(-1, 1);
    e.dirY = rand(-1, 1);
  }

  let nearest = null;
  let best = Infinity;
  for (const p of room.players.values()) {
    const d = dist(e, p);
    if (d < best) { best = d; nearest = p; }
  }

  if (nearest && best < 250 && Math.random() > 0.45) e.aggro = nearest.id;
  if (!nearest || best > 420 || Math.random() < 0.02) e.aggro = null;

  if (e.aggro && room.players.has(e.aggro)) {
    const t = room.players.get(e.aggro);
    const dx = t.x - e.x;
    const dy = t.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    e.x += (dx / len) * e.speed * 1.12;
    e.y += (dy / len) * e.speed * 1.12;
    if (dist(e, t) < e.r + t.r && e.cooldown === 0) {
      hitPlayer(t, e.attack);
      e.cooldown = 22;
    }
    return;
  }

  if (e.state === 'idle') return;
  const m = e.state === 'patrol' ? 0.76 : 0.46;
  e.x += e.dirX * e.speed * m;
  e.y += e.dirY * e.speed * m;
  if (e.x < 40 || e.x > WORLD.width - 40) e.dirX *= -1;
  if (e.y < 40 || e.y > WORLD.height - 40) e.dirY *= -1;
}

function applyEvolution(player, evoId) {
  const evo = EVOLUTIONS[evoId];
  if (!evo || !canUnlock(player, evoId) || !canBuy(player.resources, evo.costs)) return false;
  Object.entries(evo.costs).forEach(([k, v]) => { player.resources[k] -= v; });
  player.maxHp += evo.bonus.maxHp;
  player.hp = player.maxHp;
  player.attack += evo.bonus.attack;
  player.speed += evo.bonus.speed;
  player.armor = clamp(player.armor + evo.bonus.armor, 0, 0.65);
  player.form = evo.form;
  player.evolutions.push(evoId);
  if (!player.branch) player.branch = evoId;
  return true;
}

function tickRoom(room) {
  for (const p of room.players.values()) {
    const dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    const dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    const targetVx = (dx / len) * p.speed;
    const targetVy = (dy / len) * p.speed;
    p.vx += (targetVx - p.vx) * 0.25;
    p.vy += (targetVy - p.vy) * 0.25;
    if (dx === 0 && dy === 0) {
      p.vx *= 0.82;
      p.vy *= 0.82;
    }

    p.x = clamp(p.x + p.vx, p.r, WORLD.width - p.r);
    p.y = clamp(p.y + p.vy, p.r, WORLD.height - p.r);

    if (p.cooldown > 0) p.cooldown -= 1;
    if (p.input.attack && p.cooldown === 0) {
      p.cooldown = 12;
      for (const e of room.enemies) {
        if (dist(p, e) < p.r + e.r + 18) {
          e.hp -= p.attack;
          if (e.hp <= 0) {
            p.pveKills += 1;
            p.resources.protein += 2;
            p.resources.mineral += 1;
            if (p.form === 'photo_cell' && Math.random() > 0.45) p.resources.gas += 1;
            e.hp = e.maxHp;
            e.x = rand(100, WORLD.width - 100);
            e.y = rand(100, WORLD.height - 100);
            e.cooldown = 0;
          }
        }
      }
      for (const other of room.players.values()) {
        if (other.id !== p.id && dist(p, other) < p.r + other.r + 12) {
          if (p.teamId && other.teamId && p.teamId === other.teamId) continue;
          const killed = hitPlayer(other, p.attack + 4);
          if (killed) {
            p.pvpKills += 1;
            p.resources.gas += 2;
          }
        }
      }
    }

    if (p.form === 'photo_cell' && Math.random() > 0.965) p.resources.gas += 1;

    for (let i = room.resources.length - 1; i >= 0; i--) {
      if (dist(p, room.resources[i]) < p.r + 9) {
        p.resources[room.resources[i].type] += room.resources[i].value;
        room.resources.splice(i, 1);
      }
    }
  }

  while (room.resources.length < 180) spawnResource(room, ['protein', 'mineral', 'gas'][Math.floor(Math.random() * 3)]);
  room.enemies.forEach((e) => enemyBrain(room, e));

  io.to(room.roomId).emit('state', {
    players: Array.from(room.players.values()),
    resources: room.resources,
    enemies: room.enemies,
    world: WORLD,
    t: Date.now(),
  });
}

io.on('connection', (socket) => {
  socket.on('join', ({ name, roomId, teamId }) => {
    const nick = (name || '玩家').slice(0, 12);
    const room = (roomId || 'main').slice(0, 20);
    const team = (teamId || 'solo').slice(0, 20);
    socket.join(room);
    const roomState = getRoomState(room);
    const saveData = readSaveMap()[nick] || null;
    roomState.players.set(socket.id, createPlayer(socket.id, nick, room, team, saveData));
    socket.data.roomId = room;
    socket.emit('welcome', {
      id: socket.id,
      roomId: room,
      teamId: team,
      world: WORLD,
      evolutions: EVOLUTIONS,
      availableEvolutions: getAvailableEvolutions(roomState.players.get(socket.id)),
      loadedSave: Boolean(saveData),
    });
  });

  socket.on('setTeam', ({ teamId }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const p = rooms.get(roomId).players.get(socket.id);
    if (p) p.teamId = (teamId || 'solo').slice(0, 20);
  });

  socket.on('input', (input) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const p = rooms.get(roomId).players.get(socket.id);
    if (p) p.input = { ...p.input, ...input };
  });

  socket.on('evolve', ({ evoId }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const p = rooms.get(roomId).players.get(socket.id);
    if (!p) return;
    const ok = applyEvolution(p, evoId);
    socket.emit('evolveResult', { ok, evoId, availableEvolutions: getAvailableEvolutions(p) });
  });

  socket.on('saveProgress', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const p = rooms.get(roomId).players.get(socket.id);
    if (!p) return;
    savePlayerProgress(p);
    socket.emit('saved', { at: Date.now() });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const leaving = room.players.get(socket.id);
    if (leaving) savePlayerProgress(leaving);
    room.players.delete(socket.id);
    if (room.players.size === 0) rooms.delete(roomId);
  });
});

setInterval(() => {
  rooms.forEach((room) => tickRoom(room));
}, 1000 / TICK_RATE);

setInterval(() => {
  rooms.forEach((room) => {
    room.players.forEach((p) => savePlayerProgress(p));
  });
}, 45000);

server.listen(3000, () => {
  console.log('Server listening on http://localhost:3000');
});
