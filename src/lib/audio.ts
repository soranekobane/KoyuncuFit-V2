/**
 * Web Audio beeps for the rest timer.
 * iOS Safari only allows audio after a user gesture, so we create/resume the
 * AudioContext on the first interaction (and again whenever a set is ticked).
 */
let ctx: AudioContext | null = null;

function getCtor(): typeof AudioContext | undefined {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext;
}

export function unlockAudio() {
  try {
    if (!ctx) {
      const Ctor = getCtor();
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    // Play a silent buffer – required to fully unlock on older iOS versions.
    const buffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* ignore */
  }
}

function tone(at: number, freq: number, duration: number, gain = 0.25) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** Three ascending beeps – "rest is over". */
export function playRestFinished() {
  try {
    if (!ctx) unlockAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + 0.02;
    tone(t, 880, 0.15);
    tone(t + 0.22, 880, 0.15);
    tone(t + 0.44, 1320, 0.35, 0.3);
  } catch {
    /* ignore */
  }
  if ('vibrate' in navigator) navigator.vibrate?.([120, 80, 120]);
}

/** Install one-time listeners that unlock audio on the first touch / click. */
export function installAudioUnlock() {
  const handler = () => {
    unlockAudio();
    window.removeEventListener('touchend', handler);
    window.removeEventListener('click', handler);
  };
  window.addEventListener('touchend', handler, { passive: true });
  window.addEventListener('click', handler);
}
