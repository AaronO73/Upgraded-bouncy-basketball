const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const modeSelect = document.getElementById('modeSelect');
const teamSizeSelect = document.getElementById('teamSize');
const difficultySelect = document.getElementById('difficulty');
const characterSelect = document.getElementById('character');
const startBtn = document.getElementById('startBtn');
const leaderboardEl = document.getElementById('leaderboard');
const xpText = document.getElementById('xpText');
const unlocksText = document.getElementById('unlocks');

const GRAVITY = 0.42;
const FLOOR_Y = 560;
const RIM_Y = 220;
const HOOP_LEFT_X = 100;
const HOOP_RIGHT_X = 1100;

const CHARACTERS = [
  { id: 'rookie', name: 'Rookie', speed: 1, jump: 1, accuracy: 1, xp: 0 },
  { id: 'sprinter', name: 'Sprinter', speed: 1.2, jump: 0.95, accuracy: 0.95, xp: 150 },
  { id: 'sniper', name: 'Sniper', speed: 0.92, jump: 1, accuracy: 1.2, xp: 250 },
  { id: 'skywalker', name: 'Sky Walker', speed: 1, jump: 1.25, accuracy: 0.9, xp: 350 },
];

const DIFFICULTY = {
  easy: { react: 0.6, stealRate: 0.2, contest: 0.5, fakeRate: 0.2 },
  medium: { react: 0.8, stealRate: 0.38, contest: 0.72, fakeRate: 0.35 },
  hard: { react: 1, stealRate: 0.55, contest: 0.85, fakeRate: 0.5 },
};

const keys = new Set();
const state = {
  running: false,
  slowmo: 0,
  shake: 0,
  mode: 'quick',
  difficulty: 'medium',
  teamSize: 1,
  score: { player: 0, ai: 0 },
  quarterScore: [],
  xp: Number(localStorage.getItem('hoops-xp') || 0),
  unlockedPerks: JSON.parse(localStorage.getItem('hoops-perks') || '[]'),
  replayFrames: [],
  replaying: false,
};

class Player {
  constructor(x, color, team, isAI = false, stats = CHARACTERS[0]) {
    this.x = x;
    this.y = FLOOR_Y;
    this.vx = 0;
    this.vy = 0;
    this.radius = 20;
    this.color = color;
    this.team = team;
    this.isAI = isAI;
    this.hasBall = false;
    this.stats = stats;
    this.stamina = 1;
    this.intentShot = false;
    this.fakeTimer = 0;
  }

  update(delta, ball, opps) {
    this.vy += GRAVITY;
    this.x += this.vx * delta;
    this.y += this.vy * delta;

    if (this.y > FLOOR_Y) {
      this.y = FLOOR_Y;
      this.vy = 0;
      this.stamina = Math.min(1, this.stamina + 0.01 * delta);
    }

    this.vx *= 0.88;
    this.x = Math.max(40, Math.min(canvas.width - 40, this.x));

    if (this.hasBall) {
      ball.x = this.x + (this.team === 'player' ? 26 : -26);
      ball.y = this.y - 18 + Math.sin(performance.now() / 90) * 5;
      ball.vx = this.vy = 0;
    }

    for (const op of opps) {
      const dx = this.x - op.x;
      if (Math.abs(dx) < this.radius + op.radius && Math.abs(this.y - op.y) < 26) {
        this.x += dx > 0 ? 2 : -2;
        this.vx *= 0.7;
      }
    }
  }

  jump() {
    if (this.y >= FLOOR_Y - 0.1) {
      this.vy = -10 * this.stats.jump;
    }
  }

  move(dir) {
    this.vx += dir * 0.9 * this.stats.speed;
  }

  burst() {
    if (this.stamina > 0.2) {
      this.vx += (this.team === 'player' ? 1 : -1) * 4.5 * this.stats.speed;
      this.stamina -= 0.2;
    }
  }
}

class Ball {
  constructor() {
    this.x = canvas.width / 2;
    this.y = 200;
    this.vx = 0;
    this.vy = 0;
    this.r = 12;
    this.owner = null;
  }

  update(delta) {
    if (this.owner) return;
    this.vy += GRAVITY;
    this.x += this.vx * delta;
    this.y += this.vy * delta;

    if (this.y > FLOOR_Y - 2) {
      this.y = FLOOR_Y - 2;
      this.vy *= -0.68;
      this.vx *= 0.94;
      if (Math.abs(this.vy) < 1.3) this.vy = 0;
    }

    if (this.x < this.r || this.x > canvas.width - this.r) {
      this.vx *= -0.82;
      this.x = Math.max(this.r, Math.min(canvas.width - this.r, this.x));
    }
  }
}

const game = {
  players: [],
  aiPlayers: [],
  ball: new Ball(),
  shotCharge: 0,
  shotTiming: 0,
  tournamentRound: 0,
};

function loadCharacters() {
  characterSelect.innerHTML = '';
  CHARACTERS.forEach((char) => {
    if (state.xp >= char.xp || char.xp === 0) {
      const option = document.createElement('option');
      option.value = char.id;
      option.textContent = `${char.name} (${char.speed.toFixed(2)} SPD)`;
      characterSelect.append(option);
    }
  });
}

function updateProgressionUI() {
  xpText.textContent = `XP: ${state.xp}. Win games to unlock players + perks.`;
  const unlocked = CHARACTERS.filter((c) => state.xp >= c.xp).map((c) => c.name);
  unlocksText.textContent = `Unlocked: ${unlocked.join(', ')}`;
}

function resetMatch() {
  state.score = { player: 0, ai: 0 };
  game.players = [];
  game.aiPlayers = [];

  const chosen = CHARACTERS.find((c) => c.id === characterSelect.value) || CHARACTERS[0];
  for (let i = 0; i < state.teamSize; i += 1) {
    game.players.push(new Player(300 + i * 90, '#4df3ff', 'player', false, chosen));
    game.aiPlayers.push(new Player(850 - i * 90, '#ff7cb8', 'ai', true, CHARACTERS[Math.min(i + 1, CHARACTERS.length - 1)]));
  }

  game.players[0].hasBall = true;
  game.ball.owner = game.players[0];
  game.ball.x = game.players[0].x;
  game.ball.y = game.players[0].y;
}

function begin() {
  state.mode = modeSelect.value;
  state.difficulty = difficultySelect.value;
  state.teamSize = Number(teamSizeSelect.value);
  state.running = true;
  game.tournamentRound = 0;
  resetMatch();
}

function shoot(player, holdMs) {
  if (!player.hasBall) return;
  const hoopX = player.team === 'player' ? HOOP_RIGHT_X : HOOP_LEFT_X;
  const dist = Math.abs(hoopX - player.x);
  const difficultyStats = DIFFICULTY[state.difficulty];
  const angle = Math.atan2(player.y - RIM_Y, hoopX - player.x);
  const timingWindow = 380 / player.stats.accuracy;
  const timingScore = 1 - Math.min(1, Math.abs(holdMs - timingWindow) / timingWindow);
  const power = Math.min(15, 9 + holdMs / 110 + dist / 220);

  game.ball.owner = null;
  player.hasBall = false;
  game.ball.vx = Math.cos(angle) * power;
  game.ball.vy = -Math.sin(angle) * power - 4;

  const perkBoost = state.unlockedPerks.includes('clutch') ? 0.08 : 0;
  game.shotTiming = timingScore + perkBoost - (player.isAI ? -difficultyStats.react * 0.06 : 0);
}

function attemptSteal(actor, target) {
  if (!target.hasBall) return;
  const dist = Math.hypot(actor.x - target.x, actor.y - target.y);
  const chance = actor.isAI ? DIFFICULTY[state.difficulty].stealRate : 0.34;
  if (dist < 44 && Math.random() < chance) {
    target.hasBall = false;
    actor.hasBall = true;
    game.ball.owner = actor;
    state.shake = 5;
  }
}

function aiDecision(ai, dt) {
  const diff = DIFFICULTY[state.difficulty];
  const human = game.players[0];
  const hoopX = HOOP_LEFT_X;

  if (ai.hasBall) {
    const distToHoop = Math.abs(ai.x - hoopX);
    if (Math.random() < diff.fakeRate * 0.01 && ai.fakeTimer <= 0) {
      ai.fakeTimer = 35;
    }

    if (ai.fakeTimer > 0) {
      ai.fakeTimer -= dt;
      ai.move(1);
      return;
    }

    if (distToHoop > 240) ai.move(-1);
    if (distToHoop < 360 && Math.random() < 0.02 * diff.react) shoot(ai, 350 + Math.random() * 170);
  } else {
    const targetX = game.ball.owner ? game.ball.owner.x : game.ball.x;
    ai.move(targetX < ai.x ? -1 : 1);
    if (Math.random() < 0.008 * diff.contest) ai.jump();
    if (Math.abs(ai.x - human.x) < 36) attemptSteal(ai, human);
  }
}

function detectPossession() {
  if (game.ball.owner) return;
  const everyone = [...game.players, ...game.aiPlayers];
  for (const p of everyone) {
    const d = Math.hypot(p.x - game.ball.x, p.y - 18 - game.ball.y);
    if (d < p.radius + game.ball.r + 4 && p.y > FLOOR_Y - 5) {
      everyone.forEach((e) => (e.hasBall = false));
      p.hasBall = true;
      game.ball.owner = p;
      break;
    }
  }
}

function checkScoring() {
  const ball = game.ball;
  const leftScore = ball.x > HOOP_LEFT_X - 24 && ball.x < HOOP_LEFT_X + 24 && ball.y > RIM_Y - 10 && ball.y < RIM_Y + 12 && ball.vy > 1;
  const rightScore = ball.x > HOOP_RIGHT_X - 24 && ball.x < HOOP_RIGHT_X + 24 && ball.y > RIM_Y - 10 && ball.y < RIM_Y + 12 && ball.vy > 1;

  if (!leftScore && !rightScore) return;

  const playerMade = rightScore ? false : true;
  const basePoints = Math.abs(ball.x - canvas.width / 2) > 250 ? 3 : 2;
  const points = game.shotTiming > 0.72 ? basePoints + 1 : basePoints;

  if (playerMade) {
    state.score.player += points;
    state.xp += 15 + points * 2;
    if (points >= 3) state.slowmo = 40;
  } else {
    state.score.ai += basePoints;
  }

  if (state.xp > 120 && !state.unlockedPerks.includes('clutch')) {
    state.unlockedPerks.push('clutch');
    localStorage.setItem('hoops-perks', JSON.stringify(state.unlockedPerks));
  }

  localStorage.setItem('hoops-xp', String(state.xp));
  updateProgressionUI();
  loadCharacters();

  state.shake = 12;
  game.replayFrames = state.replayFrames.slice(-160);
  resetTipoff(playerMade ? 'ai' : 'player');
}

function resetTipoff(toTeam) {
  game.ball = new Ball();
  [...game.players, ...game.aiPlayers].forEach((p) => {
    p.hasBall = false;
    p.y = FLOOR_Y;
    p.vy = 0;
  });

  if (toTeam === 'player') {
    game.players[0].x = 280;
    game.players[0].hasBall = true;
    game.ball.owner = game.players[0];
  } else {
    game.aiPlayers[0].x = 920;
    game.aiPlayers[0].hasBall = true;
    game.ball.owner = game.aiPlayers[0];
  }
}

function updateLeaderboard() {
  const board = JSON.parse(localStorage.getItem('hoops-board') || '[]');
  leaderboardEl.innerHTML = '';
  board.slice(0, 5).forEach((row) => {
    const li = document.createElement('li');
    li.textContent = `${row.mode.toUpperCase()} ${row.score} - ${row.date}`;
    leaderboardEl.append(li);
  });
}

function saveResult() {
  const board = JSON.parse(localStorage.getItem('hoops-board') || '[]');
  board.push({
    mode: state.mode,
    score: `${state.score.player}:${state.score.ai}`,
    date: new Date().toLocaleDateString(),
  });
  board.sort((a, b) => Number(b.score.split(':')[0]) - Number(a.score.split(':')[0]));
  localStorage.setItem('hoops-board', JSON.stringify(board.slice(0, 20)));
  updateLeaderboard();
}

function update(dt) {
  if (!state.running || state.replaying) return;
  const delta = state.slowmo > 0 ? dt * 0.5 : dt;

  const p = game.players[0];
  if (keys.has('a') || keys.has('arrowleft')) p.move(-1);
  if (keys.has('d') || keys.has('arrowright')) p.move(1);

  game.players.forEach((pl) => pl.update(delta, game.ball, game.aiPlayers));
  game.aiPlayers.forEach((ai) => {
    aiDecision(ai, delta);
    ai.update(delta, game.ball, game.players);
  });

  if (!game.ball.owner) game.ball.update(delta);
  detectPossession();
  checkScoring();

  if (state.slowmo > 0) state.slowmo -= 1;
  if (state.shake > 0) state.shake -= 1;

  if (state.mode === 'tournament' && (state.score.player >= 11 || state.score.ai >= 11)) {
    state.running = false;
    state.quarterScore.push(`${state.score.player}-${state.score.ai}`);
    game.tournamentRound += 1;
    if (game.tournamentRound < 3) {
      resetMatch();
      state.running = true;
    } else {
      saveResult();
    }
  }

  state.replayFrames.push(snapshot());
  if (state.replayFrames.length > 220) state.replayFrames.shift();
}

function snapshot() {
  return {
    score: { ...state.score },
    ball: { ...game.ball },
    players: game.players.map((p) => ({ ...p })),
    ai: game.aiPlayers.map((a) => ({ ...a })),
  };
}

function drawCourt() {
  ctx.save();
  if (state.shake > 0) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#2f5f89');
  grad.addColorStop(1, '#12304a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 40; i += 1) {
    ctx.fillRect(i * 32, 40 + Math.sin(i * 0.7) * 8, 2, 16);
  }

  ctx.strokeStyle = '#f5e9ca';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 20);
  ctx.lineTo(canvas.width / 2, canvas.height - 40);
  ctx.stroke();

  drawHoop(HOOP_LEFT_X);
  drawHoop(HOOP_RIGHT_X);

  ctx.restore();
}

function drawHoop(x) {
  ctx.fillStyle = '#ff4f49';
  ctx.fillRect(x - 30, RIM_Y - 8, 60, 4);
  ctx.strokeStyle = '#d7dfea';
  ctx.strokeRect(x - 50, RIM_Y - 40, 12, 48);
}

function drawPlayer(p) {
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 26, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillRect(p.x - 10, p.y - 12, 20, 26);
  ctx.fillStyle = '#ffffff99';
  ctx.fillRect(p.x - 11, p.y + 18, 22 * p.stamina, 4);
}

function drawBall(ball) {
  ctx.fillStyle = '#d48b33';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a2f14';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r - 1, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHUD() {
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 26px Segoe UI';
  ctx.fillText(`PLAYER ${state.score.player} : ${state.score.ai} CPU`, canvas.width / 2 - 130, 58);

  if (state.slowmo > 0) {
    ctx.fillStyle = '#4df3ff';
    ctx.font = '700 30px Segoe UI';
    ctx.fillText('SLOW MO!', canvas.width / 2 - 70, 95);
  }

  if (!state.running) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 36px Segoe UI';
    ctx.fillText('Press Start Match', canvas.width / 2 - 150, canvas.height / 2);
  }
}

function renderReplay() {
  if (!game.replayFrames.length) return;
  state.replaying = true;
  let idx = 0;

  function next() {
    const frame = game.replayFrames[idx];
    if (!frame) {
      state.replaying = false;
      return;
    }

    drawCourt();
    frame.players.forEach(drawPlayer);
    frame.ai.forEach(drawPlayer);
    drawBall(frame.ball);
    ctx.fillStyle = '#fff';
    ctx.fillText('REPLAY', canvas.width / 2 - 40, 100);

    idx += 3;
    requestAnimationFrame(next);
  }

  next();
}

function draw() {
  drawCourt();
  game.players.forEach(drawPlayer);
  game.aiPlayers.forEach(drawPlayer);
  drawBall(game.ball);
  drawHUD();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(2, (now - last) / 16.67);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  const player = game.players[0];
  if (!player) return;

  if (e.key.toLowerCase() === 'w' || e.key === 'ArrowUp') player.jump();
  if (e.key.toLowerCase() === 'j') player.burst();
  if (e.key.toLowerCase() === 'l') attemptSteal(player, game.aiPlayers[0]);

  if (e.key.toLowerCase() === 'k') game.shotCharge = performance.now();
  if (e.key.toLowerCase() === 'r') renderReplay();
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  const player = game.players[0];
  if (!player) return;

  if (e.key.toLowerCase() === 'k' && game.shotCharge > 0) {
    shoot(player, performance.now() - game.shotCharge);
    game.shotCharge = 0;
  }
});

startBtn.addEventListener('click', begin);

loadCharacters();
updateProgressionUI();
updateLeaderboard();
requestAnimationFrame(loop);
