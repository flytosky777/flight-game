// Alpine Courier — every sound is synthesised with WebAudio: an engine drone
// that follows the throttle, wind that follows the speed, a chime for a
// ring, a thud for a crash and a soft tone for a landing. No audio files.
export function makeSounds() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let wind = null;
  let windGain = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engine = ctx.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engine.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engine.start();

      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      wind = ctx.createBufferSource();
      wind.buffer = buffer;
      wind.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 600;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      wind.connect(band);
      band.connect(windGain);
      windGain.connect(ctx.destination);
      wind.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone(freq, dur, type, vol, when) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (when ?? 0);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    ensure,
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = 0;
      if (windGain) windGain.gain.value = 0;
      return muted;
    },
    get muted() {
      return muted;
    },
    /** Called every frame with the plane's state. */
    update(plane, onGround) {
      if (!ctx || muted) return;
      const speed01 = Math.min(1, plane.speed / 95);
      engine.frequency.value = 48 + plane.throttle * 55 + speed01 * 12;
      engineGain.gain.value = onGround && plane.throttle === 0 ? 0 : 0.035 + plane.throttle * 0.05;
      windGain.gain.value = onGround ? 0 : speed01 * 0.06;
    },
    ring() {
      tone(880, 0.18, 'sine', 0.16);
      tone(1318, 0.3, 'sine', 0.14, 0.09);
    },
    land() {
      tone(523, 0.2, 'sine', 0.15);
      tone(784, 0.35, 'sine', 0.13, 0.12);
    },
    crash() {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t0);
      osc.frequency.exponentialRampToValueAtTime(30, t0 + 0.4);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.5);
    },
    click() {
      tone(660, 0.07, 'square', 0.06);
    },
  };
}
