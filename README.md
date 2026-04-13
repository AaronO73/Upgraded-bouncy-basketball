# Court Legends 2.5D

A modern basketball game prototype focused on realistic-feeling physics, snappy arcade controls, and progression depth.

## Engine recommendation (production)

For the full vision (premium animations, mocap pipelines, ragdolls, advanced camera system, online multiplayer), use:

- **Unreal Engine 5** (best for high-end 3D realism + animation tools + cinematic pipelines), or
- **Unity URP/HDRP** (strong tooling and faster iteration for indie/AA teams).

This repository ships a **2.5D Canvas prototype** to validate gameplay loops and systems quickly before migrating to a full 3D engine.

## Implemented systems

- Quick Match, Tournament, Practice, Dunk Contest, Career Run mode flow
- 1v1 / 2v2 / 3v3 format selector
- 2.5D movement and momentum (x/y court plane + z jump axis)
- Ball physics with arc, spin, bounce, rim collisions, and possession
- Shot meter with green-release timing window
- Shot types: layup, dunk, mid-range jumper, three-point
- Dribble move triggers: crossover, spin, behind-the-back
- Passing types: chest pass, bounce pass, alley-oop setup
- Defense actions: steal attempt, jump contest / blocking windows
- Adaptive AI memory (drive/pull-up/pass behavior shifts)
- Team identity layer with fictional brands:
  - Neon City Ballers
  - Steel Court Titans
  - Sunset Flyers
- Progression:
  - persistent XP/level
  - attributes (speed, strength, vertical, accuracy, handling)
  - unlockable skills (euro step, posterizer, deep range)
  - cosmetic unlock entries in career
- Replay system, screen shake, slow-motion highlights, modern HUD

## Modular architecture (target migration structure)

```text
/Systems
  PlayerController
    - input mapping, acceleration/deceleration, dribble state machine
  BallPhysicsSystem
    - force + angle shooting, spin, rim/backboard collisions
  AnimationGraph
    - locomotion blend, procedural foot IK, shot/land transitions
  AISystem
    - offense/defense state machine, habit-adaptive difficulty, teammate logic
  ProgressionSystem
    - XP, attributes, skill tree, cosmetics, persistence
  PresentationSystem
    - camera, shot meter UI, replay timeline, VFX/audio triggers
```

## How to run

Open `index.html` in a browser.
