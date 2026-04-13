const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const modeSelect = document.getElementById('modeSelect');
const formatSelect = document.getElementById('formatSelect');
const difficultySelect = document.getElementById('difficultySelect');
const teamSelect = document.getElementById('teamSelect');
const startBtn = document.getElementById('startBtn');
const meterFill = document.getElementById('meterFill');
const profileText = document.getElementById('profileText');
const skillText = document.getElementById('skillText');
const leaderboardEl = document.getElementById('leaderboard');

const COURT = { w: 1180, h: 620, left: 90, top: 75, floorY: 640 };
const HOOPS = {
  left: { x: COURT.left + 52, y: COURT.top + COURT.h * 0.5, z: 150 },
  right: { x: COURT.left + COURT.w - 52, y: COURT.top + COURT.h * 0.5, z: 150 },
};

const TEAMS = [
  { id: 'neon', name: 'Neon City Ballers', primary: '#41e8ff', secondary: '#1f4d8a', mascot: 'Pulse Lynx' },
  { id: 'steel', name: 'Steel Court Titans', primary: '#b7bdc9', secondary: '#3f4552', mascot: 'Iron Rhino' },
  { id: 'sunset', name: 'Sunset Flyers', primary: '#ffa45e', secondary: '#7e2fff', mascot: 'Sky Hawk' },
];

const DIFF = {
  easy: { speed: 0.9, react: 0.65, contest: 0.45, passIQ: 0.55 },
  medium: { speed: 1.0, react: 0.83, contest: 0.68, passIQ: 0.75 },
  hard: { speed: 1.08, react: 1.0, contest: 0.9, passIQ: 0.9 },
};

const PLAYER_PROFILE = JSON.parse(localStorage.getItem('court-legends-profile') || 'null') || {
  xp: 0,
  level: 1,
  points: 0,
  attrs: { speed: 72, strength: 65, vertical: 68, accuracy: 70, handling: 66 },
  skills: { euroStep: false, posterizer: false, deepRange: false },
  cosmetics: ['street blackouts'],
};

const state = {
  running: false,
  mode: 'quick',
  format: 2,
  difficulty: 'medium',
  team: TEAMS[0],
  score: { home: 0, away: 0 },
  staminaDrain: 0,
  shotHoldStart: 0,
  shotMeterValue: 0,
  shotIntent: 'jumper',
  comboText: '',
  comboTimer: 0,
  shake: 0,
  zoom: 1,
  slowmo: 0,
  possession: 'home',
  replayBuffer: [],
  replaying: false,
  aiMemory: { driveBias: 0.5, pullupBias: 0.5, passBias: 0.5 },
  tournamentWins: 0,
};

const keys = new Set();
const rand = (a, b) => Math.random() * (b - a) + a;

function project(worldX, worldY, worldZ) {
  const scale = 0.62 + (worldY - COURT.top) / COURT.h * 0.48;
  return {
    x: worldX,
    y: COURT.floorY - worldZ - (worldY - COURT.top) * 0.31,
    scale,
  };
}

class Actor {
  constructor({ x, y, teamSide, ai = false, idx = 0 }) {
    this.x = x;
    this.y = y;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.ax = 0;
    this.ay = 0;
    this.teamSide = teamSide;
    this.ai = ai;
    this.idx = idx;
    this.radius = 22;
    this.hasBall = false;
    this.hand = 'right';
    this.dribbleMove = '';
    this.moveCooldown = 0;
    this.state = 'idle';
    this.lastShotType = 'jumper';
    this.contesting = 0;
    this.stamina = 1;
    this.target = null;
  }

  hoopTarget() {
    return this.teamSide === 'home' ? HOOPS.right : HOOPS.left;
  }

  oppHoop() {
    return this.teamSide === 'home' ? HOOPS.left : HOOPS.right;
  }

  move(ix, iy, sprint = false) {
    const prof = PLAYER_PROFILE.attrs;
    const speedBase = (this.ai ? 5.8 * DIFF[state.difficulty].speed : 6.0 + (prof.speed - 70) * 0.03) * (sprint ? 1.25 : 1);
    this.ax = ix * 0.95;
    this.ay = iy * 0.9;
    this.vx += this.ax;
    this.vy += this.ay;
    const mag = Math.hypot(this.vx, this.vy);
    if (mag > speedBase) {
      this.vx = (this.vx / mag) * speedBase;
      this.vy = (this.vy / mag) * speedBase;
    }
    if (sprint) this.stamina = Math.max(0, this.stamina - 0.005);
  }

  jump(power = 1) {
    if (this.z <= 0.1) {
      const vertical = this.ai ? 74 : PLAYER_PROFILE.attrs.vertical;
      this.vz = 11 + (vertical - 70) * 0.05 * power;
      this.state = 'jump';
    }
  }

  applyPhysics(dt) {
    this.vz -= 0.62;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    this.vx *= 0.87;
    this.vy *= 0.87;

    this.x = Math.max(COURT.left + 26, Math.min(COURT.left + COURT.w - 26, this.x));
    this.y = Math.max(COURT.top + 30, Math.min(COURT.top + COURT.h - 30, this.y));

    if (this.z <= 0) {
      this.z = 0;
      this.vz = 0;
      this.state = Math.hypot(this.vx, this.vy) > 0.9 ? 'run' : 'idle';
      this.stamina = Math.min(1, this.stamina + 0.0028);
    }

    if (this.moveCooldown > 0) this.moveCooldown -= dt;
    if (this.contesting > 0) this.contesting -= dt;
  }
}

class Ball {
  constructor() {
    this.x = COURT.left + COURT.w / 2;
    this.y = COURT.top + COURT.h / 2;
    this.z = 80;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.spin = 0;
    this.owner = null;
    this.r = 11;
    this.lastTouch = 'home';
  }

  release(velocity, spin, by) {
    this.owner = null;
    this.vx = velocity.x;
    this.vy = velocity.y;
    this.vz = velocity.z;
    this.spin = spin;
    this.lastTouch = by.teamSide;
  }

  tick(dt) {
    if (this.owner) {
      const sideOffset = this.owner.hand === 'right' ? 18 : -18;
      this.x = this.owner.x + sideOffset;
      this.y = this.owner.y + 8;
      this.z = this.owner.z + 36 + Math.abs(Math.sin(performance.now() * 0.015)) * 10;
      return;
    }

    this.vz -= 0.5;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    if (this.z <= 0) {
      this.z = 0;
      this.vz *= -(0.58 + Math.abs(this.spin) * 0.04);
      this.vx *= 0.93 + this.spin * 0.02;
      this.vy *= 0.93 - this.spin * 0.02;
      this.spin *= 0.82;
      if (Math.abs(this.vz) < 1) this.vz = 0;
    }

    if (this.x < COURT.left + 10 || this.x > COURT.left + COURT.w - 10) {
      this.vx *= -0.79;
      this.spin *= 0.7;
      this.x = Math.max(COURT.left + 10, Math.min(COURT.left + COURT.w - 10, this.x));
    }
    if (this.y < COURT.top + 10 || this.y > COURT.top + COURT.h - 10) {
      this.vy *= -0.79;
      this.spin *= 0.7;
      this.y = Math.max(COURT.top + 10, Math.min(COURT.top + COURT.h - 10, this.y));
    }

    collideRim(HOOPS.left, this);
    collideRim(HOOPS.right, this);
  }
}

const game = {
  home: [],
  away: [],
  ball: new Ball(),
};

function collideRim(hoop, ball) {
  const dx = ball.x - hoop.x;
  const dy = ball.y - hoop.y;
  const dz = ball.z - hoop.z;
  const dist = Math.hypot(dx, dy, dz * 1.2);
  if (dist < 22) {
    const nx = dx / (dist || 1);
    const ny = dy / (dist || 1);
    ball.vx += nx * 1.4;
    ball.vy += ny * 1.4;
    ball.vz *= -0.72;
    ball.spin += nx * 0.4;
    state.shake = 5;
  }
}

function populateTeams() {
  teamSelect.innerHTML = '';
  for (const t of TEAMS) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = `${t.name} • ${t.mascot}`;
    teamSelect.append(o);
  }
}

function persistProfile() {
  localStorage.setItem('court-legends-profile', JSON.stringify(PLAYER_PROFILE));
}

function awardXP(value) {
  PLAYER_PROFILE.xp += value;
  PLAYER_PROFILE.points += Math.floor(value / 3);
  const newLevel = 1 + Math.floor(PLAYER_PROFILE.xp / 180);
  if (newLevel > PLAYER_PROFILE.level) {
    PLAYER_PROFILE.level = newLevel;
    PLAYER_PROFILE.attrs.speed += 1;
    PLAYER_PROFILE.attrs.accuracy += 1;
  }
  if (PLAYER_PROFILE.xp > 350) PLAYER_PROFILE.skills.euroStep = true;
  if (PLAYER_PROFILE.xp > 700) PLAYER_PROFILE.skills.posterizer = true;
  if (PLAYER_PROFILE.xp > 1150) PLAYER_PROFILE.skills.deepRange = true;
  persistProfile();
  drawProfile();
}

function drawProfile() {
  profileText.textContent = `LV ${PLAYER_PROFILE.level} | XP ${PLAYER_PROFILE.xp} | Upgrade Pts ${PLAYER_PROFILE.points}`;
  skillText.textContent = `Attributes → SPD ${PLAYER_PROFILE.attrs.speed}, STR ${PLAYER_PROFILE.attrs.strength}, VRT ${PLAYER_PROFILE.attrs.vertical}, ACC ${PLAYER_PROFILE.attrs.accuracy}, HDL ${PLAYER_PROFILE.attrs.handling}`;
}

function startGame() {
  state.mode = modeSelect.value;
  state.format = Number(formatSelect.value);
  state.difficulty = difficultySelect.value;
  state.team = TEAMS.find((t) => t.id === teamSelect.value) || TEAMS[0];
  state.score = { home: 0, away: 0 };
  state.running = true;
  state.tournamentWins = 0;
  state.replayBuffer = [];

  game.home = [];
  game.away = [];
  const centerY = COURT.top + COURT.h / 2;

  for (let i = 0; i < state.format; i += 1) {
    game.home.push(new Actor({ x: COURT.left + 300 + i * 80, y: centerY + (i - 1) * 100, teamSide: 'home', ai: false, idx: i }));
    game.away.push(new Actor({ x: COURT.left + COURT.w - 300 - i * 80, y: centerY + (i - 1) * 100, teamSide: 'away', ai: true, idx: i }));
  }

  game.home[0].hasBall = true;
  game.ball.owner = game.home[0];
  state.possession = 'home';
}

function bestTeammate(passer) {
  const mates = passer.teamSide === 'home' ? game.home : game.away;
  let best = mates[0];
  let bestScore = -999;
  for (const m of mates) {
    if (m === passer) continue;
    const defenders = passer.teamSide === 'home' ? game.away : game.home;
    const nearestDef = Math.min(...defenders.map((d) => Math.hypot(m.x - d.x, m.y - d.y)));
    const hoop = m.hoopTarget();
    const shotDist = Math.hypot(m.x - hoop.x, m.y - hoop.y);
    const score = nearestDef * 0.8 - shotDist * 0.5 + rand(-20, 20);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

function passBall(from, type) {
  if (!from.hasBall) return;
  const target = bestTeammate(from);
  from.hasBall = false;
  game.ball.owner = null;

  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const flight = Math.max(12, Math.hypot(dx, dy) / 5);

  const zBoost = type === 'alley' ? 8 : type === 'bounce' ? 2 : 4;
  game.ball.release(
    { x: dx / flight, y: dy / flight, z: zBoost },
    type === 'bounce' ? 0.3 : 0.1,
    from
  );

  if (type === 'bounce') state.comboText = 'Bounce Pass';
  if (type === 'alley') state.comboText = 'Alley-oop setup';
  state.comboTimer = 46;
}

function shootBall(shooter, meterValue, shotType) {
  if (!shooter.hasBall) return;
  const hoop = shooter.hoopTarget();

  const dx = hoop.x - shooter.x;
  const dy = hoop.y - shooter.y;
  const dist = Math.hypot(dx, dy);
  const perfectCenter = 0.65;
  const timingError = Math.abs(meterValue - perfectCenter);

  let releaseQuality = Math.max(0, 1 - timingError * 2.4);
  releaseQuality += (PLAYER_PROFILE.attrs.accuracy - 70) * 0.003;
  if (shotType === 'three' && PLAYER_PROFILE.skills.deepRange) releaseQuality += 0.06;

  const contesters = (shooter.teamSide === 'home' ? game.away : game.home)
    .filter((d) => Math.hypot(d.x - shooter.x, d.y - shooter.y) < 90 && Math.abs(d.z - shooter.z) < 35);
  releaseQuality -= contesters.length * DIFF[state.difficulty].contest * 0.1;

  const arc = shotType === 'layup' ? 8.6 : shotType === 'dunk' ? 7.8 : 10.4;
  const strengthScale = 1 + (PLAYER_PROFILE.attrs.strength - 70) * 0.002;
  const vx = dx / (17 - releaseQuality * 3) * strengthScale;
  const vy = dy / (17 - releaseQuality * 3) * strengthScale;
  const vz = arc + dist / 180 + (1 - releaseQuality) * 2;

  shooter.hasBall = false;
  shooter.lastShotType = shotType;
  game.ball.release({ x: vx, y: vy, z: vz }, rand(-0.18, 0.18), shooter);

  if (timingError < 0.05) {
    state.comboText = 'GREEN RELEASE';
    state.comboTimer = 55;
    state.slowmo = 28;
  }
}

function stealAttempt(defender, attacker) {
  if (!attacker.hasBall) return false;
  const dist = Math.hypot(defender.x - attacker.x, defender.y - attacker.y);
  if (dist > 62) return false;
  const risk = defender.ai ? DIFF[state.difficulty].react * 0.36 : 0.31;
  if (Math.random() < risk) {
    attacker.hasBall = false;
    defender.hasBall = true;
    game.ball.owner = defender;
    state.possession = defender.teamSide;
    state.comboText = 'Pick Pocket';
    state.comboTimer = 42;
    state.shake = 5;
    return true;
  }
  return false;
}

function detectPickup() {
  if (game.ball.owner) return;
  const everyone = [...game.home, ...game.away];
  for (const p of everyone) {
    const d = Math.hypot(p.x - game.ball.x, p.y - game.ball.y);
    if (d < p.radius + game.ball.r + 5 && Math.abs(p.z - game.ball.z) < 30) {
      everyone.forEach((e) => (e.hasBall = false));
      p.hasBall = true;
      game.ball.owner = p;
      state.possession = p.teamSide;
      return;
    }
  }
}

function checkScore() {
  const b = game.ball;
  const zones = [
    { hoop: HOOPS.left, side: 'home' },
    { hoop: HOOPS.right, side: 'away' },
  ];

  for (const z of zones) {
    const inCylinder = Math.hypot(b.x - z.hoop.x, b.y - z.hoop.y) < 18;
    if (inCylinder && b.z < z.hoop.z + 8 && b.z > z.hoop.z - 24 && b.vz < -0.4) {
      const scoredBy = b.lastTouch;
      const shotDist = Math.hypot(b.x - (scoredBy === 'home' ? HOOPS.left.x : HOOPS.right.x), b.y - z.hoop.y);
      const points = shotDist > 240 ? 3 : 2;
      state.score[scoredBy] += points;
      awardXP(scoredBy === 'home' ? 18 + points * 4 : 4);
      state.comboText = `${scoredBy === 'home' ? 'HOME' : 'AWAY'} +${points}`;
      state.comboTimer = 60;
      state.shake = points === 3 ? 8 : 5;
      if (points >= 3) state.slowmo = 34;
      resetPossession(scoredBy === 'home' ? 'away' : 'home');
      updateLeaderboard();
      return;
    }
  }
}

function resetPossession(side) {
  game.ball = new Ball();
  const spawnY = COURT.top + COURT.h / 2;
  game.home.forEach((p, i) => {
    p.z = 0;
    p.vz = 0;
    p.hasBall = false;
    p.x = COURT.left + 300 + i * 80;
    p.y = spawnY + (i - 1) * 90;
  });
  game.away.forEach((p, i) => {
    p.z = 0;
    p.vz = 0;
    p.hasBall = false;
    p.x = COURT.left + COURT.w - 300 - i * 80;
    p.y = spawnY + (i - 1) * 90;
  });

  const handler = side === 'home' ? game.home[0] : game.away[0];
  handler.hasBall = true;
  game.ball.owner = handler;
  state.possession = side;
}

function updateAIMemory(homeShooterDist) {
  const m = state.aiMemory;
  m.pullupBias = m.pullupBias * 0.95 + (homeShooterDist > 220 ? 0.1 : 0.02);
  m.driveBias = m.driveBias * 0.95 + (homeShooterDist < 120 ? 0.12 : 0.04);
  m.passBias = m.passBias * 0.97 + (Math.random() < 0.2 ? 0.03 : 0.01);
}

function aiStep(ai, dt) {
  const settings = DIFF[state.difficulty];
  const opponents = ai.teamSide === 'home' ? game.away : game.home;
  const mates = ai.teamSide === 'home' ? game.home : game.away;
  const ballHandler = [...game.home, ...game.away].find((p) => p.hasBall);
  const targetHoop = ai.hoopTarget();

  if (ai.hasBall) {
    const distToHoop = Math.hypot(ai.x - targetHoop.x, ai.y - targetHoop.y);

    if (Math.random() < 0.007 * settings.passIQ && distToHoop > 200 && state.aiMemory.passBias > 0.45) {
      passBall(ai, Math.random() < 0.4 ? 'bounce' : 'chest');
      return;
    }

    const driveIntent = state.aiMemory.driveBias + rand(-0.15, 0.15);
    if (distToHoop > 95 && driveIntent > 0.52) {
      ai.move((targetHoop.x - ai.x) * 0.03, (targetHoop.y - ai.y) * 0.03, true);
      if (distToHoop < 130 && Math.random() < 0.03) shootBall(ai, 0.62 + rand(-0.1, 0.1), 'layup');
    } else if (Math.random() < 0.02 * settings.react) {
      const takeThree = distToHoop > 220;
      shootBall(ai, 0.58 + rand(-0.13, 0.13), takeThree ? 'three' : 'mid');
      updateAIMemory(distToHoop);
    }
  } else {
    const defendTarget = ballHandler && ballHandler.teamSide !== ai.teamSide ? ballHandler : opponents[0];
    ai.move((defendTarget.x - ai.x) * 0.03, (defendTarget.y - ai.y) * 0.03, true);
    if (Math.hypot(ai.x - defendTarget.x, ai.y - defendTarget.y) < 64) {
      if (!stealAttempt(ai, defendTarget) && Math.random() < 0.02 * settings.contest) {
        ai.jump(0.95);
        ai.contesting = 16;
      }
    }

    if (!ballHandler && Math.random() < 0.08) {
      ai.move((game.ball.x - ai.x) * 0.06, (game.ball.y - ai.y) * 0.06, true);
    }

    if (mates.length > 1 && Math.random() < 0.006) {
      const screenMate = mates[(ai.idx + 1) % mates.length];
      ai.move((screenMate.x - ai.x) * 0.02, (screenMate.y - ai.y) * 0.02);
    }
  }

  ai.applyPhysics(dt);
}

function handlePlayerInput(dt) {
  const p = game.home[0];
  if (!p) return;

  let ix = 0;
  let iy = 0;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  if (keys.has('w') || keys.has('arrowup')) iy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) iy += 1;

  const sprint = keys.has('shift');
  if (ix || iy) p.move(ix, iy, sprint);
  p.applyPhysics(dt);
}

function applyCollisions() {
  const everyone = [...game.home, ...game.away];
  for (let i = 0; i < everyone.length; i += 1) {
    for (let j = i + 1; j < everyone.length; j += 1) {
      const a = everyone[i];
      const b = everyone[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;
      if (d < minDist) {
        const nx = dx / (d || 1);
        const ny = dy / (d || 1);
        const push = (minDist - d) * 0.5;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        a.vx *= 0.93;
        b.vx *= 0.93;
      }
    }
  }
}

function update(dt) {
  if (!state.running || state.replaying) return;

  const scaledDt = state.slowmo > 0 ? dt * 0.55 : dt;
  handlePlayerInput(scaledDt);
  for (const ai of game.away) aiStep(ai, scaledDt);
  for (let i = 1; i < game.home.length; i += 1) {
    const mate = game.home[i];
    const anchor = game.home[0];
    mate.move((anchor.x - mate.x) * 0.02, (anchor.y - mate.y) * 0.02);
    mate.applyPhysics(scaledDt);
  }

  applyCollisions();
  game.ball.tick(scaledDt);
  detectPickup();
  checkScore();

  if (state.comboTimer > 0) state.comboTimer -= 1;
  if (state.shake > 0) state.shake -= 1;
  if (state.slowmo > 0) state.slowmo -= 1;

  const maxPoints = state.mode === 'practice' ? 21 : 15;
  if (state.score.home >= maxPoints || state.score.away >= maxPoints) {
    finishMatch();
  }

  captureReplay();
}

function finishMatch() {
  state.running = false;
  if (state.mode === 'tournament' && state.score.home > state.score.away) {
    state.tournamentWins += 1;
    awardXP(30);
  }
  if (state.mode === 'career' && state.score.home > state.score.away) {
    awardXP(40);
    PLAYER_PROFILE.cosmetics.push(`court-finish-${new Date().getTime().toString().slice(-4)}`);
  }
  persistProfile();
  saveLeaderboard();
}

function captureReplay() {
  state.replayBuffer.push({
    score: { ...state.score },
    ball: { ...game.ball },
    home: game.home.map((p) => ({ ...p })),
    away: game.away.map((p) => ({ ...p })),
  });
  if (state.replayBuffer.length > 260) state.replayBuffer.shift();
}

function renderReplay() {
  if (!state.replayBuffer.length) return;
  state.replaying = true;
  let i = 0;
  function frame() {
    const snap = state.replayBuffer[i];
    if (!snap) {
      state.replaying = false;
      return;
    }
    renderScene(snap.home, snap.away, snap.ball, snap.score, true);
    i += 2;
    requestAnimationFrame(frame);
  }
  frame();
}

function drawCourt() {
  ctx.save();
  if (state.shake > 0) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));

  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#244f7f');
  g.addColorStop(1, '#0c243c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 220; i += 1) {
    ctx.fillRect(i * 8, 40 + Math.sin(i * 0.5) * 8, 2, 14);
  }

  ctx.strokeStyle = '#d9e7ff';
  ctx.lineWidth = 3;
  ctx.strokeRect(COURT.left, COURT.top, COURT.w, COURT.h);
  ctx.beginPath();
  ctx.moveTo(COURT.left + COURT.w / 2, COURT.top);
  ctx.lineTo(COURT.left + COURT.w / 2, COURT.top + COURT.h);
  ctx.stroke();

  drawHoop(HOOPS.left);
  drawHoop(HOOPS.right);

  ctx.restore();
}

function drawHoop(h) {
  const p = project(h.x, h.y, h.z);
  ctx.fillStyle = '#ff5f52';
  ctx.fillRect(p.x - 28, p.y, 56, 4);
  ctx.strokeStyle = '#eff5ff';
  ctx.strokeRect(p.x - 40, p.y - 36, 8, 40);
}

function drawActor(a, colorMain, colorTrim) {
  const p = project(a.x, a.y, a.z);
  const s = p.scale;
  ctx.fillStyle = colorMain;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 30 * s, 12 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(p.x - 10 * s, p.y - 16 * s, 20 * s, 28 * s);
  ctx.fillStyle = colorTrim;
  ctx.fillRect(p.x - 10 * s, p.y - 16 * s, 20 * s, 4 * s);

  if (a.contesting > 0) {
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(p.x - 15 * s, p.y - 44 * s, 30 * s, 42 * s);
  }
}

function drawBall(b) {
  const p = project(b.x, b.y, b.z);
  ctx.fillStyle = '#d58d38';
  ctx.beginPath();
  ctx.arc(p.x, p.y, b.r * p.scale * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a2d10';
  ctx.stroke();
}

function drawHUD(score = state.score, replay = false) {
  ctx.fillStyle = '#f7fbff';
  ctx.font = '700 28px Inter';
  ctx.fillText(`${state.team.name} ${score.home} : ${score.away} CPU`, 430, 46);
  ctx.font = '600 16px Inter';
  ctx.fillStyle = '#9cc2f3';
  ctx.fillText(`Mode ${state.mode.toUpperCase()} | Diff ${state.difficulty.toUpperCase()} | Format ${state.format}v${state.format}`, 425, 70);

  if (state.comboTimer > 0) {
    ctx.fillStyle = '#42f5ff';
    ctx.font = '700 30px Inter';
    ctx.fillText(state.comboText, 540, 120);
  }

  if (replay) {
    ctx.fillStyle = '#fff';
    ctx.font = '700 34px Inter';
    ctx.fillText('REPLAY', 620, 120);
  }

  if (!state.running) {
    ctx.fillStyle = '#fff';
    ctx.font = '700 42px Inter';
    ctx.fillText('Press Start Game', 530, 380);
  }
}

function renderScene(home = game.home, away = game.away, ball = game.ball, score = state.score, replay = false) {
  drawCourt();
  const teamColor = state.team.primary;
  const trimColor = state.team.secondary;
  home.forEach((p) => drawActor(p, teamColor, trimColor));
  away.forEach((p) => drawActor(p, '#ff6d98', '#6e2446'));
  drawBall(ball);
  drawHUD(score, replay);
}

function draw() {
  renderScene();
}

function saveLeaderboard() {
  const board = JSON.parse(localStorage.getItem('court-legends-board') || '[]');
  board.push({
    team: state.team.name,
    score: `${state.score.home}:${state.score.away}`,
    mode: state.mode,
    date: new Date().toLocaleDateString(),
  });
  board.sort((a, b) => Number(b.score.split(':')[0]) - Number(a.score.split(':')[0]));
  localStorage.setItem('court-legends-board', JSON.stringify(board.slice(0, 10)));
  updateLeaderboard();
}

function updateLeaderboard() {
  const board = JSON.parse(localStorage.getItem('court-legends-board') || '[]');
  leaderboardEl.innerHTML = '';
  board.slice(0, 5).forEach((r) => {
    const li = document.createElement('li');
    li.textContent = `${r.team} ${r.score} (${r.mode})`;
    leaderboardEl.append(li);
  });
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
  const k = e.key.toLowerCase();
  keys.add(k);
  const p = game.home[0];
  if (!p) return;

  if (k === ' ') {
    if (p.hasBall) {
      p.jump(1.08);
      shootBall(p, 0.64, 'dunk');
      state.shake = 10;
      state.comboText = 'Poster Dunk';
      state.comboTimer = 55;
    } else {
      p.jump(1.04);
      p.contesting = 18;
    }
  }

  if (k === 'j' && p.moveCooldown <= 0) {
    const moves = ['crossover', 'spin', 'behind-the-back'];
    p.dribbleMove = moves[Math.floor(Math.random() * moves.length)];
    p.hand = p.hand === 'right' ? 'left' : 'right';
    p.moveCooldown = 24;
    p.vx += rand(-2.6, 2.6);
    p.vy += rand(-2.2, 2.2);
    state.comboText = p.dribbleMove;
    state.comboTimer = 32;
  }

  if (k === 'l') {
    const nearest = game.away.reduce((best, d) =>
      Math.hypot(d.x - p.x, d.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? d : best,
    game.away[0]);
    stealAttempt(p, nearest);
  }

  if (k === 'u') passBall(p, 'chest');
  if (k === 'i') passBall(p, 'bounce');
  if (k === 'o') passBall(p, 'alley');

  if (k === 'k') {
    state.shotHoldStart = performance.now();
    state.shotIntent = 'jumper';
    const hoop = p.hoopTarget();
    const dist = Math.hypot(hoop.x - p.x, hoop.y - p.y);
    if (dist < 90) state.shotIntent = 'layup';
    if (dist > 250) state.shotIntent = 'three';
  }

  if (k === 'r') renderReplay();
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  const p = game.home[0];
  if (!p) return;

  if (k === 'k' && state.shotHoldStart > 0) {
    const hold = performance.now() - state.shotHoldStart;
    const meter = Math.min(1, hold / 700);
    shootBall(p, meter, state.shotIntent);
    state.shotHoldStart = 0;
    state.shotMeterValue = 0;
    meterFill.style.width = '0%';
  }
});

function meterTick() {
  if (state.shotHoldStart > 0) {
    const hold = performance.now() - state.shotHoldStart;
    state.shotMeterValue = Math.min(1, hold / 700);
    meterFill.style.width = `${state.shotMeterValue * 100}%`;
  }
  requestAnimationFrame(meterTick);
}

startBtn.addEventListener('click', startGame);
populateTeams();
drawProfile();
updateLeaderboard();
requestAnimationFrame(loop);
requestAnimationFrame(meterTick);
