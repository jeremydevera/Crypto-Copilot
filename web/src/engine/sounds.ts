// ── Sound Engine using Web Audio API ──────────────────────────
// Generates alert sounds programmatically — no external files needed
// Buy sounds: pleasant, positive tones (loop 5s)
// Sell sounds: alarming, urgent tones (loop 5s)

export type SoundId = 'none' | 'cash' | 'chime' | 'ding' | 'whoosh' | 'alert' | 'siren' | 'alarm' | 'klaxon' | 'redalert' | 'critical' | 'emergency';

export interface SoundOption {
  id: SoundId;
  label: string;
  category: 'buy' | 'sell';
}

export const SOUND_OPTIONS: SoundOption[] = [
  { id: 'none', label: 'None', category: 'buy' },
  // Buy sounds — pleasant, positive
  { id: 'cash', label: 'Cash Register', category: 'buy' },
  { id: 'chime', label: 'Chime', category: 'buy' },
  { id: 'ding', label: 'Ding', category: 'buy' },
  { id: 'whoosh', label: 'Whoosh', category: 'buy' },
  // Sell sounds — alarming, urgent
  { id: 'alert', label: 'Alert', category: 'sell' },
  { id: 'siren', label: 'Siren', category: 'sell' },
  { id: 'alarm', label: 'Alarm', category: 'sell' },
  { id: 'klaxon', label: 'Klaxon', category: 'sell' },
  { id: 'redalert', label: 'Red Alert', category: 'sell' },
  { id: 'critical', label: 'Critical', category: 'sell' },
  { id: 'emergency', label: 'Emergency', category: 'sell' },
];

export const BUY_SOUND_OPTIONS = SOUND_OPTIONS.filter(s => s.category === 'buy');
export const SELL_SOUND_OPTIONS = SOUND_OPTIONS.filter(s => s.category === 'sell');

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

// ── Buy Sound Patterns (positive, pleasant) ──────────────────

function playCashRegister(ctx: AudioContext, startTime: number) {
  const notes = [
    { freq: 1200, dur: 0.05, type: 'square' as OscillatorType, vol: 0.15, delay: 0 },
    { freq: 1500, dur: 0.05, type: 'square' as OscillatorType, vol: 0.15, delay: 0.05 },
    { freq: 1800, dur: 0.05, type: 'square' as OscillatorType, vol: 0.15, delay: 0.1 },
    { freq: 2400, dur: 0.2, type: 'sine' as OscillatorType, vol: 0.3, delay: 0.15 },
  ];
  notes.forEach(({ freq, dur, type, vol, delay }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime + delay);
    gain.gain.setValueAtTime(0.001, startTime + delay);
    gain.gain.linearRampToValueAtTime(vol, startTime + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime + delay);
    osc.stop(startTime + delay + dur);
  });
}

function playChime(ctx: AudioContext, startTime: number) {
  const notes = [
    { freq: 523, dur: 0.3, delay: 0 },
    { freq: 659, dur: 0.3, delay: 0.15 },
    { freq: 784, dur: 0.5, delay: 0.3 },
  ];
  notes.forEach(({ freq, dur, delay }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime + delay);
    gain.gain.setValueAtTime(0.001, startTime + delay);
    gain.gain.linearRampToValueAtTime(0.3, startTime + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime + delay);
    osc.stop(startTime + delay + dur);
  });
}

function playDing(ctx: AudioContext, startTime: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, startTime);
  gain.gain.setValueAtTime(0.4, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + 0.8);
}

function playWhoosh(ctx: AudioContext, startTime: number) {
  const notes = [
    { freq: 200, dur: 0.2, delay: 0 },
    { freq: 800, dur: 0.15, delay: 0.05 },
    { freq: 200, dur: 0.2, delay: 0.2 },
  ];
  notes.forEach(({ freq, dur, delay }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, startTime + delay);
    gain.gain.setValueAtTime(0.001, startTime + delay);
    gain.gain.linearRampToValueAtTime(0.12, startTime + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime + delay);
    osc.stop(startTime + delay + dur);
  });
}

// ── Sell Sound Patterns (alarming, urgent) ───────────────────

function playAlert(ctx: AudioContext, startTime: number) {
  const notes = [
    { freq: 600, dur: 0.15, delay: 0 },
    { freq: 600, dur: 0.15, delay: 0.2 },
    { freq: 800, dur: 0.3, delay: 0.4 },
  ];
  notes.forEach(({ freq, dur, delay }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, startTime + delay);
    gain.gain.setValueAtTime(0.001, startTime + delay);
    gain.gain.linearRampToValueAtTime(0.2, startTime + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime + delay);
    osc.stop(startTime + delay + dur);
  });
}

function playSiren(ctx: AudioContext, startTime: number) {
  const notes = [
    { freq: 400, dur: 0.3, delay: 0 },
    { freq: 600, dur: 0.3, delay: 0.3 },
    { freq: 400, dur: 0.3, delay: 0.6 },
    { freq: 600, dur: 0.4, delay: 0.9 },
  ];
  notes.forEach(({ freq, dur, delay }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, startTime + delay);
    gain.gain.setValueAtTime(0.001, startTime + delay);
    gain.gain.linearRampToValueAtTime(0.15, startTime + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime + delay);
    osc.stop(startTime + delay + dur);
  });
}

function playAlarm(ctx: AudioContext, startTime: number) {
  const notes = [
    { freq: 1200, dur: 0.08, delay: 0 },
    { freq: 1200, dur: 0.08, delay: 0.12 },
    { freq: 1200, dur: 0.08, delay: 0.24 },
    { freq: 1600, dur: 0.15, delay: 0.36 },
    { freq: 1200, dur: 0.08, delay: 0.55 },
    { freq: 1200, dur: 0.08, delay: 0.67 },
    { freq: 1200, dur: 0.08, delay: 0.79 },
    { freq: 1600, dur: 0.2, delay: 0.91 },
  ];
  notes.forEach(({ freq, dur, delay }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, startTime + delay);
    gain.gain.setValueAtTime(0.001, startTime + delay);
    gain.gain.linearRampToValueAtTime(0.2, startTime + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime + delay);
    osc.stop(startTime + delay + dur);
  });
}

function playKlaxon(ctx: AudioContext, startTime: number) {
  // Loud alternating two-tone horn — like a submarine dive alarm
  const notes = [
    { freq: 500, dur: 0.25, delay: 0 },
    { freq: 700, dur: 0.25, delay: 0.25 },
    { freq: 500, dur: 0.25, delay: 0.5 },
    { freq: 700, dur: 0.25, delay: 0.75 },
    { freq: 500, dur: 0.25, delay: 1.0 },
    { freq: 700, dur: 0.3, delay: 1.25 },
  ];
  notes.forEach(({ freq, dur, delay }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, startTime + delay);
    gain.gain.setValueAtTime(0.001, startTime + delay);
    gain.gain.linearRampToValueAtTime(0.25, startTime + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime + delay);
    osc.stop(startTime + delay + dur);
  });
}

function playRedAlert(ctx: AudioContext, startTime: number) {
  // Descending urgent tones — like a red alert on a starship
  const notes = [
    { freq: 1400, dur: 0.12, delay: 0 },
    { freq: 1200, dur: 0.12, delay: 0.15 },
    { freq: 1000, dur: 0.12, delay: 0.3 },
    { freq: 800, dur: 0.2, delay: 0.45 },
    { freq: 1400, dur: 0.12, delay: 0.7 },
    { freq: 1200, dur: 0.12, delay: 0.85 },
    { freq: 1000, dur: 0.12, delay: 1.0 },
    { freq: 800, dur: 0.25, delay: 1.15 },
  ];
  notes.forEach(({ freq, dur, delay }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, startTime + delay);
    gain.gain.setValueAtTime(0.001, startTime + delay);
    gain.gain.linearRampToValueAtTime(0.25, startTime + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime + delay);
    osc.stop(startTime + delay + dur);
  });
}

function playCritical(ctx: AudioContext, startTime: number) {
  // Very loud rapid-fire beeps — system critical failure
  const notes = [
    { freq: 2000, dur: 0.06, delay: 0 },
    { freq: 2000, dur: 0.06, delay: 0.09 },
    { freq: 2000, dur: 0.06, delay: 0.18 },
    { freq: 2500, dur: 0.1, delay: 0.27 },
    { freq: 2000, dur: 0.06, delay: 0.4 },
    { freq: 2000, dur: 0.06, delay: 0.49 },
    { freq: 2000, dur: 0.06, delay: 0.58 },
    { freq: 2500, dur: 0.1, delay: 0.67 },
    { freq: 3000, dur: 0.15, delay: 0.8 },
  ];
  notes.forEach(({ freq, dur, delay }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, startTime + delay);
    gain.gain.setValueAtTime(0.001, startTime + delay);
    gain.gain.linearRampToValueAtTime(0.3, startTime + delay + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime + delay);
    osc.stop(startTime + delay + dur);
  });
}

function playEmergency(ctx: AudioContext, startTime: number) {
  // Scariest: deep rumble + high shriek alternating — like an air raid
  const notes = [
    { freq: 150, dur: 0.3, type: 'sawtooth' as OscillatorType, vol: 0.3, delay: 0 },
    { freq: 2000, dur: 0.15, type: 'square' as OscillatorType, vol: 0.25, delay: 0.05 },
    { freq: 150, dur: 0.3, type: 'sawtooth' as OscillatorType, vol: 0.3, delay: 0.35 },
    { freq: 2000, dur: 0.15, type: 'square' as OscillatorType, vol: 0.25, delay: 0.4 },
    { freq: 150, dur: 0.3, type: 'sawtooth' as OscillatorType, vol: 0.3, delay: 0.7 },
    { freq: 2500, dur: 0.2, type: 'square' as OscillatorType, vol: 0.3, delay: 0.75 },
  ];
  notes.forEach(({ freq, dur, type, vol, delay }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime + delay);
    gain.gain.setValueAtTime(0.001, startTime + delay);
    gain.gain.linearRampToValueAtTime(vol, startTime + delay + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + delay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime + delay);
    osc.stop(startTime + delay + dur);
  });
}

// ── Pattern durations for looping ─────────────────────────────

const PATTERN_DURATIONS: Record<SoundId, number> = {
  none: 0,
  cash: 0.4,
  chime: 0.8,
  ding: 0.9,
  whoosh: 0.45,
  alert: 0.75,
  siren: 1.35,
  alarm: 1.15,
  klaxon: 1.6,
  redalert: 1.45,
  critical: 1.0,
  emergency: 1.0,
};

const LOOP_DURATION = 5; // seconds

export function playSound(soundId: SoundId) {
  if (soundId === 'none') return;

  try {
    const ctx = getAudioContext();
    const patternDur = PATTERN_DURATIONS[soundId] ?? 1;
    const loops = Math.ceil(LOOP_DURATION / patternDur);

    for (let i = 0; i < loops; i++) {
      const startTime = ctx.currentTime + i * patternDur;
      switch (soundId) {
        case 'cash': playCashRegister(ctx, startTime); break;
        case 'chime': playChime(ctx, startTime); break;
        case 'ding': playDing(ctx, startTime); break;
        case 'whoosh': playWhoosh(ctx, startTime); break;
        case 'alert': playAlert(ctx, startTime); break;
        case 'siren': playSiren(ctx, startTime); break;
        case 'alarm': playAlarm(ctx, startTime); break;
        case 'klaxon': playKlaxon(ctx, startTime); break;
        case 'redalert': playRedAlert(ctx, startTime); break;
        case 'critical': playCritical(ctx, startTime); break;
        case 'emergency': playEmergency(ctx, startTime); break;
      }
    }
  } catch {
    // Audio context may not be available
  }
}

/** Preview a sound (plays just one loop, not 5 seconds) */
export function previewSound(soundId: SoundId) {
  if (soundId === 'none') return;

  try {
    const ctx = getAudioContext();
    switch (soundId) {
      case 'cash': playCashRegister(ctx, ctx.currentTime); break;
      case 'chime': playChime(ctx, ctx.currentTime); break;
      case 'ding': playDing(ctx, ctx.currentTime); break;
      case 'whoosh': playWhoosh(ctx, ctx.currentTime); break;
      case 'alert': playAlert(ctx, ctx.currentTime); break;
      case 'siren': playSiren(ctx, ctx.currentTime); break;
      case 'alarm': playAlarm(ctx, ctx.currentTime); break;
      case 'klaxon': playKlaxon(ctx, ctx.currentTime); break;
      case 'redalert': playRedAlert(ctx, ctx.currentTime); break;
      case 'critical': playCritical(ctx, ctx.currentTime); break;
      case 'emergency': playEmergency(ctx, ctx.currentTime); break;
    }
  } catch {
    // Audio context may not be available
  }
}