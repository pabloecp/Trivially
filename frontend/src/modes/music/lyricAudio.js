import { subscribeVolume, volumeOf } from "../../lib/volume.js";

// Completa la letra's song, played with Web Audio instead of an <audio> element: an <audio> only says where it is a few
// times a second, so a cut could slip by a fraction of a second and let the start of the answer be heard. Here the
// song is decoded whole and played from an exact second to an exact second (to the sample): it stops at the cut and
// nothing of it is heard after that until the reveal. It fades over FADE_S at the end so nothing clicks. It plays at
// the songs' volume (lib/volume.js, like the other songs: base 0.8).

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

  // The song's [from, to] seconds, starting at `at` (ctx time).
  function stretch(buffer, at, from, to) {
    const length = to - from;
    const fade = ctx.createGain();
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(fade).connect(master);
    fade.gain.setValueAtTime(1, at);
    if (length > 2 * FADE_S) {
      fade.gain.setValueAtTime(1, at + length - FADE_S);
      fade.gain.linearRampToValueAtTime(0, at + length);
    }
    node.start(at, from, length);
    return node;
  }

  /**
   * Plays `url` from `from()` seconds (asked once the song is ready: the round's clock went on meanwhile) until `until`
   * seconds (the end of the song with null). Calls `onEnd` when it ends.
   */
  async function play(url, from, until = null, onEnd = null) {
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
    const end = Math.min(buffer.duration, until ?? buffer.duration);
    if (end - start <= 0.01) {
      onEnd?.();
      return;
    }
    const at = ctx.currentTime + 0.02;
    const node = stretch(buffer, at, start, end);
    sources = [node];
    node.onended = () => {
      if (sources.includes(node)) {
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
    /** Where the song is now (seconds of it), or null when it isn't playing. */
    position: () => (sources.length && ctx ? startedFrom + Math.max(0, ctx.currentTime - startedAt) : null),
    /** Browsers start sound only after a tap: called on any tap or key. */
    unlock: () => ctx?.state === "suspended" && ctx.resume().catch(() => {}),
  };
}
