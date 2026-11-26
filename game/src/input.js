// Alpine Courier — keyboard and mouse. Arrows bank and pitch, W/S and
// Shift/Ctrl work the throttle, G lowers the gear, Space brakes on the
// ground. The mouse steers too: move the pointer to bank, wheel for
// throttle. poll() turns the held keys into one step's flight input.
import { STEP } from './config.js';

export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_GEAR = 'gear';
export const ACTION_MUTE = 'mute';
export const ACTION_MISSION_1 = 'mission1';
export const ACTION_MISSION_2 = 'mission2';
export const ACTION_MISSION_3 = 'mission3';

export function createInput(canvas, onAction) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, active: false, lastMove: 0 };

  function keyDown(event) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(event.key.toLowerCase());
    if (event.key === 'Enter') onAction(ACTION_CONFIRM);
    else if (event.key.toLowerCase() === 'p') onAction(ACTION_PAUSE);
    else if (event.key.toLowerCase() === 'g') onAction(ACTION_GEAR);
    else if (event.key.toLowerCase() === 'm') onAction(ACTION_MUTE);
    else if (event.key === '1') onAction(ACTION_MISSION_1);
    else if (event.key === '2') onAction(ACTION_MISSION_2);
    else if (event.key === '3') onAction(ACTION_MISSION_3);
  }

  function keyUp(event) {
    keys.delete(event.key.toLowerCase());
  }

  function pointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) / rect.width - 0.5;
    mouse.y = (event.clientY - rect.top) / rect.height - 0.5;
    mouse.active = true;
    mouse.lastMove = performance.now();
  }

  function wheel(event) {
    event.preventDefault();
    mouse.wheel = (mouse.wheel ?? 0) - Math.sign(event.deltaY) * 0.12;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('pointerdown', () => onAction(ACTION_CONFIRM));

  /** One step's flight input from the held keys and the mouse. */
  function poll() {
    let roll = 0;
    let pitch = 0;
    if (keys.has('arrowleft') || keys.has('a')) roll -= 1;
    if (keys.has('arrowright') || keys.has('d')) roll += 1;
    if (keys.has('arrowup') || keys.has('w')) pitch += 1;
    if (keys.has('arrowdown') || keys.has('s')) pitch -= 1;

    // The mouse steers when it moved recently and no arrow key is held.
    if (mouse.active && performance.now() - mouse.lastMove < 4000 && roll === 0 && pitch === 0) {
      roll = Math.max(-1, Math.min(1, mouse.x * 2.4));
      pitch = Math.max(-1, Math.min(1, -mouse.y * 2.4));
    }

    let throttleDelta = 0;
    if (keys.has('shift')) throttleDelta += 1;
    if (keys.has('control')) throttleDelta -= 1;
    if (mouse.wheel) {
      throttleDelta += mouse.wheel / STEP;
      mouse.wheel = 0;
    }

    return {
      roll,
      pitch,
      throttleDelta,
      brake: keys.has(' '),
    };
  }

  return { poll };
}
