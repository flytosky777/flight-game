// Alpine Courier — everything the player sees: sky, ridges, the projected
// valley floor, the rings, the plane in chase view, the lit instruments and
// the HUD. The world is a heightfield; the camera sits at the plane and
// looks along its heading, so the ground is drawn as projected quads,
// far rows first so near rows paint over them.
import { MISSIONS, MONO, PALETTE, VIEW } from './config.js';
import { clamp, lerp, smooth } from './random.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;
export const SCREEN_LANDED = 4;
export const SCREEN_WON = 5;

const W = VIEW.w;
const H = VIEW.h;
const CX = W / 2;
const CY = H / 2;
const FOCAL = 520;
const DEG = Math.PI / 180;

/** Row distances ahead of the camera, metres: dense near, sparse far. */
const ROWS = [10, 16, 24, 34, 46, 60, 76, 95, 116, 140, 168, 200, 236, 278, 326, 380, 442, 512, 592, 682, 784, 898, 1026, 1170, 1330];
/** Column offsets across the valley, metres. */
const COLS = [-900, -700, -520, -380, -260, -160, -80, -30, 0, 30, 80, 160, 260, 380, 520, 700, 900];

/** Parse a colour given as #rrggbb or rgb(r,g,b) into [r, g, b]. */
function toRgb(color) {
  if (color.startsWith('rgb')) {
    return color
      .slice(4, -1)
      .split(',')
      .map((n) => parseInt(n, 10));
  }
  return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
}

function hexRgb(hex) {
  return toRgb(hex);
}

function mix(a, b, t) {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
}

function rgba(hex, a) {
  const c = hexRgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  // Clouds drift across the sky, fixed to the world by azimuth.
  const clouds = [];
  for (let i = 0; i < 11; i += 1) {
    clouds.push({
      az: (i * 0.6180339887) % (Math.PI * 2),
      el: 0.12 + ((i * 0.37) % 0.3),
      size: 60 + ((i * 53) % 120),
      speed: 0.004 + ((i * 7) % 5) * 0.001,
    });
  }

  /** Project a world point into screen space; null when behind the camera. */
  function project(cam, p) {
    const dx = p.x - cam.x;
    const dy = p.y - cam.y;
    const dz = p.z - cam.z;
    const ch = Math.cos(-cam.heading);
    const sh = Math.sin(-cam.heading);
    const rx = dx * ch - dz * sh;
    let rz = dx * sh + dz * ch;
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const ry = dy * cp - rz * sp;
    rz = dy * sp + rz * cp;
    if (rz < 2) return null;
    return { x: CX + (rx * FOCAL) / rz, y: CY - (ry * FOCAL) / rz, s: FOCAL / rz, z: rz };
  }

  /** Screen position of a direction (azimuth, elevation) from the camera. */
  function projectDir(cam, az, el) {
    const dir = { x: Math.sin(az), y: Math.tan(el), z: Math.cos(az) };
    const p = { x: cam.x + dir.x * 1000, y: cam.y + dir.y * 1000, z: cam.z + dir.z * 1000 };
    return project(cam, p);
  }

  function drawSky(world, t) {
    const dusk = world.state.mission.dusk;
    const top = mix(PALETTE.skyTop[0], PALETTE.skyTop[2], dusk);
    const horizon = mix(PALETTE.skyHorizon[0], PALETTE.skyHorizon[2], dusk);
    const grad = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    grad.addColorStop(0, top);
    grad.addColorStop(1, horizon);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H * 0.62 + 2);

    // Sun: low and warm at dusk, high and pale at noon.
    const sunEl = lerp(0.42, 0.1, dusk);
    const sunAz = 0.85;
    const sun = projectDir(world.plane, sunAz, sunEl);
    if (sun) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 150);
      glow.addColorStop(0, rgba(PALETTE.sun[dusk > 0.5 ? 2 : 0], 0.9));
      glow.addColorStop(1, 'rgba(255, 220, 140, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - 150, sun.y - 150, 300, 300);
      ctx.fillStyle = PALETTE.sun[dusk > 0.5 ? 2 : 0];
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }

    // Clouds, drifting with the wind: three soft puffs each, drawn
    // separately so they blend instead of leaving a hard edge.
    for (const c of clouds) {
      const az = c.az + t * c.speed;
      const pos = projectDir(world.plane, az, c.el);
      if (!pos || pos.z < 0) continue;
      const s = c.size * pos.s * 0.8;
      if (s < 8) continue;
      ctx.fillStyle = dusk > 0.5 ? 'rgba(255, 190, 150, 0.5)' : 'rgba(255,255,255,0.55)';
      for (const [ox, oy, rx, ry] of [[0, 0, 1, 0.36], [-0.55, 0.08, 0.6, 0.26], [0.55, 0.06, 0.65, 0.28]]) {
        ctx.beginPath();
        ctx.ellipse(pos.x + ox * s, pos.y + oy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** A jagged ridge silhouette at a fixed distance, by azimuth. */
  function drawRidge(world, seed, base, amp, color) {
    const cam = world.plane;
    const pts = [];
    for (let a = cam.heading - 1.15; a <= cam.heading + 1.15; a += 0.03) {
      const wob = 0.5 + 0.5 * Math.sin(a * 7.3 + seed) * Math.sin(a * 13.1 + seed * 2.7);
      const h = base + amp * wob * wob;
      const dir = { x: Math.sin(a), y: 0, z: Math.cos(a) };
      const p = project(cam, { x: cam.x + dir.x * 9000, y: h, z: cam.z + dir.z * 9000 });
      if (p) pts.push(p);
    }
    if (pts.length < 2) return;
    const horizonY = CY - Math.tan(cam.pitch) * FOCAL;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, horizonY);
    for (const p of pts) ctx.lineTo(p.x, Math.min(p.y, horizonY + 4));
    ctx.lineTo(pts[pts.length - 1].x, horizonY);
    ctx.closePath();
    ctx.fill();
  }

  function groundColor(world, x, z, h, dist) {
    const dusk = world.state.mission.dusk;
    const fog = clamp(dist / 2200, 0, 0.45);
    const horizon = mix(PALETTE.skyHorizon[0], PALETTE.skyHorizon[2], dusk);
    let c;
    const riverD = Math.abs(x - world.riverX(z));
    if (riverD < 16 && h < 40) {
      c = mix(PALETTE.water, PALETTE.waterDark, 0.5 + 0.5 * Math.sin(x * 0.3 + z * 0.05));
    } else if (Math.abs(x) < 22 && ((z >= 0 && z <= 600) || (z >= 5400 && z <= 6100))) {
      c = PALETTE.asphalt;
      if (Math.abs(x) < 2.5 && (z % 60) < 30) c = PALETTE.asphaltLine;
      if (Math.abs(x) > 18 && Math.abs(x) < 21) c = PALETTE.asphaltLine;
    } else if (h > 330) {
      c = PALETTE.snow;
    } else if (h > 190) {
      c = mix(PALETTE.rock, PALETTE.snow, smooth(280, 330, h) * 0.5);
    } else if (h > 60) {
      c = mix(PALETTE.meadow, PALETTE.grassDark, 0.5 + 0.5 * Math.sin(x * 0.11 + z * 0.07));
    } else {
      c = mix(PALETTE.grass, PALETTE.grassDark, 0.5 + 0.5 * Math.sin(x * 0.13 + z * 0.09));
    }
    return mix(c, horizon, fog);
  }

  function drawGround(world) {
    const cam = world.plane;
    // Base fill below the horizon so the hairlines between quads read as
    // ground, never as sky showing through.
    const horizonY = CY - Math.tan(cam.pitch) * FOCAL;
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, Math.max(0, horizonY), W, H);
    const ch = Math.cos(cam.heading);
    const sh = Math.sin(cam.heading);
    // Right vector across the valley, perpendicular to the heading.
    const rx = ch;
    const rz = -sh;
    const fx = sh;
    const fz = ch;
    for (let r = ROWS.length - 1; r >= 0; r -= 1) {
      const d0 = ROWS[r];
      const d1 = r === 0 ? 2 : ROWS[r - 1];
      for (let col = 0; col < COLS.length - 1; col += 1) {
        const t0 = COLS[col];
        const t1 = COLS[col + 1];
        const pts = [];
        let ok = true;
        for (const [d, t] of [[d0, t0], [d0, t1], [d1, t1], [d1, t0]]) {
          const wx = cam.x + fx * d + rx * t;
          const wz = cam.z + fz * d + rz * t;
          const wy = world.heightAt(wx, wz);
          const p = project(cam, { x: wx, y: wy, z: wz });
          if (!p) {
            ok = false;
            break;
          }
          pts.push(p);
        }
        if (!ok) continue;
        const midX = cam.x + fx * ((d0 + d1) / 2) + rx * ((t0 + t1) / 2);
        const midZ = cam.z + fz * ((d0 + d1) / 2) + rz * ((t0 + t1) / 2);
        const midH = world.heightAt(midX, midZ);
        ctx.fillStyle = groundColor(world, midX, midZ, midH, (d0 + d1) / 2);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.lineTo(pts[3].x, pts[3].y);
        ctx.closePath();
        ctx.fill();
        // Stroke in the same colour so anti-aliasing never leaves a
        // hairline of sky between neighbouring quads.
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  function drawRings(world) {
    const cam = world.plane;
    const rings = world.state.rings;
    const order = rings
      .map((ring, i) => ({ ring, i }))
      .filter(({ ring }) => !ring.passed)
      .sort((a, b) => {
        const da = (a.ring.z - cam.z) ** 2 + (a.ring.x - cam.x) ** 2;
        const db = (b.ring.z - cam.z) ** 2 + (b.ring.x - cam.x) ** 2;
        return db - da;
      });
    for (const { ring, i } of order) {
      const c = project(cam, ring);
      if (!c) continue;
      const isNext = i === world.state.ringIndex;
      const radius = ring.r * c.s;
      if (radius < 3) continue;
      ctx.save();
      ctx.strokeStyle = isNext ? PALETTE.ringNext : PALETTE.ring;
      ctx.lineWidth = Math.max(2, radius * 0.09);
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, radius, radius * 0.94, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = `bold ${Math.max(11, Math.round(radius * 0.34))}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), c.x, c.y);
      ctx.restore();
    }
  }

  function drawPlaneShadow(world) {
    const cam = world.plane;
    const gh = world.heightAt(cam.x, cam.z);
    const alt = cam.y - gh;
    if (alt > 260) return;
    const p = project(cam, { x: cam.x, y: gh + 1, z: cam.z + 6 });
    if (!p) return;
    const size = clamp(120 - alt * 0.3, 12, 120);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${clamp(0.3 - alt * 0.001, 0.05, 0.3)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size, size * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** The bush plane in chase view, drawn in screen space over the world. */
  function drawPlane(world, t) {
    const p = world.plane;
    const pitchVis = p.onGround ? 0 : p.pitch;
    const px = CX + p.roll * 60;
    const py = 478 - pitchVis * 260 + Math.sin(t * 40) * 0.6;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.roll * 0.85);

    // Prop blur disc at the nose (far end, up the screen).
    const propA = 0.16 + 0.1 * Math.sin(t * 31);
    ctx.fillStyle = `rgba(200,205,210,${propA})`;
    ctx.beginPath();
    ctx.ellipse(0, -86, 52, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,66,72,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, -86, 52, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wings: wide, slight dihedral, red tips.
    ctx.fillStyle = PALETTE.planeCream;
    ctx.beginPath();
    ctx.moveTo(-14, -18);
    ctx.lineTo(-168, 6);
    ctx.lineTo(-168, 20);
    ctx.lineTo(-14, 26);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -18);
    ctx.lineTo(168, 6);
    ctx.lineTo(168, 20);
    ctx.lineTo(14, 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeRed;
    ctx.fillRect(-168, 6, 26, 14);
    ctx.fillRect(142, 6, 26, 14);
    ctx.strokeStyle = 'rgba(44,62,80,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -18);
    ctx.lineTo(-168, 6);
    ctx.moveTo(14, -18);
    ctx.lineTo(168, 6);
    ctx.stroke();

    // Fuselage: wide at the tail (near the camera), tapering to the nose.
    const body = ctx.createLinearGradient(-20, 0, 20, 0);
    body.addColorStop(0, '#e3dcc9');
    body.addColorStop(0.5, PALETTE.planeCream);
    body.addColorStop(1, '#d8d0ba');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-16, 96);
    ctx.quadraticCurveTo(-22, 30, -13, -58);
    ctx.quadraticCurveTo(-8, -84, 0, -86);
    ctx.quadraticCurveTo(8, -84, 13, -58);
    ctx.quadraticCurveTo(22, 30, 16, 96);
    ctx.quadraticCurveTo(0, 104, -16, 96);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(44,62,80,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Red cheatline down the fuselage.
    ctx.fillStyle = PALETTE.planeRed;
    ctx.beginPath();
    ctx.moveTo(-13, 60);
    ctx.lineTo(-10, -40);
    ctx.lineTo(-5, -40);
    ctx.lineTo(-8, 60);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(13, 60);
    ctx.lineTo(10, -40);
    ctx.lineTo(5, -40);
    ctx.lineTo(8, 60);
    ctx.closePath();
    ctx.fill();

    // Lit cockpit windows.
    ctx.fillStyle = PALETTE.glass;
    ctx.shadowColor = '#7fd4ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(-9, -52, 5, 9, 0.25, 0, Math.PI * 2);
    ctx.ellipse(9, -52, 5, 9, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Tail fin and stabiliser (closest to the camera, at the bottom).
    ctx.fillStyle = PALETTE.planeRed;
    ctx.beginPath();
    ctx.moveTo(-9, 96);
    ctx.lineTo(-13, 62);
    ctx.lineTo(-4, 66);
    ctx.lineTo(0, 52);
    ctx.lineTo(4, 66);
    ctx.lineTo(13, 62);
    ctx.lineTo(9, 96);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeCream;
    ctx.beginPath();
    ctx.moveTo(-64, 78);
    ctx.lineTo(-14, 70);
    ctx.lineTo(-14, 82);
    ctx.lineTo(-64, 90);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(64, 78);
    ctx.lineTo(14, 70);
    ctx.lineTo(14, 82);
    ctx.lineTo(64, 90);
    ctx.closePath();
    ctx.fill();

    // Registration and nav lights.
    ctx.fillStyle = PALETTE.planeDark;
    ctx.font = `bold 11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('N-ALPINE', 0, 44);
    const blink = Math.sin(t * 6) > 0;
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ff3b30';
    ctx.shadowColor = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-168, 13, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#34d17b';
    ctx.shadowColor = '#34d17b';
    ctx.beginPath();
    ctx.arc(168, 13, 4, 0, Math.PI * 2);
    ctx.fill();
    if (blink) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 100, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
  }

  function drawCompass(world) {
    const p = world.plane;
    const cx = CX;
    const headingDeg = ((Math.round((p.heading * 180) / Math.PI) % 360) + 360) % 360;
    const scale = 1.6;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 280, 6, 560, 48);
    ctx.clip();
    ctx.fillStyle = PALETTE.hudText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let d = -180; d <= 180; d += 5) {
      const deg = ((Math.round(headingDeg / 5) * 5 + d) % 360 + 360) % 360;
      const dx = d * scale;
      const major = deg % 45 === 0;
      const mid = deg % 15 === 0;
      ctx.globalAlpha = 1 - Math.abs(d) / 220;
      ctx.fillRect(cx + dx - 1, 10, 2, major ? 12 : mid ? 8 : 5);
      if (major) {
        const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg);
        ctx.font = `bold 12px ${MONO}`;
        ctx.fillText(label, cx + dx, 32);
      }
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.beginPath();
    ctx.moveTo(cx - 7, 6);
    ctx.lineTo(cx + 7, 6);
    ctx.lineTo(cx, 15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `bold 15px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(headingDeg).padStart(3, '0') + '°', cx, 50);
  }

  function drawAttitude(world) {
    const p = world.plane;
    const x = 92;
    const y = 618;
    const r = 48;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(p.roll);
    ctx.translate(0, clamp(p.pitch * 260, -r, r));
    ctx.fillStyle = '#3f7fbf';
    ctx.fillRect(-r, -r * 2, r * 2, r * 2);
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(-r, 0, r * 2, r * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = PALETTE.hudText;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.beginPath();
    ctx.moveTo(x - 16, y);
    ctx.lineTo(x + 16, y);
    ctx.lineTo(x, y + 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `bold 11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('ATT', x, y + r + 13);
    const vs = p.vy;
    ctx.fillText(`VS ${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`, x, y - r - 8);
  }

  function drawHud(world, t) {
    const s = world.state;
    const p = world.plane;
    ctx.fillStyle = 'rgba(8, 14, 24, 0.45)';
    ctx.fillRect(0, 0, W, 56);

    ctx.fillStyle = PALETTE.hudText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `bold 12px ${MONO}`;
    ctx.fillText('ALT', 18, 22);
    ctx.font = `bold 24px ${MONO}`;
    ctx.fillText(`${Math.round(p.y * 3.28084).toLocaleString()} FT`, 18, 46);

    drawCompass(world);

    ctx.textAlign = 'right';
    ctx.font = `bold 12px ${MONO}`;
    ctx.fillText('SPD', W - 178, 22);
    ctx.font = `bold 24px ${MONO}`;
    ctx.fillText(`${Math.round(p.speed * 1.94384)} KT`, W - 178, 46);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(W - 160, 14, 140, 10);
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.fillRect(W - 160, 14, 140 * p.throttle, 10);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `bold 11px ${MONO}`;
    ctx.fillText(`THR ${Math.round(p.throttle * 100)}%`, W - 20, 42);

    // Mission line under the bar.
    ctx.textAlign = 'center';
    ctx.font = `13px ${MONO}`;
    ctx.fillStyle = 'rgba(238,244,250,0.85)';
    ctx.fillText(`${s.mission.name}  ·  ${s.mission.sub}`, CX, 74);

    drawAttitude(world);

    // Fuel and gear, bottom centre.
    const fuelW = 200;
    const fuelX = CX - fuelW / 2;
    const fuelY = 668;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(fuelX, fuelY, fuelW, 12);
    ctx.fillStyle = s.fuel < 20 ? PALETTE.hudWarn : PALETTE.hudGood;
    ctx.fillRect(fuelX, fuelY, fuelW * (s.fuel / s.mission.fuel), 12);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(`FUEL ${Math.round(s.fuel)}%`, CX, fuelY - 8);
    ctx.fillStyle = p.gearDown ? PALETTE.hudGood : PALETTE.hudWarn;
    ctx.fillText(
      p.gearDown ? 'GEAR DOWN' : 'GEAR UP',
      CX,
      fuelY + 28,
    );

    // Rings, time and score, bottom right.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `bold 15px ${MONO}`;
    ctx.fillText(`RINGS ${s.ringIndex}/${s.rings.length}`, W - 18, 640);
    const mins = Math.floor(s.time / 60);
    const secs = Math.floor(s.time % 60);
    ctx.font = `13px ${MONO}`;
    ctx.fillText(`TIME ${mins}:${String(secs).padStart(2, '0')} / ${Math.floor(s.mission.timeLimit / 60)}:${String(s.mission.timeLimit % 60).padStart(2, '0')}`, W - 18, 662);
    ctx.fillText(`SCORE ${s.score.toLocaleString()}`, W - 18, 684);
    ctx.fillText(`LIVES ${'♥'.repeat(s.lives)}${'♡'.repeat(Math.max(0, 3 - s.lives))}`, W - 18, 706);

    // Speed streaks when fast: short diagonal wisps at the frame's edges.
    if (p.speed > 72 && !p.onGround) {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i += 1) {
        const yy = 140 + i * 100 + ((t * 700 + i * 173) % 100);
        const len = 50 + p.speed * 0.5;
        ctx.beginPath();
        ctx.moveTo(10, yy);
        ctx.lineTo(10 + len, yy + 16);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(W - 10, yy);
        ctx.lineTo(W - 10 - len, yy + 16);
        ctx.stroke();
      }
    }

    // Next-ring arrow when the ring is off screen.
    const target = world.nextTarget();
    const tp = project(p, target);
    if ((!tp || tp.x < 40 || tp.x > W - 40 || tp.y < 70 || tp.y > H - 60) && s.status === 'flying') {
      const dx = tp ? tp.x - CX : Math.sin(target.x - p.x) * 100;
      const dy = tp ? tp.y - 300 : -100;
      const ang = Math.atan2(dy, dx);
      const ax = CX + Math.cos(ang) * 300;
      const ay = 300 + Math.sin(ang) * 200;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = PALETTE.ringNext;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-12, -12);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-12, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Warnings and the transient message.
    ctx.textAlign = 'center';
    ctx.font = `bold 22px ${MONO}`;
    const warn = [];
    if (!p.onGround && p.speed < 30) warn.push('STALL — NOSE DOWN');
    if (s.fuel < 20 && s.fuel > 0) warn.push('LOW FUEL');
    if (s.fuel <= 0) warn.push('OUT OF FUEL');
    if (warn.length > 0 && Math.sin(t * 8) > -0.2) {
      ctx.fillStyle = PALETTE.hudWarn;
      ctx.fillText(warn.join('   '), CX, 110);
    }
    if (s.messageT > 0) {
      ctx.fillStyle = PALETTE.hudAccent;
      ctx.font = `bold 17px ${MONO}`;
      ctx.fillText(s.message, CX, 140);
    }
    if (!p.onGround) {
      const ahead = world.heightAt(p.x + Math.sin(p.heading) * 120, p.z + Math.cos(p.heading) * 120);
      if (p.y - ahead < 25 && p.vy < 0 && Math.sin(t * 8) > -0.2) {
        ctx.fillStyle = PALETTE.hudWarn;
        ctx.font = `bold 26px ${MONO}`;
        ctx.fillText('PULL UP', CX, 180);
      }
    }
  }

  function overlay(title, lines, hint, color) {
    ctx.fillStyle = 'rgba(6, 12, 22, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = color || PALETTE.hudText;
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText(title, CX, 250);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.hudText;
    let y = 300;
    for (const line of lines) {
      ctx.fillText(line, CX, y);
      y += 30;
    }
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.fillText(hint, CX, y + 24);
  }

  function draw(state, screen, ui) {
    const world = state.world;
    const t = ui.t;
    ctx.clearRect(0, 0, W, H);
    drawSky(world, t);
    const dusk = world.state.mission.dusk;
    drawRidge(world, world.state.mission.seed * 1.7, 520, 480, mix(PALETTE.mountainFar[0], PALETTE.mountainFar[2], dusk));
    drawRidge(world, world.state.mission.seed * 3.1, 330, 380, mix(PALETTE.mountainNear[0], PALETTE.mountainNear[2], dusk));
    drawGround(world);
    drawRings(world);
    drawPlaneShadow(world);
    drawPlane(world, t);

    if (screen === SCREEN_PLAY) {
      drawHud(world, t);
    } else if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(6, 12, 22, 0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 68px system-ui, sans-serif';
      ctx.fillText('ALPINE COURIER', CX, 190);
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.hudAccent;
      ctx.fillText('A bush-plane valley run — rings, runways and mountain weather', CX, 232);
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.hudText;
      let y = 300;
      MISSIONS.forEach((m, i) => {
        const mark = i === ui.selectedMission ? '▸ ' : '   ';
        ctx.fillText(`${mark}${i + 1}. ${m.name} — ${m.sub}`, CX, y);
        y += 30;
      });
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(238,244,250,0.8)';
      ctx.fillText('← → bank · ↑ ↓ pitch · SHIFT / CTRL throttle · G gear · SPACE brake · P pause', CX, y + 22);
      ctx.fillText('Mouse steers too — move the pointer to bank, wheel for throttle', CX, y + 48);
      ctx.font = 'bold 19px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.hudAccent;
      ctx.fillText('Press ENTER to fly — or press 1, 2 or 3 to pick a sortie', CX, y + 92);
      if (ui.best > 0) {
        ctx.font = '16px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(238,244,250,0.8)';
        ctx.fillText(`Best score: ${ui.best.toLocaleString()}`, CX, y + 124);
      }
    } else if (screen === SCREEN_PAUSED) {
      drawHud(world, t);
      overlay('PAUSED', ['The valley waits.'], 'Press P or ENTER to keep flying');
    } else if (screen === SCREEN_OVER) {
      overlay(
        'OUT OF LIVES',
        [world.state.crashReason, `Score ${world.state.score.toLocaleString()}`, `Best ${ui.best.toLocaleString()}`],
        'Press ENTER to fly again',
        PALETTE.hudWarn,
      );
    } else if (screen === SCREEN_LANDED) {
      const s = world.state;
      overlay(
        s.missionIndex >= MISSIONS.length - 1 ? 'CAMPAIGN COMPLETE' : 'MISSION COMPLETE',
        [
          `${s.mission.name} — all rings flown, wheels on Runway 27`,
          `Score ${s.score.toLocaleString()}   ·   Time ${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`,
          s.missionIndex >= MISSIONS.length - 1 ? 'You flew every sortie. The valley is yours.' : `Next: ${MISSIONS[s.missionIndex + 1].name}`,
        ],
        'Press ENTER to continue',
        PALETTE.hudGood,
      );
    }
  }

  return { draw };
}
