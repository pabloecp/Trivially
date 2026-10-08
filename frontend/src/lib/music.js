// The background music: calm songs from the soundtracks of well-known games, films and series, one per option (GET
// /api/music/background; Zelda's Lullaby until another is chosen). The chosen song's 30 s preview plays on a loop,
// crossfading into itself (an option with several songs would shuffle them). It is quiet and
// softened (a gentle low-pass filter), so it sits under the game; it fades in and out instead of starting or stopping
// at once. Browsers only let audio start after the person touches the page, so it waits for the first tap or key. It
// is lower during a match (`setMusicDucked`), and silent where the game has its own audio (Adivina la canción,
// `setMusicMuted`) or while the tab is hidden. Whether it is on, its volume and the option are kept in localStorage.
import { BACKEND_URL } from "./config.js";

const MUSIC_KEY = "trivially_music";
const OPTION_KEY = "trivially_music_option";
const VOLUME_KEY = "trivially_music_volume";
// The loudest the music gets (slider at 100); the slider starts at 50. During a match it plays at 40 % of that.
const MAX_GAIN = 0.066;
const DUCKED = 0.4;
const FADE_MS = 1200;
// How long before a preview ends the next one starts, crossfading.
const CROSSFADE_S = 3;

let options = null; // the options, once downloaded
let loading = null;
let songs = []; // the chosen option's songs
let order = [];
let current = null; // { audio, gain, song } playing now
let ac = null;
let bus = null; // where every song goes: the soft filter in front of the speakers
let unlocked = false;
let ducked = false;
let muted = false;
let hidden = false;
let playing = false;
const listeners = new Set();

function load(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not saved: it lasts until the page reloads.
  }
}

let enabled = load(MUSIC_KEY) !== "off";
let volume = Math.min(100, Math.max(0, Number(load(VOLUME_KEY) ?? 50) || 0));
let optionId = load(OPTION_KEY);

const notify = () => listeners.forEach((fn) => fn());

export function musicEnabled() {
  return enabled;
}

/** The song playing now ({ title, artistName }), or null. */
export function currentSong() {
  return playing && current ? current.song : null;
}

/** Called when the music is turned on or off, or another song starts. */
export function onMusicChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setMusicEnabled(on) {
  enabled = Boolean(on);
  save(MUSIC_KEY, enabled ? "on" : "off");
  notify();
  update();
}

/** The options ({ id, label, hint, songs }), downloaded once. */
export function loadMusicOptions() {
  if (options) return Promise.resolve(options);
  if (!loading) {
    loading = fetch(`${BACKEND_URL}/api/music/background`, { cache: "no-cache" }) // never an old copy of the list
      .then((res) => (res.ok ? res.json() : { options: [] }))
      .then((data) => data.options || [])
      .catch(() => [])
      .then((list) => {
        options = list;
        if (!options.length) loading = null; // tried again next time
        pickSongs();
        return options;
      });
  }
  return loading;
}

// The chosen option, or the first one (the default) until another is chosen.
const chosen = () => options?.find((o) => o.id === optionId) || options?.[0];

/** The chosen option's id. */
export function musicOption() {
  return chosen()?.id || optionId;
}

function pickSongs() {
  const option = chosen();
  songs = option?.songs || [];
  order = [];
}

/** Chooses another option: its music starts at once (turning the music on if it was off). */
export function setMusicOption(id) {
  optionId = id;
  save(OPTION_KEY, id);
  pickSongs();
  if (!enabled) {
    enabled = true;
    save(MUSIC_KEY, "on");
  }
  notify();
  if (playing && current) playNext();
  else update();
}

/** Lower while a match is played. */
export function setMusicDucked(on) {
  if (ducked === Boolean(on)) return;
  ducked = Boolean(on);
  update();
}

/** Silent for a while (a game with its own audio), whatever the person chose. */
export function setMusicMuted(on) {
  if (muted === Boolean(on)) return;
  muted = Boolean(on);
  update();
}

const level = () => ((MAX_GAIN * volume) / 100) * (ducked ? DUCKED : 1);

/** The music's volume, 0 to 100. */
export function musicVolume() {
  return volume;
}

/** Sets the music's volume (0 to 100); what is playing follows at once. */
export function setMusicVolume(value) {
  volume = Math.min(100, Math.max(0, Math.round(Number(value)) || 0));
  save(VOLUME_KEY, String(volume));
  if (playing && current) ramp(current.gain, level(), 120);
  notify();
}

function context() {
  if (!ac) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ac = new Ctx();
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 5000;
    filter.Q.value = 0.3;
    filter.connect(ac.destination);
    bus = filter;
  }
  if (ac.state === "suspended") ac.resume().catch(() => {});
  return ac;
}

// Moves a song's volume to `to` over `ms`.
function ramp(gain, to, ms = FADE_MS) {
  const now = ac.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(to, now + ms / 1000);
}

// The next song: the option's list shuffled, and shuffled again each time it runs out (never the same song twice
// in a row).
function nextSong() {
  if (!order.length) {
    const last = current?.song;
    order = [...songs].sort(() => Math.random() - 0.5);
    if (order.length > 1 && order[0] === last) order.push(order.shift());
  }
  return order.shift();
}

function stopSong(song) {
  ramp(song.gain, 0);
  setTimeout(() => {
    song.audio.pause();
    song.audio.removeAttribute("src");
  }, FADE_MS + 100);
}

// Starts the next song, fading it in, and fades out the one that was playing.
function playNext() {
  if (!songs.length) return;
  const song = nextSong();
  const audio = new Audio();
  audio.crossOrigin = "anonymous"; // the proxy allows it, and the filter needs it
  audio.src = `${BACKEND_URL}/api/audio/proxy?url=${encodeURIComponent(song.previewUrl)}`;
  const gain = ac.createGain();
  gain.gain.value = 0;
  ac.createMediaElementSource(audio).connect(gain).connect(bus);

  const old = current;
  current = { audio, gain, song };
  if (old) stopSong(old);
  notify();

  let handedOver = false;
  const handOver = () => {
    if (handedOver || current?.audio !== audio || !playing) return;
    handedOver = true;
    playNext();
  };
  audio.addEventListener("timeupdate", () => {
    if (audio.duration && audio.duration - audio.currentTime < CROSSFADE_S) handOver();
  });
  audio.addEventListener("ended", handOver);
  // A preview that fails to load is skipped (after a moment, so a dead list doesn't spin).
  audio.addEventListener("error", () => setTimeout(handOver, 1500));
  audio.play().then(() => ramp(gain, level()), () => {});
}

async function update() {
  if (!unlocked) return;
  if (!enabled || muted || hidden) {
    if (playing && current) {
      const paused = current;
      ramp(paused.gain, 0);
      setTimeout(() => {
        if (!playing && current === paused) paused.audio.pause();
      }, FADE_MS + 100);
    }
    playing = false;
    notify();
    return;
  }
  context();
  if (playing && current) {
    ramp(current.gain, level());
    return;
  }
  playing = true;
  if (current) {
    // Back from a pause: the same song carries on where it was.
    const resumed = current;
    resumed.audio.play().then(() => ramp(resumed.gain, level()), () => {});
    notify();
    return;
  }
  await loadMusicOptions();
  if (playing && !current) playNext();
}

/** Starts the music on the page's first tap or key (browsers block it before that). */
export function installMusic() {
  // The events browsers accept as the person's go-ahead for audio.
  const events = ["click", "touchend", "keydown"];
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    for (const name of events) window.removeEventListener(name, unlock, true);
    update();
  }
  // Silent while the tab is hidden.
  const onVisibility = () => {
    hidden = document.hidden;
    update();
  };
  for (const name of events) window.addEventListener(name, unlock, true);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    for (const name of events) window.removeEventListener(name, unlock, true);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
