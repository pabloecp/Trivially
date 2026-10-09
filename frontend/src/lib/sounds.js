// The site's few sounds, made with the Web Audio API (no files to download):
//  - tap: any button or link;
//  - next / back: moving forward (a big button, a game tile, a match starting) or back (Volver, Cancelar);
//  - copy: the invite link copied;
//  - correct / wrong: a round's result.
// They come in a few sets (`SOUND_PACKS`), all soft: sine tones with a gentle attack and a long fade, through a
// low-pass filter and a quiet master volume. Which set plays is chosen with the (temporary) menu of the top bar, and how loud with the volume panel.
// `installClickSounds()` gives every click its sound in one place; a button can pick another with `data-sound="back"`
// (or any other name), or none with `data-sound="none"`. Code that plays a sound of its own while handling a click
// (`play`) keeps that click's generic one from also playing. Whether sounds are on, their volume and the set are
// kept in localStorage.

const SOUND_KEY = "trivially_sound";
const PACK_KEY = "trivially_sound_pack";
const VOLUME_KEY = "trivially_sound_volume";
// The loudest the sounds get (slider at 100); the slider starts at 50.
const MAX_GAIN = 0.9;

let ctx = null;
// Where every note goes: the soft filter in front of the master volume (see `audio`).
let master = null;
let volumeNode = null;
let lastPlayed = 0;
const listeners = new Set();

function load(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not saved: it lasts until the page reloads.
  }
}

let enabled = load(SOUND_KEY, "on") !== "off";
let volume = Math.min(100, Math.max(0, Number(load(VOLUME_KEY, 50)) || 0));

/** The sounds' volume, 0 to 100. */
export function soundVolume() {
  return volume;
}

/** Sets the sounds' volume (0 to 100). `preview` plays a tap at the new volume, for when the slider is let go. */
export function setSoundVolume(value, { preview = false } = {}) {
  volume = Math.min(100, Math.max(0, Math.round(Number(value)) || 0));
  save(VOLUME_KEY, String(volume));
  if (volumeNode) volumeNode.gain.value = (MAX_GAIN * volume) / 100;
  for (const fn of listeners) fn();
  if (preview) play("tap");
}

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(on) {
  enabled = Boolean(on);
  save(SOUND_KEY, enabled ? "on" : "off");
  for (const fn of listeners) fn();
  if (enabled) play("tap");
}

export function onSoundChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function audio() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    // Everything goes through one soft filter and a quiet volume, so no sound is ever sharp or loud.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 3200;
    filter.Q.value = 0.4;
    volumeNode = ctx.createGain();
    volumeNode.gain.value = (MAX_GAIN * volume) / 100;
    filter.connect(volumeNode).connect(ctx.destination);
    master = filter;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// One soft note: `freq` (or a glide to `to`), `at` seconds from now, rising over `attack` and fading over `dur`.
// `partials` adds quieter overtones ([ratio, level]) for a bell, wood or kalimba colour. `vibrato` ([rate in Hz, depth
// in cents]) wobbles the pitch gently, like a breath in a flute. `glide` is how long the slide to `to` takes.
function note(ac, { freq, to, at = 0, dur = 0.25, attack = 0.012, gain = 0.1, type = "sine", partials = [], vibrato, glide = 0.18 }) {
  const t = ac.currentTime + at;
  for (const [ratio, level] of [[1, 1], ...partials]) {
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = ratio === 1 ? type : "sine";
    osc.frequency.setValueAtTime(freq * ratio, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to * ratio, t + Math.min(dur, glide));
    if (vibrato) {
      const lfo = ac.createOscillator();
      const depth = ac.createGain();
      lfo.frequency.value = vibrato[0];
      depth.gain.value = vibrato[1];
      lfo.connect(depth).connect(osc.detune);
      lfo.start(t);
      lfo.stop(t + attack + dur + 0.05);
    }
    // Overtones die out sooner than the note itself, like a struck object.
    const length = ratio === 1 ? dur : dur * 0.45;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain * level, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + length);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + attack + length + 0.05);
  }
}

// A few notes one after another: [freq, at, options?].
const seq = (ac, base, notes) => notes.forEach(([freq, at, more]) => note(ac, { ...base, freq, at, ...more }));

// Note names, for reading the sets below.
const N = {
  G3: 196, A3: 220, C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494,
  C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, D6: 1175, E6: 1319, G6: 1568,
  Eb5: 622, Fs5: 740, A6: 1760,
};

// The sets. Every one has the same six sounds; `wrong` is always a gentle fall, never a buzz.
export const SOUND_PACKS = [
  {
    id: "burbuja",
    label: "Burbuja",
    hint: "Pops suaves que suben",
    sounds: {
      tap: (ac) => note(ac, { freq: 420, to: 640, dur: 0.09, gain: 0.08 }),
      next: (ac) => seq(ac, { dur: 0.12, gain: 0.08 }, [[480, 0, { to: 720 }], [640, 0.07, { to: 960 }]]),
      back: (ac) => seq(ac, { dur: 0.12, gain: 0.08 }, [[640, 0, { to: 520 }], [480, 0.07, { to: 380 }]]),
      copy: (ac) => seq(ac, { dur: 0.1, gain: 0.07 }, [[600, 0, { to: 900 }], [800, 0.06, { to: 1200 }], [1000, 0.12, { to: 1500 }]]),
      correct: (ac) => seq(ac, { dur: 0.18, gain: 0.08 }, [[N.C5, 0, { to: N.E5 }], [N.E5, 0.09, { to: N.G5 }], [N.G5, 0.18, { to: N.C6, dur: 0.35 }]]),
      wrong: (ac) => seq(ac, { dur: 0.22, gain: 0.08 }, [[N.E4, 0, { to: N.D4 }], [N.C4, 0.14, { to: N.A3, dur: 0.35 }]]),
    },
  },
  {
    id: "cristal",
    label: "Cristal",
    hint: "Campanitas claras",
    sounds: {
      tap: (ac) => note(ac, { freq: N.E6, dur: 0.18, gain: 0.035, partials: [[2.76, 0.2]] }),
      next: (ac) => seq(ac, { dur: 0.4, gain: 0.04, partials: [[2.76, 0.2]] }, [[N.A5, 0], [N.E6, 0.08]]),
      back: (ac) => seq(ac, { dur: 0.4, gain: 0.04, partials: [[2.76, 0.2]] }, [[N.E6, 0], [N.A5, 0.08]]),
      copy: (ac) => seq(ac, { dur: 0.45, gain: 0.035, partials: [[2.76, 0.2]] }, [[N.C6, 0], [N.E6, 0.06], [N.G6, 0.12]]),
      correct: (ac) =>
        seq(ac, { dur: 0.7, gain: 0.045, partials: [[2.76, 0.18]] }, [[N.C5 * 2, 0], [N.E5 * 2, 0.1], [N.G5 * 2, 0.2], [N.C6 * 2, 0.3, { dur: 1 }]]),
      wrong: (ac) => seq(ac, { dur: 0.6, gain: 0.045, partials: [[2.76, 0.15]] }, [[N.A5, 0], [N.F5, 0.16, { dur: 0.8 }]]),
    },
  },
  {
    id: "madera",
    label: "Madera",
    hint: "Marimba cálida",
    sounds: {
      tap: (ac) => note(ac, { freq: N.G4, dur: 0.12, attack: 0.005, gain: 0.1, partials: [[4, 0.25]] }),
      next: (ac) => seq(ac, { dur: 0.2, attack: 0.005, gain: 0.1, partials: [[4, 0.25]] }, [[N.C5, 0], [N.G5, 0.09]]),
      back: (ac) => seq(ac, { dur: 0.2, attack: 0.005, gain: 0.1, partials: [[4, 0.25]] }, [[N.G5, 0], [N.C5, 0.09]]),
      copy: (ac) => seq(ac, { dur: 0.2, attack: 0.005, gain: 0.09, partials: [[4, 0.25]] }, [[N.E5, 0], [N.G5, 0.07], [N.C6, 0.14]]),
      correct: (ac) =>
        seq(ac, { dur: 0.3, attack: 0.005, gain: 0.1, partials: [[4, 0.25]] }, [[N.C5, 0], [N.E5, 0.1], [N.G5, 0.2], [N.C6, 0.3, { dur: 0.6 }]]),
      wrong: (ac) => seq(ac, { dur: 0.35, attack: 0.005, gain: 0.1, partials: [[4, 0.2]] }, [[N.D4, 0], [N.A3, 0.15, { dur: 0.5 }]]),
    },
  },
  {
    id: "nube",
    label: "Nube",
    hint: "Muy suave y lento",
    sounds: {
      tap: (ac) => note(ac, { freq: N.A4, dur: 0.18, attack: 0.03, gain: 0.06 }),
      next: (ac) => seq(ac, { dur: 0.4, attack: 0.05, gain: 0.05 }, [[N.D5, 0], [N.A5, 0.1]]),
      back: (ac) => seq(ac, { dur: 0.4, attack: 0.05, gain: 0.05 }, [[N.A5, 0], [N.D5, 0.1]]),
      copy: (ac) => seq(ac, { dur: 0.45, attack: 0.04, gain: 0.045 }, [[N.D5, 0], [N.F5 * 1.06, 0.08], [N.A5, 0.16]]),
      // A soft chord that swells in.
      correct: (ac) => seq(ac, { dur: 1.1, attack: 0.15, gain: 0.04 }, [[N.C5, 0], [N.E5, 0.04], [N.G5, 0.08], [N.C6, 0.12]]),
      wrong: (ac) => seq(ac, { dur: 0.9, attack: 0.12, gain: 0.045 }, [[N.A4, 0], [N.C5, 0.03], [N.E4, 0.25, { dur: 0.9 }]]),
    },
  },
  {
    id: "kalimba",
    label: "Kalimba",
    hint: "Notas punteadas",
    sounds: {
      tap: (ac) => note(ac, { freq: N.D5, dur: 0.16, attack: 0.004, gain: 0.07, partials: [[5.4, 0.12]] }),
      next: (ac) => seq(ac, { dur: 0.3, attack: 0.004, gain: 0.07, partials: [[5.4, 0.12]] }, [[N.D5, 0], [N.A5, 0.08]]),
      back: (ac) => seq(ac, { dur: 0.3, attack: 0.004, gain: 0.07, partials: [[5.4, 0.12]] }, [[N.A5, 0], [N.D5, 0.08]]),
      copy: (ac) => seq(ac, { dur: 0.3, attack: 0.004, gain: 0.065, partials: [[5.4, 0.12]] }, [[N.D5, 0], [N.G5, 0.06], [N.B5, 0.12], [N.D6, 0.18]]),
      correct: (ac) =>
        seq(ac, { dur: 0.45, attack: 0.004, gain: 0.07, partials: [[5.4, 0.12]] }, [[N.G4, 0], [N.B4, 0.09], [N.D5, 0.18], [N.G5, 0.27, { dur: 0.8 }]]),
      wrong: (ac) => seq(ac, { dur: 0.5, attack: 0.004, gain: 0.07, partials: [[5.4, 0.1]] }, [[N.E5, 0], [N.C5, 0.13], [N.A4, 0.26, { dur: 0.7 }]]),
    },
  },
  {
    id: "gotas",
    label: "Gotas",
    hint: "Gotas de agua",
    sounds: {
      tap: (ac) => note(ac, { freq: 1400, to: 700, dur: 0.08, attack: 0.004, gain: 0.05 }),
      next: (ac) => seq(ac, { dur: 0.1, attack: 0.004, gain: 0.05 }, [[1100, 0, { to: 600 }], [1500, 0.08, { to: 800 }]]),
      back: (ac) => seq(ac, { dur: 0.1, attack: 0.004, gain: 0.05 }, [[1500, 0, { to: 800 }], [1000, 0.08, { to: 500 }]]),
      copy: (ac) => seq(ac, { dur: 0.09, attack: 0.004, gain: 0.045 }, [[1200, 0, { to: 650 }], [1500, 0.06, { to: 800 }], [1900, 0.12, { to: 1000 }]]),
      correct: (ac) =>
        seq(ac, { dur: 0.14, attack: 0.004, gain: 0.05 }, [[1000, 0, { to: 600 }], [1250, 0.09, { to: 750 }], [1500, 0.18, { to: 900 }], [2000, 0.27, { to: 1200, dur: 0.2 }]]),
      wrong: (ac) => seq(ac, { dur: 0.16, attack: 0.004, gain: 0.05 }, [[900, 0, { to: 500 }], [600, 0.14, { to: 300, dur: 0.25 }]]),
    },
  },
  {
    id: "piano",
    label: "Piano",
    hint: "Teclas suaves",
    sounds: {
      tap: (ac) => note(ac, { freq: N.C5, dur: 0.25, attack: 0.006, gain: 0.05, partials: [[2, 0.3], [3, 0.1]] }),
      next: (ac) => seq(ac, { dur: 0.45, attack: 0.006, gain: 0.05, partials: [[2, 0.3], [3, 0.1]] }, [[N.E5, 0], [N.A5, 0.1]]),
      back: (ac) => seq(ac, { dur: 0.45, attack: 0.006, gain: 0.05, partials: [[2, 0.3], [3, 0.1]] }, [[N.A5, 0], [N.E5, 0.1]]),
      copy: (ac) => seq(ac, { dur: 0.4, attack: 0.006, gain: 0.045, partials: [[2, 0.3]] }, [[N.C5, 0], [N.E5, 0.07], [N.G5, 0.14]]),
      correct: (ac) =>
        seq(ac, { dur: 0.6, attack: 0.006, gain: 0.05, partials: [[2, 0.3], [3, 0.1]] }, [[N.F4 * 2, 0], [N.A5, 0.12], [N.C6, 0.24], [N.F4 * 4, 0.36, { dur: 1.1 }]]),
      wrong: (ac) => seq(ac, { dur: 0.7, attack: 0.006, gain: 0.05, partials: [[2, 0.25]] }, [[N.E5, 0], [N.C5, 0.18], [N.A4, 0.36, { dur: 0.9 }]]),
    },
  },
  {
    id: "arpa",
    label: "Arpa",
    hint: "Cuerdas que brillan",
    sounds: {
      tap: (ac) => note(ac, { freq: N.G5, dur: 0.3, attack: 0.003, gain: 0.04, partials: [[2, 0.4], [3, 0.2], [4, 0.1]] }),
      next: (ac) => seq(ac, { dur: 0.5, attack: 0.003, gain: 0.04, partials: [[2, 0.4], [3, 0.2]] }, [[N.C5, 0], [N.E5, 0.05], [N.G5, 0.1]]),
      back: (ac) => seq(ac, { dur: 0.5, attack: 0.003, gain: 0.04, partials: [[2, 0.4], [3, 0.2]] }, [[N.G5, 0], [N.E5, 0.05], [N.C5, 0.1]]),
      copy: (ac) => seq(ac, { dur: 0.5, attack: 0.003, gain: 0.035, partials: [[2, 0.4], [3, 0.2]] }, [[N.G5, 0], [N.B5, 0.04], [N.D6, 0.08], [N.G6, 0.12]]),
      // A glissando up the scale.
      correct: (ac) =>
        seq(
          ac,
          { dur: 0.7, attack: 0.003, gain: 0.035, partials: [[2, 0.4], [3, 0.2]] },
          [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6, N.D6, N.E6].map((f, i) => [f, i * 0.045, i === 7 ? { dur: 1.2 } : undefined])
        ),
      wrong: (ac) =>
        seq(ac, { dur: 0.6, attack: 0.003, gain: 0.035, partials: [[2, 0.3]] }, [N.A5, N.F5, N.D5, N.A4].map((f, i) => [f, i * 0.07])),
    },
  },
  {
    id: "lofi",
    label: "Lofi",
    hint: "Cálido y apagado",
    sounds: {
      // Two voices slightly out of tune, low and warm.
      tap: (ac) => note(ac, { freq: N.E4, dur: 0.14, attack: 0.01, gain: 0.08, type: "triangle", partials: [[1.006, 0.7]] }),
      next: (ac) => seq(ac, { dur: 0.3, attack: 0.015, gain: 0.07, type: "triangle", partials: [[1.006, 0.7]] }, [[N.A4, 0], [N.E5, 0.11]]),
      back: (ac) => seq(ac, { dur: 0.3, attack: 0.015, gain: 0.07, type: "triangle", partials: [[1.006, 0.7]] }, [[N.E5, 0], [N.A4, 0.11]]),
      copy: (ac) => seq(ac, { dur: 0.3, attack: 0.012, gain: 0.065, type: "triangle", partials: [[1.006, 0.7]] }, [[N.A4, 0], [N.C5, 0.07], [N.E5, 0.14]]),
      // A soft seventh chord.
      correct: (ac) =>
        seq(ac, { dur: 0.9, attack: 0.03, gain: 0.05, type: "triangle", partials: [[1.006, 0.7]] }, [[N.F4, 0], [N.A4, 0.06], [N.C5, 0.12], [N.E5, 0.18]]),
      wrong: (ac) => seq(ac, { dur: 0.6, attack: 0.03, gain: 0.06, type: "triangle", partials: [[1.006, 0.7]] }, [[N.D4, 0], [N.F4, 0.04], [N.A3, 0.22, { dur: 0.7 }]]),
    },
  },
  {
    id: "retro",
    label: "Retro suave",
    hint: "8 bits, sin chirridos",
    sounds: {
      tap: (ac) => note(ac, { freq: N.C5, dur: 0.05, attack: 0.004, gain: 0.025, type: "square" }),
      next: (ac) => seq(ac, { dur: 0.07, attack: 0.004, gain: 0.025, type: "square" }, [[N.C5, 0], [N.G5, 0.06]]),
      back: (ac) => seq(ac, { dur: 0.07, attack: 0.004, gain: 0.025, type: "square" }, [[N.G5, 0], [N.C5, 0.06]]),
      copy: (ac) => seq(ac, { dur: 0.06, attack: 0.004, gain: 0.022, type: "square" }, [[N.E5, 0], [N.G5, 0.05], [N.C6, 0.1]]),
      correct: (ac) =>
        seq(ac, { dur: 0.09, attack: 0.004, gain: 0.025, type: "square" }, [[N.C5, 0], [N.E5, 0.07], [N.G5, 0.14], [N.C6, 0.21, { dur: 0.25 }]]),
      wrong: (ac) => seq(ac, { dur: 0.12, attack: 0.004, gain: 0.025, type: "square" }, [[N.E4, 0], [N.C4, 0.11, { dur: 0.25 }]]),
    },
  },
  // The four below go with the background music: an ocarina (Zelda), an electric piano with jazz chords (Persona), a
  // rubbery boing (Fall Guys) and synth sparkles (Celeste). Their melodies are original.
  {
    id: "ocarina",
    label: "Ocarina",
    hint: "Flauta de aventura",
    sounds: {
      tap: (ac) => note(ac, { freq: N.A5, dur: 0.12, attack: 0.02, gain: 0.05, partials: [[2, 0.08]] }),
      next: (ac) => seq(ac, { dur: 0.22, attack: 0.03, gain: 0.05, partials: [[2, 0.08]], vibrato: [5.5, 12] }, [[N.D5, 0], [N.A5, 0.12]]),
      back: (ac) => seq(ac, { dur: 0.22, attack: 0.03, gain: 0.05, partials: [[2, 0.08]], vibrato: [5.5, 12] }, [[N.A5, 0], [N.D5, 0.12]]),
      copy: (ac) => seq(ac, { dur: 0.16, attack: 0.02, gain: 0.045, partials: [[2, 0.08]] }, [[N.D5, 0], [N.Fs5, 0.08], [N.A5, 0.16], [N.D6, 0.24, { dur: 0.3 }]]),
      // A short phrase up the pentatonic scale, with a turn before the top note.
      correct: (ac) =>
        seq(ac, { dur: 0.16, attack: 0.025, gain: 0.05, partials: [[2, 0.08]], vibrato: [5.5, 10] }, [
          [N.D5, 0], [N.E5, 0.1], [N.G5, 0.2], [N.A5, 0.3], [N.G5, 0.4], [N.A5, 0.48], [N.D6, 0.58, { dur: 0.6 }],
        ]),
      wrong: (ac) => seq(ac, { dur: 0.3, attack: 0.03, gain: 0.05, partials: [[2, 0.08]], vibrato: [5, 15] }, [[N.E5, 0], [N.Eb5, 0.18], [N.D5, 0.36, { dur: 0.6 }]]),
    },
  },
  {
    id: "rhodes",
    label: "Piano eléctrico",
    hint: "Acordes de jazz",
    sounds: {
      // A soft electric piano: a warm tone with a bell-like overtone and a slow tremolo.
      tap: (ac) => note(ac, { freq: N.E5, dur: 0.22, attack: 0.008, gain: 0.05, partials: [[2, 0.25], [7, 0.04]] }),
      next: (ac) => seq(ac, { dur: 0.45, attack: 0.008, gain: 0.04, partials: [[2, 0.25], [7, 0.04]], vibrato: [4, 6] }, [[N.D5, 0], [N.F5, 0], [N.A5, 0], [N.C6, 0.09]]),
      back: (ac) => seq(ac, { dur: 0.45, attack: 0.008, gain: 0.04, partials: [[2, 0.25], [7, 0.04]], vibrato: [4, 6] }, [[N.C6, 0], [N.A5, 0], [N.F5, 0], [N.D5, 0.09]]),
      copy: (ac) => seq(ac, { dur: 0.35, attack: 0.008, gain: 0.04, partials: [[2, 0.25], [7, 0.04]] }, [[N.A5, 0], [N.C6, 0.07], [N.E6, 0.14]]),
      // A major-seven chord rolled up, then its ninth on top.
      correct: (ac) =>
        seq(ac, { dur: 1.1, attack: 0.008, gain: 0.035, partials: [[2, 0.25], [7, 0.04]], vibrato: [4, 6] }, [
          [N.F4, 0], [N.A4, 0.05], [N.C5, 0.1], [N.E5, 0.15], [N.G5, 0.3],
        ]),
      // A minor chord that slips down a half step.
      wrong: (ac) =>
        seq(ac, { dur: 0.8, attack: 0.008, gain: 0.035, partials: [[2, 0.25], [7, 0.04]], vibrato: [4, 6] }, [
          [N.A4, 0], [N.D5, 0], [N.F5, 0], [415, 0.25], [554, 0.25], [N.E5, 0.25],
        ]),
    },
  },
  {
    id: "boing",
    label: "Boing",
    hint: "Saltitos de goma",
    sounds: {
      tap: (ac) => note(ac, { freq: 300, to: 520, dur: 0.1, attack: 0.005, gain: 0.07, glide: 0.06 }),
      next: (ac) => seq(ac, { dur: 0.12, attack: 0.005, gain: 0.07, glide: 0.07 }, [[300, 0, { to: 560 }], [420, 0.1, { to: 800 }]]),
      back: (ac) => seq(ac, { dur: 0.14, attack: 0.005, gain: 0.07, glide: 0.1 }, [[700, 0, { to: 420 }], [500, 0.11, { to: 280 }]]),
      copy: (ac) => seq(ac, { dur: 0.1, attack: 0.005, gain: 0.06, glide: 0.05 }, [[400, 0, { to: 700 }], [500, 0.07, { to: 900 }], [650, 0.14, { to: 1150 }]]),
      // Three bounces, each higher.
      correct: (ac) =>
        seq(ac, { dur: 0.16, attack: 0.005, gain: 0.07, glide: 0.08 }, [[N.C5 * 0.6, 0, { to: N.C5 }], [N.E5 * 0.6, 0.13, { to: N.E5 }], [N.G5 * 0.6, 0.26, { to: N.G5 }], [N.C6 * 0.6, 0.39, { to: N.C6, dur: 0.35 }]]),
      // A spring that runs out of bounce.
      wrong: (ac) => seq(ac, { dur: 0.25, attack: 0.005, gain: 0.07, glide: 0.25 }, [[500, 0, { to: 300 }], [380, 0.2, { to: 160, dur: 0.4 }]]),
    },
  },
  {
    id: "brillos",
    label: "Brillos",
    hint: "Destellos de sintetizador",
    sounds: {
      tap: (ac) => note(ac, { freq: N.B5, dur: 0.12, attack: 0.004, gain: 0.03, type: "triangle", partials: [[4, 0.15]] }),
      next: (ac) => seq(ac, { dur: 0.25, attack: 0.004, gain: 0.03, type: "triangle", partials: [[4, 0.15]] }, [[N.E5, 0], [N.B5, 0.06], [N.E6, 0.12]]),
      back: (ac) => seq(ac, { dur: 0.25, attack: 0.004, gain: 0.03, type: "triangle", partials: [[4, 0.15]] }, [[N.E6, 0], [N.B5, 0.06], [N.E5, 0.12]]),
      copy: (ac) => seq(ac, { dur: 0.2, attack: 0.004, gain: 0.028, type: "triangle", partials: [[4, 0.15]] }, [[N.B5, 0], [N.E6, 0.04], [N.G6, 0.08], [N.A6, 0.12]]),
      // A fast shimmer up two octaves.
      correct: (ac) =>
        seq(
          ac,
          { dur: 0.4, attack: 0.004, gain: 0.026, type: "triangle", partials: [[4, 0.12]] },
          [N.E5, N.G5, N.B5, N.D6, N.E6, N.G6, N.A6].map((f, i) => [f, i * 0.04, i === 6 ? { dur: 0.9 } : undefined])
        ),
      wrong: (ac) => seq(ac, { dur: 0.35, attack: 0.004, gain: 0.03, type: "triangle", partials: [[4, 0.1]] }, [[N.B5, 0], [N.G5, 0.09], [N.E5, 0.18], [N.B4, 0.27, { dur: 0.5 }]]),
    },
  },
];

let packId = load(PACK_KEY, SOUND_PACKS[0].id);
const currentPack = () => SOUND_PACKS.find((p) => p.id === packId) || SOUND_PACKS[0];

export function soundPack() {
  return currentPack().id;
}

/** Chooses a set and lets it be heard (a step forward and a right answer). */
export function setSoundPack(id) {
  if (!SOUND_PACKS.some((p) => p.id === id)) return;
  packId = id;
  save(PACK_KEY, id);
  for (const fn of listeners) fn();
  play("next");
  setTimeout(() => play("correct"), 350);
}

export function play(name) {
  lastPlayed = performance.now();
  const sound = currentPack().sounds[name];
  if (!enabled || !volume || !sound) return;
  const ac = audio();
  if (!ac) return;
  try {
    sound(ac);
  } catch {
    // A sound that fails is no reason to break the click.
  }
}

const CLICKABLE = "button, a[href], [role='button'], [role='tab'], [role='option'], label";

// What a click on `el` sounds like: its `data-sound`, "back" for the ways back, "next" for the big buttons and the game
// tiles, and "tap" for the rest.
function soundFor(el) {
  const own = el.closest("[data-sound]")?.dataset.sound;
  if (own) return own === "none" ? null : own;
  if (el.matches(".tv-chip--leave, .tv-roomhead-leave")) return "back";
  if (el.matches(".tv-btn, .tv-mode")) return "next";
  return "tap";
}

export function installClickSounds() {
  // The sound is chosen while the click goes down (capture, before React's handlers): a handler may disable its
  // button ("Creando sala…") or take it off the screen, and it still sounds. It plays while the click comes back up
  // (after the handlers), unless a handler already played its own. The short wait also keeps a label's click, which
  // the browser repeats on its input, to one sound.
  let pending = null;
  function onCapture(e) {
    pending = null;
    if (performance.now() - lastPlayed < 80) return;
    const el = e.target.closest?.(CLICKABLE);
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return;
    const name = soundFor(el);
    if (name) pending = { name, before: lastPlayed };
  }
  function onBubble() {
    const sound = pending;
    pending = null;
    if (sound && lastPlayed === sound.before) play(sound.name);
  }
  document.addEventListener("click", onCapture, true);
  document.addEventListener("click", onBubble);
  return () => {
    document.removeEventListener("click", onCapture, true);
    document.removeEventListener("click", onBubble);
  };
}
