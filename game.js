const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const logBox = document.getElementById('log');
const p1Panel = document.getElementById('p1Panel');
const p2Panel = document.getElementById('p2Panel');
const modal = document.getElementById('choiceModal');
const choiceTitle = document.getElementById('choiceTitle');
const choiceButtons = document.getElementById('choiceButtons');

const W = canvas.width;
const H = canvas.height;
let pausedForChoice = false;

const keys = new Set();
document.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  keys.add(e.key);
});
document.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  keys.delete(e.key);
});

const branches = {
  exoskeleton: { name: '外骨骼', hp: 45, armor: 0.2, speed: -0.15, attack: 2, stage2: ['crab', 'beetle'] },
  lung: { name: '肺', hp: 10, armor: 0, speed: 0.15, attack: 1, stage2: ['frog', 'lizard'] },
  toxin: { name: '毒腺', hp: 0, armor: 0, speed: 0.05, attack: 4, stage2: ['jelly', 'viper'] },
};

const finals = {
  crab: { name: '巨钳蟹', bonus: { hp: 40, attack: 5, speed: -0.05, armor: 0.15 } },
  beetle: { name: '甲壳甲虫', bonus: { hp: 28, attack: 7, speed: 0.02, armor: 0.12 } },
  frog: { name: '沼泽跃蛙', bonus: { hp: 16, attack: 6, speed: 0.22, armor: 0.03 } },
  lizard: { name: '疾走蜥蜴', bonus: { hp: 20, attack: 8, speed: 0.2, armor: 0.05 } },
  jelly: { name: '雷毒水母', bonus: { hp: 15, attack: 10, speed: 0.1, armor: 0.02 } },
  viper: { name: '突袭毒蛇', bonus: { hp: 12, attack: 12, speed: 0.18, armor: 0.0 } },
};

function makePlayer(name, color, controls, x, y) {
  return {
    name,
    color,
    controls,
    x,
    y,
    r: 18,
    hp: 120,
    maxHp: 120,
    baseSpeed: 2.2,
    attack: 12,
    armor: 0,
    resource: 0,
    stage: 0,
    branch: null,
    finalForm: null,
    facing: { x: 1, y: 0 },
    dashCd: 0,
    attackCd: 0,
    pvpKills: 0,
    pveKills: 0,
  };
}

const p1 = makePlayer('玩家1', '#4de9ff', { up: 'w', down: 's', left: 'a', right: 'd', dash: 'f', atk: 'g', evo: 'r' }, 120, H / 2);
const p2 = makePlayer('玩家2', '#ff8de6', { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', dash: '/', atk: '.', evo: 'Shift' }, W - 120, H / 2);
const players = [p1, p2];

const resources = [];
const enemies = [];
const particles = [];

function spawnResource() {
  resources.push({ x: 30 + Math.random() * (W - 60), y: 30 + Math.random() * (H - 60), r: 7, value: 1 + (Math.random() > 0.8 ? 2 : 0) });
}

function spawnEnemy() {
  const elite = Math.random() > 0.85;
  enemies.push({
    x: 40 + Math.random() * (W - 80),
    y: 40 + Math.random() * (H - 80),
    r: elite ? 18 : 13,
    hp: elite ? 90 : 46,
    maxHp: elite ? 90 : 46,
    speed: elite ? 1.1 : 1.45,
    atk: elite ? 18 : 11,
    color: elite ? '#ffb84d' : '#ff5f72',
    elite,
  });
}

for (let i = 0; i < 36; i++) spawnResource();
for (let i = 0; i < 9; i++) spawnEnemy();

function addLog(msg) {
  const row = document.createElement('div');
  row.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logBox.prepend(row);
  while (logBox.childNodes.length > 16) logBox.lastChild.remove();
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function damage(target, raw, sourceName) {
  const reduced = Math.max(1, Math.floor(raw * (1 - target.armor)));
  target.hp -= reduced;
  particles.push({ x: target.x, y: target.y, text: `-${reduced}`, t: 40, color: '#ffd2d2' });
  if (target.hp <= 0) {
    target.hp = target.maxHp;
    target.x = 90 + Math.random() * (W - 180);
    target.y = 90 + Math.random() * (H - 180);
    addLog(`${sourceName} 击败了 ${target.name}（PVP）`);
    const killer = players.find((p) => p.name === sourceName);
    if (killer) {
      killer.pvpKills += 1;
      killer.resource += 10;
    }
  }
}

function doAttack(player) {
  if (player.attackCd > 0) return;
  player.attackCd = 28;
  const arcRange = player.r + 30;

  enemies.forEach((e) => {
    if (dist(player, e) < arcRange) {
      e.hp -= player.attack;
      particles.push({ x: e.x, y: e.y, text: `-${player.attack}`, t: 30, color: '#fff1ac' });
      if (e.hp <= 0) {
        player.pveKills += 1;
        player.resource += e.elite ? 12 : 5;
        particles.push({ x: e.x, y: e.y, text: '+资源', t: 40, color: '#9effd0' });
        e.hp = e.maxHp;
        e.x = 50 + Math.random() * (W - 100);
        e.y = 50 + Math.random() * (H - 100);
      }
    }
  });

  const other = players.find((p) => p !== player);
  if (dist(player, other) < arcRange) {
    damage(other, player.attack + 3, player.name);
  }
}

function openEvolutionChoice(player, options, title) {
  pausedForChoice = true;
  modal.classList.remove('hidden');
  choiceTitle.textContent = `${player.name} - ${title}`;
  choiceButtons.innerHTML = '';
  options.forEach((op) => {
    const btn = document.createElement('button');
    btn.textContent = op.label;
    btn.onclick = () => {
      op.apply();
      modal.classList.add('hidden');
      pausedForChoice = false;
    };
    choiceButtons.appendChild(btn);
  });
}

function tryEvolve(player) {
  if (player.stage === 0 && player.resource >= 25) {
    openEvolutionChoice(
      player,
      Object.entries(branches).map(([k, cfg]) => ({
        label: `${cfg.name}（HP+${cfg.hp} 攻击+${cfg.attack}）`,
        apply: () => {
          player.stage = 1;
          player.branch = k;
          player.maxHp += cfg.hp;
          player.hp = player.maxHp;
          player.attack += cfg.attack;
          player.armor += cfg.armor;
          player.baseSpeed += cfg.speed;
          player.resource -= 25;
          addLog(`${player.name} 进化到：${cfg.name}`);
        },
      })),
      '第一次进化：器官方向'
    );
  } else if (player.stage === 1 && player.resource >= 60) {
    const candidates = branches[player.branch].stage2;
    openEvolutionChoice(
      player,
      candidates.map((id) => ({
        label: finals[id].name,
        apply: () => {
          const b = finals[id].bonus;
          player.stage = 2;
          player.finalForm = id;
          player.maxHp += b.hp;
          player.hp = player.maxHp;
          player.attack += b.attack;
          player.armor += b.armor;
          player.baseSpeed += b.speed;
          player.resource -= 60;
          addLog(`${player.name} 终极进化为：${finals[id].name}`);
        },
      })),
      '第二次进化：生物形态'
    );
  }
}

function updatePlayer(player) {
  let vx = 0;
  let vy = 0;

  if (keys.has(player.controls.up)) vy -= 1;
  if (keys.has(player.controls.down)) vy += 1;
  if (keys.has(player.controls.left)) vx -= 1;
  if (keys.has(player.controls.right)) vx += 1;

  const d = normalize(vx, vy);
  if (vx || vy) player.facing = d;

  const speed = player.baseSpeed + (player.dashCd > 45 ? 2.8 : 0);
  player.x += d.x * speed;
  player.y += d.y * speed;
  player.x = Math.max(player.r, Math.min(W - player.r, player.x));
  player.y = Math.max(player.r, Math.min(H - player.r, player.y));

  if (keys.has(player.controls.dash) && player.dashCd <= 0) player.dashCd = 60;
  if (player.dashCd > 0) player.dashCd -= 1;

  if (keys.has(player.controls.atk)) doAttack(player);
  if (keys.has(player.controls.evo)) tryEvolve(player);
  if (player.attackCd > 0) player.attackCd -= 1;

  for (let i = resources.length - 1; i >= 0; i--) {
    if (dist(player, resources[i]) <= player.r + resources[i].r) {
      player.resource += resources[i].value;
      particles.push({ x: resources[i].x, y: resources[i].y, text: `+${resources[i].value}`, t: 25, color: '#74ffcc' });
      resources.splice(i, 1);
      if (resources.length < 34) spawnResource();
    }
  }
}

function updateEnemies() {
  enemies.forEach((e) => {
    const target = players.sort((a, b) => dist(a, e) - dist(b, e))[0];
    const d = normalize(target.x - e.x, target.y - e.y);
    e.x += d.x * e.speed;
    e.y += d.y * e.speed;

    if (dist(e, target) < e.r + target.r) damage(target, e.atk, `野生${e.elite ? '精英' : ''}掠食者`);
  });
}

function drawEntityCircle(o, color, stroke = '#fff') {
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#05213f';
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = i % 7 === 0 ? '#0c335e' : '#0a2748';
    ctx.fillRect((i * 73) % W, (i * 29) % H, 2, 2);
  }

  resources.forEach((r) => {
    drawEntityCircle(r, '#6effc9', '#adffe6');
  });

  enemies.forEach((e) => {
    drawEntityCircle(e, e.color, '#ffd0cf');
    ctx.fillStyle = '#290000';
    ctx.fillRect(e.x - 15, e.y - e.r - 10, 30, 4);
    ctx.fillStyle = '#ff6f7a';
    ctx.fillRect(e.x - 15, e.y - e.r - 10, (e.hp / e.maxHp) * 30, 4);
  });

  players.forEach((p) => {
    drawEntityCircle(p, p.color, '#ffffff');
    ctx.fillStyle = '#00131f';
    ctx.fillRect(p.x - 20, p.y - p.r - 10, 40, 5);
    ctx.fillStyle = '#69ffba';
    ctx.fillRect(p.x - 20, p.y - p.r - 10, (p.hp / p.maxHp) * 40, 5);
  });

  particles.forEach((pt) => {
    ctx.fillStyle = pt.color;
    ctx.font = '14px sans-serif';
    ctx.fillText(pt.text, pt.x, pt.y - (40 - pt.t) * 0.4);
    pt.t -= 1;
  });
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].t <= 0) particles.splice(i, 1);

  const winY = 26;
  ctx.font = '15px sans-serif';
  players.forEach((p, i) => {
    ctx.fillStyle = p.color;
    const finalName = p.finalForm ? finals[p.finalForm].name : (p.branch ? branches[p.branch].name : '原始细胞');
    ctx.fillText(`${p.name} | 资源:${p.resource} | 形态:${finalName} | PVE:${p.pveKills} PVP:${p.pvpKills}`, 12, winY + i * 22);
  });
}

function renderPanels() {
  const render = (p) => {
    const stageName = p.finalForm ? finals[p.finalForm].name : p.branch ? branches[p.branch].name : '未进化';
    return `
      <strong style="color:${p.color}">${p.name}</strong><br>
      生命：${p.hp}/${p.maxHp}<br>
      攻击：${p.attack} ｜ 护甲：${(p.armor * 100).toFixed(0)}%<br>
      资源：${p.resource}<br>
      进化阶段：${p.stage}（${stageName}）<br>
      战绩：PVE ${p.pveKills} / PVP ${p.pvpKills}
    `;
  };
  p1Panel.innerHTML = render(p1);
  p2Panel.innerHTML = render(p2);
}

function loop() {
  if (!pausedForChoice) {
    updatePlayer(p1);
    updatePlayer(p2);
    updateEnemies();
  }

  if (Math.random() > 0.985 && resources.length < 44) spawnResource();
  if (Math.random() > 0.992 && enemies.length < 14) spawnEnemy();

  draw();
  renderPanels();
  requestAnimationFrame(loop);
}

addLog('游戏开始：采集资源并击败敌人，按进化键进行分支进化。');
loop();
