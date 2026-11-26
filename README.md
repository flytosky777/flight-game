[![best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/flytosky777/flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/flytosky777/flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Alpine Courier — a bush-plane valley run

A make.fun entry for
[best-flight-game-20261126-0057](https://make.fun/bounty/best-flight-game-20261126-0057):
fly a bush plane through glowing rings over a mountain valley, mind your
fuel, and land on Runway 27. Three sorties: a calm first flight, a gusty
mountain pass, and a storm run at dusk.

## The game

- **Chase view** over recognisable terrain: a river valley with meadows,
  rock and snow-capped walls, two runways, and rings strung along the
  valley.
- **Flight model**: throttle, bank and pitch, coordinated turns, stalls,
  wind and turbulence, fuel burn, and landings that read as landings —
  flare too late and it is a hard one.
- **Missions**: fly every ring, then a straight-in 3° glidepath to
  Runway 27. Land early on a runway to refuel and take off again.
- **Instruments, lit**: attitude indicator, compass strip, altitude,
  speed and heading on the HUD, fuel and gear, ring count, timer, score.
- **Controls**: ← → bank, ↑ ↓ pitch, W/S or Shift/Ctrl throttle, G gear,
  Space brake, P pause, M mute. The mouse steers too.
- **Sound**: synthesised engine, wind, ring chimes and landing tones —
  no audio files.

## Play it

```sh
node serve.ts   # then open http://localhost:8080
```

## Self-test

`?test=1` flies a whole sortie through the real rules with an autopilot
and reports PASS or FAIL in the page title.

## Layout

- `game/src/config.js` — tuning, palette, missions
- `game/src/random.js` — seeded random, terrain helpers
- `game/src/world.js` — the valley, the rings, the flight rules
- `game/src/render.js` — sky, projected terrain, plane, HUD, screens
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised sound
- `game/src/shots.js` — screenshot scenes, autopilot, self-test
- `game/src/main.js` — boot and the game loop

Built with plain 2D canvas and no libraries, so the game runs offline
from its own files.
