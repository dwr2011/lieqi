const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('.'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const WORLD = { width: 4200, height: 3000 };
const TICK_RATE = 30;
const rooms = new Map();

function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

const EVOLUTIONS = {
  photosynthesis: { costs: { protein: 2, mineral: 2, gas: 2 }, bonus: { maxHp: 10, armor: 0.03, attack: 0, speed: 0.12 }, form: 'photo_cell' },
  attack_organelle: { costs: { protein: 5, mineral: 2, gas: 1 }, bonus: { maxHp: 6, armor: 0.02, attack: 5, speed: 0.05 }, form: 'spike_cell' },
  multicell: { costs: { protein: 6, mineral: 5, gas: 3 }, bonus: { maxHp: 24, armor: 0.08, attack: 2, speed: -0.02 }, form: 'cluster_cell' },
  exoskeleton: { costs: { protein: 8, mineral: 16, gas: 2 }, bonus: { maxHp: 50, armor: 0.18, attack: 3, speed: -0.2 }, form: 'armored_cell' },
  lung: { costs: { protein: 14, mineral: 3, gas: 12 }, bonus: { maxHp: 16, armor: 0.03, attack: 2, speed: 0.35 }, form: 'aero_cell' },
  toxin: { costs: { protein: 10, mineral: 5, gas: 12 }, bonus: { maxHp: 8, armor: 0.04, attack: 7, speed: 0.1 }, form: 'toxic_cell' },
  fin: { costs: { protein: 12, mineral: 6, gas: 7 }, bonus: { maxHp: 20, armor: 0.02, attack: 4, speed: 0.3 }, form: 'fin_cell' },
  spores: { costs: { protein: 6, mineral: 8, gas: 14 }, bonus: { maxHp: 26, armor: 0.1, attack: 3, speed: 0.12 }, form: 'spore_cell' },
  crab: { costs: { protein: 24, mineral: 30, gas: 8 }, bonus: { maxHp: 60, armor: 0.14, attack: 8, speed: -0.05 }, form: 'crab' },
  lizard: { costs: { protein: 30, mineral: 10, gas: 20 }, bonus: { maxHp: 24, armor: 0.06, attack: 12, speed: 0.25 }, form: 'lizard' },
  jelly: { costs: { protein: 16, mineral: 12, gas: 34 }, bonus: { maxHp: 22, armor: 0.04, attack: 13, speed: 0.2 }, form: 'jelly' },
  ray: { costs: { protein: 28, mineral: 20, gas: 16 }, bonus: { maxHp: 32, armor: 0.08, attack: 10, speed: 0.18 }, form: 'ray' },
  beetle: { costs: { protein: 22, mineral: 32, gas: 10 }, bonus: { maxHp: 48, armor: 0.16, attack: 9, speed: 0.0 }, form: 'beetle' },
};

function canBuy(store, costs) {
  return Object.entries(costs).every(([k, v]) => store[k] >= v);
}

function spawnResource(room, type) {
  room.resources.push({ id: Math.random().toString(36).slice(2), x: rand(30, WORLD.width - 30), y: rand(30, WORLD.height - 30), type, value: 1 + (Math.random() > 0.85 ? 1 : 0) });
}

function spawnEnemy(room) {
  room.enemies.push({
    id: Math.random().toString(36).slice(2), x: rand(100, WORLD.width - 100), y: rand(100, WORLD.height - 100),
    r: 18, hp: 120, maxHp: 120, speed: 1.2, attack: 10,
    state: 'wander', stateTick: 50, dirX: rand(-1, 1), dirY: rand(-1, 1), aggro: null,
  });
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

function createPlayer(id, name, roomId, teamId = 'solo') {
  return {
    id, roomId, teamId, name,
    x: rand(200, WORLD.width - 200), y: rand(200, WORLD.height - 200),
    r: 20, hp: 150, maxHp: 150, speed: 3.2, attack: 14, armor: 0,
    form: 'cell', branch: null, pveKills: 0, pvpKills: 0,
    resources: { protein: 0, mineral: 0, gas: 0 },
    input: { up: false, down: false, left: false, right: false, attack: false },
    cooldown: 0,
  };
}

function hitPlayer(target, dmg) {
  const final = Math.max(1, Math.floor(dmg * (1 - target.armor)));
  target.hp -= final;
  if (target.hp <= 0) {
    target.hp = target.maxHp;
    target.x = rand(150, WORLD.width - 150);
    target.y = rand(150, WORLD.height - 150);
    return true;
  }
  return false;
}

function enemyBrain(room, e) {
  e.stateTick -= 1;
  if (e.stateTick <= 0) {
    const pick = Math.random();
    e.state = pick < 0.55 ? 'wander' : pick < 0.8 ? 'idle' : 'patrol';
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

  if (nearest && best < 280 && Math.random() > 0.4) e.aggro = nearest.id;
  if (!nearest || best > 460 || Math.random() < 0.01) e.aggro = null;

  if (e.aggro && room.players.has(e.aggro)) {
    const t = room.players.get(e.aggro);
    const dx = t.x - e.x;
    const dy = t.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    e.x += (dx / len) * e.speed * 1.15;
    e.y += (dy / len) * e.speed * 1.15;
    if (dist(e, t) < e.r + t.r) hitPlayer(t, e.attack);
    return;
  }

  if (e.state === 'idle') return;
  const m = e.state === 'patrol' ? 0.8 : 0.5;
  e.x += e.dirX * e.speed * m;
  e.y += e.dirY * e.speed * m;
  if (e.x < 40 || e.x > WORLD.width - 40) e.dirX *= -1;
  if (e.y < 40 || e.y > WORLD.height - 40) e.dirY *= -1;
}

function applyEvolution(player, evoId) {
  const evo = EVOLUTIONS[evoId];
  if (!evo || !canBuy(player.resources, evo.costs)) return false;
  Object.entries(evo.costs).forEach(([k, v]) => { player.resources[k] -= v; });
  player.maxHp += evo.bonus.maxHp;
  player.hp = player.maxHp;
  player.attack += evo.bonus.attack;
  player.speed += evo.bonus.speed;
  player.armor = clamp(player.armor + evo.bonus.armor, 0, 0.6);
  player.form = evo.form;
  if (!player.branch) player.branch = evoId;
  return true;
}

function tickRoom(room) {
  for (const p of room.players.values()) {
    const dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    const dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + (dx / len) * p.speed, p.r, WORLD.width - p.r);
    p.y = clamp(p.y + (dy / len) * p.speed, p.r, WORLD.height - p.r);

    if (p.cooldown > 0) p.cooldown -= 1;
    if (p.input.attack && p.cooldown === 0) {
      p.cooldown = 14;
      for (const e of room.enemies) {
        if (dist(p, e) < p.r + e.r + 18) {
          e.hp -= p.attack;
          if (e.hp <= 0) {
            p.pveKills += 1;
            p.resources.protein += 2;
            p.resources.mineral += 1;
            if (p.form === 'photo_cell' && Math.random() > 0.5) p.resources.gas += 1;
            e.hp = e.maxHp;
            e.x = rand(100, WORLD.width - 100);
            e.y = rand(100, WORLD.height - 100);
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

    if (p.form === 'photo_cell' && Math.random() > 0.96) p.resources.gas += 1;

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
    roomState.players.set(socket.id, createPlayer(socket.id, nick, room, team));
    socket.data.roomId = room;
    socket.emit('welcome', { id: socket.id, roomId: room, teamId: team, world: WORLD, evolutions: EVOLUTIONS });
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
    if (p) applyEvolution(p, evoId);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    room.players.delete(socket.id);
    if (room.players.size === 0) rooms.delete(roomId);
  });
});

setInterval(() => {
  rooms.forEach((room) => tickRoom(room));
}, 1000 / TICK_RATE);

server.listen(3000, () => {
  console.log('Server listening on http://localhost:3000');
});
