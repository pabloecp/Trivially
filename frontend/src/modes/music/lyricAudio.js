import { subscribeVolume, volumeOf } from "../../lib/volume.js";

// Completa la letra's song, played with Web Audio instead of an <audio> element: an <audio> only says where it is a few
// times a second, so a cut could slip by a fraction of a second and let the start of the answer be heard. Here the
// song is decoded whole and played in stretches of it, each from an exact second to an exact second (to the sample),
// on the song's own timeline: "to the cut, then from `back` to `stop`" goes quiet exactly while the answer is sung
// and comes back with the next word. Each stretch fades over FADE_S at its edges so nothing clicks. It plays at the
// songs' volume (lib/volume.js, like the other songs: base 0.8).

const FADE_S = 0.03;
const BASE_VOLUME = 0.8;

export function createLyricPlayer() {
  let ctx = null;
  let master = null;
  let sources = [];
  let startedAt = 0;
  let startedFrom = 0;
  let token = 0;
  const buffers = new Map();

  function context() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.connect(ctx.destination);
      const setVolume = () => master.gain.setValueAtTime(volumeOf(BASE_VOLUME), ctx.currentTime);
      setVolume();
      subscribeVolume(setVolume);
    }
    return ctx;
  }

  /** The song decoded, downloaded once (during the countdown, so it's ready when the round starts). */
  function load(url) {
    if (!buffers.has(url)) {
      const job = fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`Respuesta ${res.status}`);
          return res.arrayBuffer();
        })
        .then((data) => context().decodeAudioData(data));
      job.catch(() => buffers.delete(url));
      buffers.set(url, job);
      // Only the last few songs are kept.
      while (buffers.size > 4) buffers.delete(buffers.keys().next().value);
    }
    return buffers.get(url);
  }

  function stop() {
    token += 1;
    for (const node of sources) {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
    }
    sources = [];
  }

  // One stretch of the song, [from, to] seconds of it, starting `delay` seconds after `at` (ctx time).
  function stretch(buffer, at, from, to, fadeIn) {
    const length = to - from;
    const fade = ctx.createGain();
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(fade).connect(master);
    fade.gain.setValueAtTime(fadeIn && length > 2 * FADE_S ? 0 : 1, at);
    if (fadeIn && length > 2 * FADE_S) fade.gain.linearRampToValueAtTime(1, at + FADE_S);
    if (length > 2 * FADE_S) {
      fade.gain.setValueAtTime(1, at + length - FADE_S);
      fade.gain.linearRampToValueAtTime(0, at + length);
    }
    node.start(at, from, length);
    return node;
  }

  /**
   * Plays `url` from `from()` seconds (asked once the song is ready: the round's clock went on meanwhile) until `until`
   * seconds (the end of the song with null); with `then` ({ back, stop }), quiet from `until` to `back` and playing
   * again from `back` to `stop`, on the song's timeline. Calls `onEnd` when the last stretch ends.
   */
  async function play(url, from, until = null, onEnd = null, then = null) {
    stop();
    const mine = token;
    let buffer;
    try {
      buffer = await load(url);
      if (context().state === "suspended") await ctx.resume();
    } catch {
      return;
    }
    if (mine !== token) return;
    const start = Math.max(0, from());
    const parts = [[start, Math.min(buffer.duration, until ?? buffer.duration)]];
    if (then && then.stop > then.back) parts.push([Math.max(start, then.back), Math.min(buffer.duration, then.stop)]);
    const playable = parts.filter(([a, b]) => b - a > 0.01);
    if (!playable.length) {
      onEnd?.();
      return;
    }
    const at = ctx.currentTime + 0.02;
    sources = playable.map(([a, b], i) => stretch(buffer, at + (a - start), a, b, i > 0 || a > start));
    const last = sources.at(-1);
    last.onended = () => {
      if (sources.includes(last)) {
        sources = [];
        onEnd?.();
      }
    };
    startedAt = at;
    startedFrom = start;
  }

  return {
    load,
    play,
    stop,
    /** Where the song is now (seconds of it, quiet stretches included), or null when it isn't playing. */
    position: () => (sources.length && ctx ? startedFrom + Math.max(0, ctx.currentTime - startedAt) : null),
    /** Browsers start sound only after a tap: called on any tap or key. */
    unlock: () => ctx?.state === "suspended" && ctx.resume().catch(() => {}),
  };
}
