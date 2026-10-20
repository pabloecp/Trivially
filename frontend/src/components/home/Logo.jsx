import { useLayoutEffect, useRef } from "react";
import AppIcon from "./AppIcon.jsx";
import Wordmark from "./Wordmark.jsx";

// The logo jumps from one screen's place to the other's: it crouches (`crouchLogo`, on the screen that goes), then a
// spring carries it in an arc to its new place, shrinking or growing on the way: it starts slowly, goes a little past
// and comes back, with no change of speed all at once. As it lands, its tile shakes and a ripple runs through the letters.
export const CROUCH_MS = 240;
// How flat it crouches: [width, height]. The new logo starts that way and straightens up in UNCROUCH_MS.
const CROUCH = [1.07, 0.88];
const UNCROUCH_MS = 300;
// The spring: under 1, it goes a little past its place (DAMPING 0.68: about 7 %); how fast it gets there (rad/s).
const DAMPING = 0.68;
const STIFFNESS = 5.6;
// Long enough for the spring to settle; the jump is drawn as one keyframe per frame of it, so its speed is the spring's.
const JUMP_MS = 1300;
const FRAMES = 78;
// The new screen's first frames are slow to draw, and a jump started meanwhile would skip its start: it waits, still
// in its first pose, for frames that come in time (CALM_FRAMES in a row, each within CALM_MS), at most MAX_WAIT frames.
const CALM_FRAMES = 2;
const CALM_MS = 40;
const MAX_WAIT = 12;
// When it counts as landed (how much of the way), for the tile's shake and the letters' ripple.
const LANDED = 0.97;
// A logo left longer ago than this belongs to another visit: the next screen's comes in its own way.
const FRESH_MS = 1000;

// The logo on screen, and where the last one was when its screen went (`leaveLogo`): the jump to make, kept until it
// has landed (`started`: when it took off), so a logo mounted again on the way (React mounts everything twice in
// development, and does it a frame later) goes on with the same jump instead of showing up already landed.
let shown = null;
let left = null;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The logo's own animations (the tile bobbing, the dots hopping, the letters coming in), each by the element it moves
// and its name: every logo has the same elements, so another one can take them up where they were.
function animationsOf(el) {
  const parts = [...el.querySelectorAll("*")];
  return el
    .getAnimations({ subtree: true })
    .filter((a) => a.animationName && a.effect?.target && a.effect.target !== el)
    .map((a) => [`${parts.indexOf(a.effect.target)}:${a.animationName}`, a]);
}

const finite = (a) => a.effect.getComputedTiming().iterations !== Infinity;

// The logo on screen gets ready to jump: it squashes down on its base (the logo's transform-origin, home.css), `delay`
// ms from now, to be crouched when its screen goes. From however it is right then (still jumping in, if it is), so it
// never snaps. Returns the animation, for the screen to undo it if it stays.
export function crouchLogo(delay = 0) {
  if (!shown || reducedMotion()) return null;
  const [w, h] = CROUCH;
  return shown.animate([{ transform: `scale(${w}, ${h})` }], {
    duration: CROUCH_MS,
    delay,
    easing: "cubic-bezier(0.45, 0, 0.55, 1)",
    fill: "forwards",
  });
}

// Called by the screen that goes (Inicio's "Jugar", /jugar going back to Inicio) while its logo is still there: where
// it is (its box without the crouch) and how crouched, and where its animations were.
export function leaveLogo() {
  const rect = shown?.getBoundingClientRect();
  if (!rect?.width) return;
  // A crouch only scales, from the middle of the base.
  const m = getComputedStyle(shown).transform.match(/matrix\(([^,]+),[^,]+,[^,]+,([^,]+)/);
  const [sx, sy] = m ? [Number(m[1]), Number(m[2])] : [1, 1];
  const width = rect.width / sx;
  const height = rect.height / sy;
  left = {
    box: { x: rect.left + rect.width / 2, bottom: rect.bottom, width, height },
    pose: [sx, sy],
    times: new Map(animationsOf(shown).map(([key, a]) => [key, a.currentTime])),
    at: performance.now(),
    started: null,
  };
}

// The jump still to make or under way: not taken off yet but recent, or in the air.
function fresh() {
  if (!left) return null;
  const now = performance.now();
  return (left.started == null ? now - left.at < FRESH_MS : now - left.started < JUMP_MS) ? left : null;
}
// Whether the logo about to show comes jumping from the other screen's (for the screen to time its panels).
export const logoIncoming = () => Boolean(fresh()) && !reducedMotion();

// How much of the way the spring has gone at `t` seconds, from rest: 0, slowly at first, a little past 1, then 1.
function spring(t) {
  const decay = DAMPING * STIFFNESS;
  const wave = STIFFNESS * Math.sqrt(1 - DAMPING * DAMPING);
  return 1 - Math.exp(-decay * t) * (Math.cos(wave * t) + (decay / wave) * Math.sin(wave * t));
}
// 0 → 1 with no speed at either end.
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : (1 - Math.cos(Math.PI * u)) / 2);

// The jump, one keyframe per frame, of the new logo from where the old one was (its box, `from`, and crouch, `pose`) to
// its own place (`to`): moved and scaled around the middle of its base along the spring, lifted in an arc and tilted on
// the way (both come back a little past zero as the spring goes past its place: a small dip and lean as it lands).
// Returns the keyframes and when it lands (ms).
function jump(from, pose, to, tilt) {
  const dx = from.x - (to.left + to.width / 2);
  const dy = from.bottom - to.bottom;
  const s = from.width / to.width;
  // How high it goes over the straight way from one place to the other.
  const hop = Math.max(28, Math.min(from.height, to.height) * 0.24);
  const frames = [];
  let landAt = JUMP_MS;
  for (let i = 0; i <= FRAMES; i++) {
    const ms = (i / FRAMES) * JUMP_MS;
    const done = spring(ms / 1000);
    if (done >= LANDED && landAt === JUMP_MS) landAt = ms;
    const ahead = 1 - done;
    const size = 1 + (s - 1) * ahead;
    const crouched = 1 - ease(ms / UNCROUCH_MS);
    const w = size * (1 + (pose[0] - 1) * crouched);
    const h = size * (1 + (pose[1] - 1) * crouched);
    const arc = Math.sin(Math.PI * done);
    frames.push({ transform: `translate(${dx * ahead}px, ${dy * ahead - hop * arc}px) rotate(${tilt * arc}deg) scale(${w}, ${h})` });
  }
  frames[FRAMES] = { transform: "none" };
  return { frames, landAt };
}

// The logo with its name under it: Inicio's big one, and the smaller one over /jugar's options. They are the same logo
// in two places, so going from one screen to the other it jumps: the new one starts where the old one was, as big and
// as crouched, and leaps into its own place, its tile and dots going on from where they were. Without a logo to come
// from it's just there (`quiet`: without the letters' way in, for a screen whose panels come in on their own).
// `tilt`: which way it leans in the air.
export default function Logo({ className = "", quiet = false, decorative = false, tilt = -6 }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    shown = el;
    const from = reducedMotion() ? null : fresh();
    // Its own way in (the panels') gives way to the jump, before its place is measured: it moves it.
    if (from) el.getAnimations().forEach((a) => a.animationName && a.cancel());
    const to = el.getBoundingClientRect();
    if (!from || !to.width) {
      if (quiet) animationsOf(el).forEach(([, a]) => finite(a) && a.finish());
      return () => shown === el && (shown = null);
    }
    const elapsed = performance.now() - from.at;
    for (const [key, a] of animationsOf(el)) {
      const t = from.times.get(key);
      if (t != null) a.currentTime = t + elapsed;
      // Over on the other logo already.
      else if (finite(a)) a.finish();
    }
    const { frames, landAt } = jump(from.box, from.pose, to, tilt);
    const moves = [
      el.animate(frames, { duration: JUMP_MS }),
      // Landing: the tile gives a little shake, and a ripple runs through the letters (dots and all).
      el.querySelector(".tv-appicon")?.animate(
        [{ rotate: "0deg" }, { rotate: `${-tilt}deg` }, { rotate: `${tilt * 0.6}deg` }, { rotate: `${-tilt * 0.25}deg` }, { rotate: "0deg" }],
        { duration: 600, delay: landAt - 60, easing: "ease-in-out" }
      ),
      ...[...el.querySelectorAll(".tv-letter")].map((letter, i) =>
        letter.animate([{ translate: "0 0" }, { translate: "0 -0.13em", offset: 0.45 }, { translate: "0 0" }], {
          duration: 520,
          delay: landAt + i * 40,
          easing: "ease-in-out",
        })
      ),
    ].filter(Boolean);
    // Done once it has landed: the next logo to show comes in its own way.
    moves[0].finished.then(() => left === from && (left = null), () => {});
    // Held in its first pose (where the old logo was) until the page draws smoothly, then all of it starts together;
    // mounted again in the air, it goes on from where the jump is.
    moves.forEach((a) => a.pause());
    const takeOff = () => {
      from.started ??= performance.now();
      const t = performance.now() - from.started;
      moves.forEach((a) => {
        a.currentTime = t;
        a.play();
      });
    };
    let frame = 0;
    let last = 0;
    let calm = 0;
    let waited = 0;
    const wait = (now) => {
      calm = last && now - last < CALM_MS ? calm + 1 : 0;
      last = now;
      waited += 1;
      if (calm >= CALM_FRAMES || waited >= MAX_WAIT) takeOff();
      else frame = requestAnimationFrame(wait);
    };
    if (from.started != null) takeOff();
    else frame = requestAnimationFrame(wait);
    return () => {
      cancelAnimationFrame(frame);
      moves.forEach((a) => a.cancel());
      if (shown === el) shown = null;
    };
  }, []);

  return (
    <div ref={ref} className={`tv-logo ${className}`} aria-hidden={decorative || undefined}>
      <AppIcon edge />
      <Wordmark />
    </div>
  );
}
