# Neon Street Hoops (Modern 2D Basketball)

A browser-playable 2D basketball game designed to feel faster and deeper than retro basketball physics games.

## Why this engine choice?

For this prototype, I used **HTML5 Canvas + vanilla JavaScript** because:

- immediate play in browser (no install)
- very fast iteration for physics/game-feel tuning
- easy migration path to Godot or Unity once mechanics are proven

For production:
- **Best overall recommendation: Godot 4** for this design scope (strong 2D tools, easy networking, free/open source).
- **Unity** is also a great option if your team already uses C# and needs larger plugin ecosystems.

## Features implemented

- 1v1 and 2v2 team size toggle
- Physics movement with gravity, momentum, bounce, collisions
- Timing + power shooting with arc trajectories
- Dribble burst, steal attempts, jump/block contest behavior
- Adaptive AI by difficulty (easy/medium/hard), fake shots, defensive repositioning
- Quick Match + Tournament mode
- Character unlock progression with stat differences
- Perk unlocks and leaderboard (saved in localStorage)
- Replay highlights + slow-motion scoring moments
- Dynamic court lighting feel, crowd stripe animation, screen shake juice

## Basic architecture / pseudocode

```text
GameLoop:
  dt = frame delta
  readInput()
  updatePlayers(dt)
  updateAI(dt)
  updateBallPhysics(dt)
  resolvePossession()
  detectScore()
  triggerFX(screenShake, slowMo, replay)
  renderCourtAndEntities()

Shoot(player, holdDuration):
  targetHoop = enemy hoop
  angle = atan2(playerToHoop)
  timingScore = f(holdDuration vs perfectWindow)
  power = base + hold + distanceFactor
  ball.velocity = polar(angle, power)
  shotQuality = timingScore + perks - defensivePressure

AI(playerAI):
  if hasBall:
    maybeFakeShot()
    repositionTowardBestShotRange()
    shootByDifficultyReaction()
  else:
    trackBallOrBallHandler()
    attemptStealWhenInRange()
    jumpContestByDifficulty()
```

## Run locally

Open `index.html` in a browser.
