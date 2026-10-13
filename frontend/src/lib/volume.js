import { useEffect, useSyncExternalStore } from "react";

// The volume of the songs (and of any other sound played through an <audio> element, which is not the Web Audio
// effects of lib/sounds.js: those have their own volume). Nothing plays at its own full level: each sound declares how
// loud it is on its own (`base`, 0–1) and goes through `volumeOf()`, so the "Canciones" slider of the volume menu
// (VolumeMenu.jsx) moves all of them together.
//
// To add a sound:
//  - an <audio> element: `useMasterVolume(ref, base)` keeps its volume in step with the slider;
//  - anything else (`new Audio()`): set `audio.volume = volumeOf(base)` when it plays, and if it lasts long enough to
//    be adjusted while it sounds, `subscribeVolume(() => ...)` to be told of changes.

// Saved in this browser, so the level survives reloads and is shared between tabs.
const KEY = "trivially_volume";

const DEFAULT_STATE = { level: 1, muted: false };
// Where the slider goes when a sound is turned back on from a level of zero.
const RESTORED_LEVEL = 0.5;

function clamp(n) {
  return Math.min(1, Math.max(0, n));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved.level === "number") {
      return { level: clamp(saved.level), muted: saved.muted === true };
    }
  } catch {
    // Nothing saved, or storage blocked: the default.
  }
  return DEFAULT_STATE;
}

// A new object on every change, which is what `useSyncExternalStore` compares.
let state = load();
const listeners = new Set();

function update(next) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: it works for this visit only.
  }
  for (const fn of listeners) fn();
}

export function subscribeVolume(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Another tab moved the button.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    state = load();
    for (const fn of listeners) fn();
  });
}

// 0–1, as the slider shows it. Moving it turns the sound back on.
export function setVolume(level) {
  update({ level: clamp(level), muted: false });
}

// The speaker button: off keeps the level to come back to (a slider left at zero comes back at half).
export function toggleMute() {
  if (!state.muted) update({ ...state, muted: true });
  else update({ level: state.level > 0 ? state.level : RESTORED_LEVEL, muted: false });
}

// How loud a sound whose own level is `base` (0–1) should be right now. The slider is squared: ears hear loudness
// on a curve, so a straight slider would change everything in its first few notches and nothing after that.
export function volumeOf(base = 1) {
  return state.muted ? 0 : clamp(base * state.level * state.level);
}

// { level, muted, shown }: `shown` is what the slider reads, 0 while muted.
export function useVolume() {
  const current = useSyncExternalStore(subscribeVolume, () => state);
  return { level: current.level, muted: current.muted, shown: current.muted ? 0 : current.level };
}

// Keeps an <audio> element at `base` times the master volume. It runs after every render on purpose: the element can
// show up after the first one (the game screen has none while it connects), and this is a single assignment.
export function useMasterVolume(ref, base = 1) {
  useVolume();
  useEffect(() => {
    if (ref.current) ref.current.volume = volumeOf(base);
  });
}
