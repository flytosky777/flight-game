// Alpine Courier — boot and the one loop: input is read every frame, the
// world advances in fixed 1/60 s steps, and the renderer paints what is
// there. The game moves between five screens: title, play, paused, mission
// complete and game over. On the title screen an autopilot flies the valley
// behind the menu, so the title is a live flight, not a still.
//
// ?shot=cover|ring|landing|storm stages that scene instead of running the
// loop, paints it twice and sets window.__shotReady for a screenshot.
// ?test=1 plays a whole sortie through the real rules and reports PASS/FAIL.
import { BEST_KEY, MISSIONS, STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_FUEL, EVENT_LAND, EVENT_MISSION, EVENT_RING } from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_GEAR,
  ACTION_MISSION_1,
  ACTION_MISSION_2,
  ACTION_MISSION_3,
  ACTION_MUTE,
  ACTION_PAUSE,
  createInput,
} from './input.js';
import { makeSounds } from './audio.js';
import {
  SCREEN_LANDED,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  createRenderer,
} from './render.js';
import { autopilotInput, runSelfTest, stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const RESPAWN_DELAY = 1.4;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

/** Size the canvas to the fixed logical playfield, scaled to the window. */
function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW.w, window.innerHeight / VIEW.h);
  canvas.width = VIEW.w;
  canvas.height = VIEW.h;
  canvas.style.width = Math.floor(VIEW.w * scale) + 'px';
  canvas.style.height = Math.floor(VIEW.h * scale) + 'px';
}

window.addEventListener('resize', fitCanvas);
fitCanvas();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

let missionIndex = 0;
if (shot === 'storm') missionIndex = 2;
let world = createWorld(createRandom(MISSIONS[missionIndex].seed), missionIndex);
const renderer = createRenderer(canvas);
const sounds = makeSounds();
let best = readBest();

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw({ world }, scene.screen, { t: 12.4, best: scene.best, selectedMission: missionIndex });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runTest() {
  const result = runSelfTest(world);
  renderer.draw({ world }, SCREEN_PLAY, { t: 12.4, best: 0, selectedMission: missionIndex });
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = result;
}

if (shot) {
  runShot(shot);
} else if (params.get('test') === '1') {
  runTest();
} else {
  runGame();
}

function runGame() {
  let screen = SCREEN_TITLE;
  let selectedMission = 0;
  let accumulator = 0;
  let last = performance.now();
  let respawnIn = 0;
  let crashedAt = 0;

  const input = createInput(canvas, (action) => {
    sounds.ensure();
    if (action === ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) startMission(selectedMission);
      else if (screen === SCREEN_LANDED) nextMission();
      else if (screen === SCREEN_OVER) startMission(selectedMission);
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
      sounds.click();
    } else if (action === ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    } else if (action === ACTION_GEAR) {
      if (screen === SCREEN_PLAY) {
        world.plane.gearDown = !world.plane.gearDown;
        announce(world.plane.gearDown ? 'Gear down' : 'Gear up');
      }
    } else if (action === ACTION_MUTE) {
      const muted = sounds.toggleMute();
      announce(muted ? 'Sound off' : 'Sound on');
    } else if (action === ACTION_MISSION_1 || action === ACTION_MISSION_2 || action === ACTION_MISSION_3) {
      if (screen === SCREEN_TITLE) {
        selectedMission = action === ACTION_MISSION_1 ? 0 : action === ACTION_MISSION_2 ? 1 : 2;
        startMission(selectedMission);
      }
    }
  });

  function announce(message) {
    status.textContent = message;
  }

  function startMission(index) {
    missionIndex = index;
    selectedMission = index;
    world = createWorld(createRandom(MISSIONS[index].seed), index);
    accumulator = 0;
    respawnIn = 0;
    screen = SCREEN_PLAY;
    announce(`Flying ${MISSIONS[index].name}. Good luck.`);
  }

  function nextMission() {
    if (world.state.missionIndex >= MISSIONS.length - 1) {
      screen = SCREEN_TITLE;
      selectedMission = 0;
      world = createWorld(createRandom(MISSIONS[0].seed), 0);
    } else {
      startMission(world.state.missionIndex + 1);
    }
  }

  function endMission() {
    screen = SCREEN_LANDED;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Mission complete. Score ${world.state.score}.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Out of lives. Score ${world.state.score}. Best ${best}.`);
  }

  function frame(now) {
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    if (screen === SCREEN_TITLE) {
      // Attract mode: the autopilot flies the valley behind the menu.
      const pilot = autopilotInput(world);
      world.plane.gearDown = pilot.gearDown;
      const events = world.step(STEP, pilot);
      if (events & (EVENT_MISSION | EVENT_CRASH) || world.state.status === 'over') {
        world = createWorld(createRandom(MISSIONS[selectedMission].seed), selectedMission);
      }
    } else if (screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        if (respawnIn > 0) {
          respawnIn -= STEP;
          if (respawnIn <= 0) world.respawn();
          continue;
        }
        const events = world.step(STEP, input.poll());
        sounds.update(world.plane, world.plane.onGround);
        if (events & EVENT_RING) sounds.ring();
        if (events & EVENT_LAND) sounds.land();
        if (events & EVENT_CRASH) {
          sounds.crash();
          crashedAt = t;
          if (world.state.status === 'over') endGame();
          else respawnIn = RESPAWN_DELAY;
        }
        if (events & EVENT_MISSION) endMission();
        if (events & EVENT_FUEL) announce('Out of fuel — glide to a runway');
      }
    }

    renderer.draw({ world }, screen, { t, best, selectedMission });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
