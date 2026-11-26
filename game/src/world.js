// Alpine Courier — the rules and the state, with no drawing and no browser
// in it: the plane, the valley, the rings, fuel, lives and score. step()
// advances one fixed step and returns what happened as bit flags, so the
// caller can react without the world knowing about screens or sound.
import { LIVES, MISSIONS, PLANE, RING, SCORE, STEP, WORLD } from './config.js';
import { clamp, lerp, smooth } from './random.js';

export const EVENT_RING = 1;
export const EVENT_LAND = 2;
export const EVENT_CRASH = 4;
export const EVENT_FUEL = 8;
export const EVENT_MISSION = 16;
export const EVENT_WIN = 32;

const DEG = Math.PI / 180;
const G = 9.81;

/** Terrain noise grid: 33 columns across x, 65 rows along z. The spacing is
 * wide on purpose: the valley floor stays gentle enough to land on. */
const GX0 = -1600;
const GX1 = 1600;
const GZ0 = -400;
const GZ1 = 6600;
const GNX = 33;
const GNZ = 65;

export function createWorld(random, missionIndex) {
  const mission = MISSIONS[missionIndex];

  // Two layers of value noise over the valley, fixed for this mission.
  const broad = new Float32Array(GNX * GNZ);
  const detail = new Float32Array(GNX * GNZ);
  for (let i = 0; i < broad.length; i += 1) {
    broad[i] = random();
    detail[i] = random();
  }

  function noiseAt(grid, x, z) {
    const fx = clamp((x - GX0) / (GX1 - GX0), 0, 1) * (GNX - 1);
    const fz = clamp((z - GZ0) / (GZ1 - GZ0), 0, 1) * (GNZ - 1);
    const x0 = Math.min(GNX - 2, Math.floor(fx));
    const z0 = Math.min(GNZ - 2, Math.floor(fz));
    const tx = smooth(0, 1, fx - x0);
    const tz = smooth(0, 1, fz - z0);
    const a = grid[z0 * GNX + x0];
    const b = grid[z0 * GNX + x0 + 1];
    const c = grid[(z0 + 1) * GNX + x0];
    const d = grid[(z0 + 1) * GNX + x0 + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  /** Where the river runs at this z, metres across the valley. */
  function riverX(z) {
    return WORLD.riverSwing * Math.sin(z * 0.0011) + 60 * Math.sin(z * 0.00043 + 1.7);
  }

  /** Ground height at a world point, metres. */
  function heightAt(x, z) {
    const wall = smooth(WORLD.wallStart, WORLD.wallFull, Math.abs(x));
    let h =
      WORLD.floor +
      35 * noiseAt(broad, x, z) +
      140 * wall +
      260 * wall * noiseAt(detail, x, z);
    const riverD = Math.abs(x - riverX(z));
    const dip = 1 - smooth(10, 60, riverD);
    h = lerp(h, 12, dip * 0.8);
    for (const rw of [WORLD.runway1, WORLD.runway2]) {
      const dz = z < rw.z0 ? rw.z0 - z : z > rw.z1 ? z - rw.z1 : 0;
      const flat = (1 - smooth(40, 90, Math.abs(x))) * (1 - smooth(0, 80, dz));
      h = lerp(h, WORLD.floor, flat);
    }
    return h;
  }

  /** Which runway the point is on (1 or 2), or 0. */
  function onRunway(x, z) {
    if (Math.abs(x) > WORLD.runwayHalf) return 0;
    if (z >= WORLD.runway1.z0 && z <= WORLD.runway1.z1) return 1;
    if (z >= WORLD.runway2.z0 && z <= WORLD.runway2.z1) return 2;
    return 0;
  }

  /** The rings for this mission, strung along the valley. */
  function buildRings() {
    const rings = [];
    const phase = mission.seed * 0.7;
    for (let i = 0; i < mission.rings; i += 1) {
      const t = mission.rings === 1 ? 0.5 : i / (mission.rings - 1);
      const z = lerp(RING.firstZ, RING.lastZ, t);
      const x = 240 * Math.sin(z * 0.0011 + phase) + 90 * Math.sin(z * 0.0023 + mission.seed);
      const y = heightAt(x, z) + 55 + 40 * (0.5 + 0.5 * Math.sin(i * 2.1 + mission.seed));
      rings.push({ x, y, z, r: RING.radius, passed: false });
    }
    return rings;
  }

  const plane = {
    x: 0, y: 0, z: 0,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, vy: 0, throttle: 0,
    gearDown: true, onGround: true,
  };

  const state = {
    missionIndex,
    mission,
    time: 0,
    score: 0,
    lives: LIVES,
    fuel: mission.fuel,
    rings: buildRings(),
    ringIndex: 0,
    status: 'flying',
    approach: 'rings',
    message: '',
    messageT: 0,
    fuelWarned: false,
    stallWarned: false,
    crashReason: '',
    plane,
    respawn: null,
  };

  function say(text, seconds) {
    state.message = text;
    state.messageT = seconds;
  }

  function reset() {
    state.time = 0;
    state.score = 0;
    state.lives = LIVES;
    state.fuel = mission.fuel;
    state.rings = buildRings();
    state.ringIndex = 0;
    state.status = 'flying';
    state.fuelWarned = false;
    state.stallWarned = false;
    state.crashReason = '';
    placeAtStart();
    say('Throttle up — rotate at 80 kt', 5);
  }

  function placeAtStart() {
    plane.x = 0;
    plane.z = 120;
    plane.y = heightAt(0, 120) + 1.5;
    plane.heading = 0;
    plane.pitch = 0;
    plane.roll = 0;
    plane.speed = 0;
    plane.vy = 0;
    plane.throttle = 0;
    plane.gearDown = true;
    plane.onGround = true;
    state.respawn = { x: 0, y: plane.y + 120, z: 120, heading: 0, speed: 55 };
  }

  function respawn() {
    const r = state.respawn;
    plane.x = r.x;
    plane.y = r.y;
    plane.z = r.z;
    plane.heading = r.heading;
    plane.pitch = 0;
    plane.roll = 0;
    plane.speed = r.speed;
    plane.vy = 0;
    plane.throttle = 0.6;
    plane.gearDown = true;
    plane.onGround = false;
    state.fuel = Math.max(state.fuel, mission.fuel * 0.6);
    state.status = 'flying';
    say('Back in the air — fly the next ring', 4);
  }

  /** The next ring, or the landing runway once they are all passed. */
  function nextTarget() {
    if (state.ringIndex < state.rings.length) return state.rings[state.ringIndex];
    return { x: 0, y: heightAt(0, 5750) + 45, z: 5750, r: 40, runway: true };
  }

  /**
   * One fixed step. input: { roll, pitch, throttleDelta, brake } each -1..1
   * (throttleDelta is per second). Returns event flags.
   */
  function step(dt, input) {
    let events = 0;
    if (state.status !== 'flying') return events;
    state.time += dt;
    if (state.messageT > 0) state.messageT -= dt;

    // Throttle and fuel.
    plane.throttle = clamp(plane.throttle + input.throttleDelta * dt, 0, 1);
    if (state.fuel <= 0) {
      plane.throttle = 0;
      if (!state.fuelWarned) {
        state.fuelWarned = true;
        events |= EVENT_FUEL;
        say('OUT OF FUEL — glide to a runway', 5);
      }
    } else {
      state.fuel = Math.max(0, state.fuel - (PLANE.fuelIdle + plane.throttle * PLANE.fuelFull) * dt);
      if (state.fuel < 20 && !state.fuelWarned) {
        state.fuelWarned = true;
        say('LOW FUEL', 4);
      }
    }

    // Bank and pitch chase the stick; turbulence wobbles the bank.
    const stalled = !plane.onGround && plane.speed < PLANE.stallSpeed;
    const authority = stalled ? 0.45 : 1;
    const targetBank = input.roll * PLANE.maxBank * DEG * authority;
    plane.roll += clamp(targetBank - plane.roll, -PLANE.bankRate * dt, PLANE.bankRate * dt);
    if (mission.turbulence > 0 && !plane.onGround) {
      plane.roll += Math.sin(state.time * 2.7) * mission.turbulence * 0.22 * dt;
      plane.pitch += Math.sin(state.time * 3.9 + 1.3) * mission.turbulence * 0.1 * dt;
    }
    const targetPitch = input.pitch * PLANE.maxPitch * DEG * authority;
    plane.pitch += clamp(targetPitch - plane.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);

    // A coordinated turn: bank turns the heading.
    const turnRate = (G * Math.tan(plane.roll)) / Math.max(plane.speed, 20);
    plane.heading += turnRate * dt;

    // Speed chases its throttle target; climbing bleeds it, diving gains it.
    const targetSpeed = PLANE.minSpeed + plane.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
    let speed = plane.speed + (targetSpeed - plane.speed) * Math.min(1, PLANE.speedRate * dt);
    let vy = speed * Math.sin(plane.pitch);
    if (stalled) {
      vy -= PLANE.stallSink * (1 - plane.speed / PLANE.stallSpeed);
      if (!state.stallWarned) {
        state.stallWarned = true;
        say('STALL — nose down, throttle up', 3);
      }
    } else {
      state.stallWarned = false;
    }
    speed = clamp(speed - vy * PLANE.climbBleed * dt, 0, PLANE.maxSpeed * 1.15);
    plane.speed = speed;
    plane.vy = vy;

    // Wind pushes the plane sideways across the valley.
    const windX = mission.wind * 0.35 + Math.sin(state.time * 1.3) * mission.wind * 0.15;
    const windZ = -mission.wind * 0.1;

    if (plane.onGround) {
      plane.y = heightAt(plane.x, plane.z) + 1.5;
      plane.speed = Math.max(0, plane.speed - (input.brake ? PLANE.brake : PLANE.groundDrag) * dt);
      plane.roll *= 0.9;
      // The takeoff roll covers ground along the runway.
      plane.z += plane.speed * Math.cos(plane.heading) * dt;
      plane.x += plane.speed * Math.sin(plane.heading) * dt;
      if (plane.speed > PLANE.rotateSpeed && input.pitch > 0.25) {
        plane.onGround = false;
        plane.pitch = Math.max(plane.pitch, 10 * DEG);
        say('Airborne!', 2);
      }
    } else {
      const ch = Math.cos(plane.heading);
      const sh = Math.sin(plane.heading);
      const fwd = Math.cos(plane.pitch) * plane.speed;
      plane.z += fwd * ch * dt + windZ * dt;
      plane.x += fwd * sh * dt + windX * dt;
      plane.y += vy * dt;
    }

    // End of the valley: turn the plane back toward the runway.
    if (plane.z > 6300) {
      plane.heading += Math.PI * dt * 0.4;
      say('End of the valley — turning back', 2);
    }
    if (plane.z < -250) {
      plane.heading += Math.PI * dt * 0.4;
      say('Too far back — turning around', 2);
    }

    // Ground contact: only when descending onto the terrain.
    const gh = heightAt(plane.x, plane.z);
    if (!plane.onGround && plane.y <= gh + 1.5 && plane.vy <= 0.5) {
      const rw = onRunway(plane.x, plane.z);
      if (rw && plane.gearDown && plane.vy >= -6 && plane.speed < 78) {
        const touchdownVy = plane.vy;
        plane.onGround = true;
        plane.y = gh + 1.5;
        plane.vy = 0;
        events |= EVENT_LAND;
        if (state.ringIndex >= state.rings.length && rw === 2) {
          state.status = 'landed';
          const soft = Math.max(0, 6 + touchdownVy) * SCORE.softness;
          const bonus = SCORE.landing + Math.round(state.fuel) * SCORE.fuelBonus + Math.round(soft);
          const timeBonus = Math.max(0, Math.round((mission.timeLimit - state.time) * SCORE.timeBonus));
          state.score += bonus + timeBonus;
          events |= EVENT_MISSION;
          if (missionIndex >= MISSIONS.length - 1) events |= EVENT_WIN;
        } else {
          state.fuel = mission.fuel;
          say('On the ground — refuelled, take off again', 4);
        }
      } else {
        state.status = 'crashed';
        state.crashReason =
          !plane.gearDown && rw ? 'Belly landing — lower the gear (G)' :
          plane.vy < -6 ? 'Hard landing — flare before touchdown' :
          plane.speed >= 78 ? 'Too fast to land — slow down' :
          'Flew into the terrain';
        events |= EVENT_CRASH;
        state.lives -= 1;
        if (state.lives <= 0) state.status = 'over';
      }
    }

    // Rings: fly through the glowing hoop.
    if (state.ringIndex < state.rings.length && state.status === 'flying') {
      const ring = state.rings[state.ringIndex];
      const dx = plane.x - ring.x;
      const dy = plane.y - ring.y;
      const dz = plane.z - ring.z;
      if (dx * dx + dy * dy + dz * dz < ring.r * ring.r) {
        ring.passed = true;
        state.ringIndex += 1;
        state.score += SCORE.ring;
        events |= EVENT_RING;
        const last = state.rings[state.ringIndex - 1];
        state.respawn = {
          x: last.x, y: last.y + 40, z: last.z - 260,
          heading: 0, speed: 55,
        };
        say(
          state.ringIndex >= state.rings.length
            ? 'All rings — land on Runway 27'
            : `Ring ${state.ringIndex} of ${state.rings.length}`,
          2.5,
        );
      }
    }

    // Out of time.
    if (state.time > mission.timeLimit && state.status === 'flying') {
      state.status = 'crashed';
      state.crashReason = 'Out of time — the sortie window closed';
      events |= EVENT_CRASH;
      state.lives -= 1;
      if (state.lives <= 0) state.status = 'over';
    }

    return events;
  }

  reset();
  return { state, plane, heightAt, riverX, onRunway, nextTarget, reset, respawn, step };
}
