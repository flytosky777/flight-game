// Alpine Courier — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.

export const VIEW = { w: 1280, h: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** Metres, knots and feet: 1 m/s is about 1.94 kt; altitudes show in feet. */
export const MS_TO_KT = 1.94384;
export const M_TO_FT = 3.28084;

export const PLANE = {
  /** Top speed at full throttle, m/s (~185 kt). */
  maxSpeed: 95,
  /** Speed the plane settles at with the throttle shut, m/s. */
  minSpeed: 24,
  /** How fast speed chases its throttle target, per second. */
  speedRate: 0.45,
  /** Climbing bleeds speed; diving gains it, m/s per m/s of vertical speed. */
  climbBleed: 0.55,
  /** Bank angle at full stick, degrees. */
  maxBank: 55,
  /** How fast the bank chases the stick, per second. */
  bankRate: 2.6,
  /** Pitch angle at full stick, degrees. */
  maxPitch: 18,
  /** How fast pitch chases the stick, per second. */
  pitchRate: 2.2,
  /** Speed below which the wing quits and the nose drops, m/s. */
  stallSpeed: 30,
  /** Extra sink when stalled, m/s. */
  stallSink: 9,
  /** Rotation speed on the takeoff roll, m/s. */
  rotateSpeed: 42,
  /** Fuel units burned per second: idle plus throttle. */
  fuelIdle: 0.1,
  fuelFull: 0.5,
  /** Runway roll: how fast the plane slows with the brake, m/s per second. */
  brake: 22,
  /** Rolling drag on the ground, m/s per second. */
  groundDrag: 4,
};

/** The valley the missions fly through: x is across it, z is along it. */
export const WORLD = {
  length: 6400,
  /** The river meanders around x = 0 by this much, metres. */
  riverSwing: 170,
  /** Valley floor height, metres. */
  floor: 20,
  /** Where the valley walls start to rise, |x| in metres. */
  wallStart: 380,
  /** Where the walls are full height, |x| in metres. */
  wallFull: 1500,
  /** Wall height, metres. */
  wallHeight: 620,
  /** Snow starts above this height, metres. */
  snowLine: 330,
  /** Rock starts above this height, metres. */
  rockLine: 190,
  /** The first runway: z from 0 to 600, the second from 5400 to 6100. */
  runway1: { z0: 0, z1: 600 },
  runway2: { z0: 5400, z1: 6100 },
  /** Half-width of the runway strip, metres. */
  runwayHalf: 22,
};

export const RING = {
  /** Ring radius, metres. */
  radius: 26,
  /** Rings start this far along the valley, metres. */
  firstZ: 900,
  /** Rings end this far along the valley, metres — far enough south of the
   * landing runway that a straight-in final is a gentle descent. */
  lastZ: 4600,
};

/** Three sorties, each harder than the last. */
export const MISSIONS = [
  {
    name: 'First Flight',
    sub: 'Five rings over Green Valley — then land on Runway 27',
    seed: 11,
    rings: 5,
    fuel: 100,
    wind: 0,
    turbulence: 0,
    dusk: 0,
    timeLimit: 300,
  },
  {
    name: 'Mountain Pass',
    sub: 'Seven rings through a narrow valley, gusts on the ridge',
    seed: 23,
    rings: 7,
    fuel: 100,
    wind: 6,
    turbulence: 0.35,
    dusk: 0.3,
    timeLimit: 360,
  },
  {
    name: 'Storm Run',
    sub: 'Eight rings at dusk, low fuel, turbulence over the peaks',
    seed: 47,
    rings: 8,
    fuel: 90,
    wind: 10,
    turbulence: 0.7,
    dusk: 0.85,
    timeLimit: 360,
  },
];

export const LIVES = 3;

export const SCORE = {
  ring: 100,
  landing: 400,
  fuelBonus: 2,
  softness: 20,
  timeBonus: 2,
};

export const PALETTE = {
  skyTop: ['#2f6fb2', '#3a6ea8', '#274b73'],
  skyHorizon: ['#bcd8ee', '#d9c9a8', '#e8955f'],
  sun: ['#fff3c4', '#ffe9a8', '#ff9a4d'],
  mountainFar: ['#8fa8c4', '#7d8aa0', '#5d5a6e'],
  mountainNear: ['#5d748f', '#4d5a70', '#3a3547'],
  grass: '#4d7d3d',
  grassDark: '#3c6a31',
  meadow: '#6a8f4a',
  rock: '#6e5f4c',
  snow: '#e9eef2',
  water: '#3f7fbf',
  waterDark: '#2f6aa8',
  asphalt: '#33363b',
  asphaltLine: '#e8e8e8',
  ring: '#37e0ff',
  ringNext: '#ffd23f',
  ringDone: '#58d68d',
  hudPanel: 'rgba(10, 18, 30, 0.62)',
  hudText: '#eef4fa',
  hudAccent: '#ffd23f',
  hudWarn: '#ff5a4d',
  hudGood: '#58d68d',
  planeCream: '#f2ede2',
  planeRed: '#c0392b',
  planeDark: '#2c3e50',
  glass: '#9fd8ef',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = '"SF Mono", "Cascadia Mono", Consolas, monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'alpine-courier.best';
