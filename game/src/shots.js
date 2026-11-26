// Alpine Courier — the deterministic scenes behind ?shot=cover|ring|landing|
// storm, the autopilot that flies them (and the title screen's attract mode),
// and a scripted self-test that flies a whole sortie through the real
// rules and reports PASS or FAIL.
import { MISSIONS, STEP } from './config.js';
import { EVENT_CRASH, EVENT_LAND, EVENT_MISSION, EVENT_RING } from './world.js';
import { SCREEN_PLAY } from './render.js';
import { clamp } from './random.js';

const DEG = Math.PI / 180;

/**
 * Steer the plane toward its next objective. Returns one step's input plus
 * whether the gear should be down. After the last ring it flies a straight-in
 * 3-degree glidepath to Runway 27 — the same pattern a player flies.
 */
export function autopilotInput(world) {
  const s = world.state;
  const p = world.plane;
  const input = { roll: 0, pitch: 0, throttleDelta: 0, brake: false, gearDown: p.gearDown };
  const groundAhead = world.heightAt(
    p.x + Math.sin(p.heading) * 200,
    p.z + Math.cos(p.heading) * 200,
  );

  // The approach is a state machine, not a position test: once the plane is
  // on final it stays on final.
  if (s.ringIndex >= s.rings.length && s.approach === 'rings') s.approach = 'landing';

  let target;
  let wantSpeed = 60;
  let minAlt = groundAhead + 45;
  let maxDive = 1;
  if (s.approach === 'rings') {
    target = s.rings[s.ringIndex];
    input.gearDown = true;
  } else {
    // Straight-in final: the last ring is far enough south of Runway 27
    // that a 3-degree glidepath reaches the strip. The plane chases the
    // glidepath, never the ground itself, and the dive is capped so it
    // cannot porpoise over the valley's bumps. The floor counts the ground
    // below the plane as well as ahead, so it cannot descend into a rise.
    target = { x: 0, y: world.heightAt(0, 5800) - 10, z: 5800 };
    wantSpeed = 50;
    const below = world.heightAt(p.x, p.z);
    minAlt =
      world.onRunway(p.x, p.z) === 2
        ? Math.max(groundAhead, below) + 0
        : Math.max(below + 15, groundAhead + 12);
    maxDive = 0.35;
    input.gearDown = true;
  }

  const dx = target.x - p.x;
  const dz = target.z - p.z;
  // On final the plane steers to the runway's heading, not to a point:
  // chasing a point makes it circle the threshold instead of flying down
  // the strip. The heading leans toward the centreline in proportion to
  // the cross-track error.
  const desired =
    s.approach === 'landing'
      ? clamp(-p.x * 0.006, -0.4, 0.4)
      : Math.atan2(dx, dz);
  let err = desired - p.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  input.roll = clamp(err * 1.8, -1, 1);

  // Stay above the terrain ahead, then chase the target's altitude. On
  // final the target is the 3-degree glidepath to the runway threshold.
  let wantAlt;
  if (s.approach === 'landing') {
    const glide = 20 + Math.max(0, 5400 - p.z) * 0.0524;
    wantAlt = Math.max(glide, minAlt);
  } else {
    wantAlt = Math.max(target.y, minAlt);
  }
  input.pitch = clamp((wantAlt - p.y) / 45, -maxDive, 1);

  // Flare over the runway: only when actually sinking fast and close to the
  // ground, so the plane does not float past the strip.
  const rw = world.onRunway(p.x, p.z);
  if (s.ringIndex >= s.rings.length && rw === 2 && p.z > 5400) {
    const gh = world.heightAt(p.x, p.z);
    if (p.y - gh < 12 && p.vy < -3) {
      input.pitch = 0.7;
      wantSpeed = 45;
    }
    if (p.onGround) input.brake = true;
  }
  input.throttleDelta = clamp((wantSpeed - p.speed) * 0.06, -1, 1);
  return input;
}

function setPlane(world, x, y, z, heading, speed, throttle, extra) {
  const p = world.plane;
  p.x = x;
  p.y = y;
  p.z = z;
  p.heading = heading;
  p.pitch = extra?.pitch ?? 0;
  p.roll = extra?.roll ?? 0;
  p.speed = speed;
  p.vy = 0;
  p.throttle = throttle;
  p.gearDown = extra?.gearDown ?? true;
  p.onGround = extra?.onGround ?? false;
}

function stepFor(world, seconds, input) {
  let events = 0;
  for (let i = 0; i < seconds / STEP; i += 1) {
    events |= world.step(STEP, input);
  }
  return events;
}

/** Set `world` to the named scene and return the screen to draw over it. */
export function stageShot(name, world) {
  const s = world.state;
  if (name === 'ring') {
    const ring = s.rings[2];
    s.ringIndex = 2;
    s.score = 200;
    s.time = 75;
    s.fuel = 78;
    s.message = '';
    s.messageT = 0;
    setPlane(world, ring.x - 260, ring.y + 6, ring.z - 320, 0.06, 64, 0.75);
    stepFor(world, 0.5, { roll: 0, pitch: 0, throttleDelta: 0, brake: false });
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'landing') {
    s.ringIndex = s.rings.length;
    for (const ring of s.rings) ring.passed = true;
    s.score = 700;
    s.time = 152;
    s.fuel = 45;
    s.message = 'Final — gear down, Runway 27 ahead';
    s.messageT = 5;
    // Just over the threshold, the strip filling the view ahead.
    const gh = world.heightAt(0, 5480);
    setPlane(world, 0, gh + 34, 5480, 0.01, 54, 0.35, { pitch: -3 * DEG });
    stepFor(world, 0.4, { roll: 0, pitch: 0, throttleDelta: 0, brake: false });
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'storm') {
    world.reset();
    // Mission 3 is built by the caller (main.js swaps the world first).
    const ring = s.rings[3];
    s.ringIndex = 3;
    s.score = 320;
    s.time = 118;
    s.fuel = 52;
    s.message = '';
    s.messageT = 0;
    setPlane(world, ring.x - 300, ring.y + 10, ring.z - 380, -0.05, 70, 0.8, { roll: 8 * DEG });
    stepFor(world, 0.5, { roll: 0, pitch: 0, throttleDelta: 0, brake: false });
    return { screen: SCREEN_PLAY, best: 0 };
  }
  // cover: rolling down Runway 09 from its left edge, so the strip shows
  // ahead to the right of the plane and the first ring beyond it.
  const gh = world.heightAt(0, 150);
  s.time = 8;
  s.fuel = 96;
  setPlane(world, -18, gh + 1.5, 150, 0.08, 32, 0.8, { pitch: 0, onGround: true });
  stepFor(world, 0.3, { roll: 0, pitch: 0.4, throttleDelta: 0, brake: false });
  return { screen: SCREEN_PLAY, best: 0 };
}

// Play one whole sortie through the real rules and check the result.
// Returns 'PASS' or 'FAIL: <reason>' and writes it into document.title.
export function runSelfTest(world) {
  const fail = (why) => {
    document.title = `SELFTEST FAIL: ${why}`;
    return `FAIL: ${why}`;
  };
  try {
    world.reset();
    let landed = false;
    let rings = 0;
    for (let i = 0; i < 600 / STEP; i += 1) {
      const input = autopilotInput(world);
      world.plane.gearDown = input.gearDown;
      const events = world.step(STEP, input);
      if (events & EVENT_RING) rings += 1;
      if (events & EVENT_CRASH) return fail(`crashed: ${world.state.crashReason} (rings ${rings})`);
      if (events & EVENT_LAND) landed = true;
      if (events & EVENT_MISSION) {
        if (world.state.status !== 'landed') return fail('mission event without landing');
        if (rings !== world.state.rings.length) return fail(`only ${rings} rings`);
        if (world.state.score <= 0) return fail('no score');
        document.title = 'SELFTEST PASS';
        return 'PASS';
      }
      if (world.state.status === 'over') return fail('out of lives');
    }
    return fail(`timed out: rings ${rings}, landed ${landed}, z ${Math.round(world.plane.z)}`);
  } catch (err) {
    return fail(String(err && err.message ? err.message : err));
  }
}

export { MISSIONS };
