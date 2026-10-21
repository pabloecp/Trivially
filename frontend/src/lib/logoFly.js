import { useSyncExternalStore } from "react";

// The big logo of Inicio flies to the top bar's small one when an option is picked (and back when it is left): a copy of
// the big logo travels over the page, its tile landing on the small tile, while the top bar's own logo stays out of
// sight (`mode`):
//  - "in": the way into an option; the bar's logo is hidden, though Inicio is already left; then "in-tile": its tile
//    shows, under the copy's, as the copy is about to land (no letters yet); then null: all of it, the letters last;
//  - "out": the way back to Inicio; the bar's tile stays until the copy is on its way, though Inicio hides it, but its
//    letters melt away at once (the big ones come in later: letters that stay on their own look stuck); then null: gone;
//  - null: the bar's logo is where the page says (hidden on Inicio, shown anywhere else).
let mode = null;
let safety = 0;
const listeners = new Set();

export function holdBrand(next) {
  clearTimeout(safety);
  if (next) safety = setTimeout(() => holdBrand(null), 2000);
  if (next === mode) return;
  mode = next;
  listeners.forEach((fn) => fn());
}

// Where the bar's small logo is (its tile) right now: kept by the screen that is about to change the bar ("Volver" is
// about to shrink away and the logo with it slides left), so the flight back starts from where the logo was seen.
let remembered = null;
export function rememberBrand() {
  const tile = document.querySelector(".tv-brand .tv-appicon")?.getBoundingClientRect();
  remembered = tile?.width ? { left: tile.left, top: tile.top, width: tile.width, height: tile.height } : null;
}

export function useBrandHold() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => mode
  );
}

const FLY_MS = 950;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The big logo as it was when it last flew in (a copy of it, where it was and how big, in a window of this size), so the
// flight back can start the moment "Volver" is pressed instead of waiting for Inicio to be on screen again.
let memory = null;
// A flight back that already took off, and the big logo it will land on (hidden until it has).
let flying = false;
let landing = null;
let earlyAt = -Infinity;

// The copy of a logo that flies: the same logo, over the page, with a clip of its own (the tile's clip is found by an id,
// which the copy would share with the original: once that one is hidden or gone the copy's coloured frame is clipped
// away and the tile turns black).
function copyOf(logo) {
  const ghost = logo.cloneNode(true);
  ghost.classList.add("is-ghost");
  ghost.style.visibility = "";
  ghost.querySelectorAll("clipPath[id]").forEach((clip) => {
    const old = clip.id.replace(/-fly$/, "");
    clip.id = `${old}-fly`;
    ghost.querySelectorAll(`[clip-path="url(#${old})"], [clip-path="url(#${old}-fly)"]`).forEach((el) => el.setAttribute("clip-path", `url(#${old}-fly)`));
  });
  return ghost;
}

const rectOf = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height });
const sameWindow = (m) => m && m.w === window.innerWidth && m.h === window.innerHeight;

/**
 * Flies the logo, `dir` "in" (from the middle of Inicio to the top bar) or "out" (back). Releases the top bar's logo when
 * done, or at once when there is nothing to fly (no big logo on screen, reduced motion).
 * `early` (out): called as "Volver" is pressed, with the big logo not on screen yet: flies from the remembered copy to
 * where it was; returns whether it took off (if not, call again without it once Inicio is there).
 */
export function flyLogo(dir, { early = false } = {}) {
  const big = document.querySelector(".tv-logo.tv-play-logo");
  const brand = document.querySelector(".tv-brand");
  const host = document.querySelector(".tv-app");
  if (reducedMotion() || !brand || !host) {
    holdBrand(null);
    return false;
  }
  // Out, once it has taken off early: the big logo that comes on screen later is the flight's landing, hidden until then.
  if (dir === "out" && !early && (flying || performance.now() - earlyAt < 1500)) {
    if (flying && big) {
      big.style.animation = "none";
      big.style.visibility = "hidden";
      landing = big;
    }
    return true;
  }
  let copy;
  let box;
  let tile;
  // Out: from where the bar's logo was when "Volver" was pressed; in: to where it is now ("Volver" has already taken
  // its place beside it, see .is-back-fly).
  let target;
  if (early) {
    if (!sameWindow(memory) || !remembered) return false;
    copy = copyOf(memory.node);
    ({ box, tile } = memory);
    target = remembered;
  } else {
    if (!big) {
      holdBrand(null);
      return false;
    }
    // Without its own way in (it would be moving while it is measured).
    big.style.animation = "none";
    box = rectOf(big.getBoundingClientRect());
    tile = rectOf(big.querySelector(".tv-appicon").getBoundingClientRect());
    target = (dir === "out" && remembered) || brand.querySelector(".tv-appicon").getBoundingClientRect();
    copy = copyOf(big);
    if (dir === "in") memory = { node: copyOf(big), box, tile, w: window.innerWidth, h: window.innerHeight };
  }
  remembered = null;
  if (!box.width || !target.width) {
    holdBrand(null);
    return false;
  }
  // The copy scales from its top left corner so that its tile lands on the small one.
  const s = target.width / tile.width;
  const tx = target.left + target.width / 2 - box.left - s * (tile.left + tile.width / 2 - box.left);
  const ty = target.top + target.height / 2 - box.top - s * (tile.top + tile.height / 2 - box.top);
  const ghost = copy;
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: "0",
    transformOrigin: "0 0",
    zIndex: "80",
    pointerEvents: "none",
    // Its own layer, drawn once: moving and scaling it is then the graphics card's work, not the page's, so it stays
    // smooth while the new screen is being built under it.
    willChange: "transform, opacity",
    backfaceVisibility: "hidden",
  });
  host.appendChild(ghost);
  if (big) {
    big.style.visibility = "hidden";
    landing = big;
  }
  if (dir === "out") flying = true;
  if (early) earlyAt = performance.now();
  const start = "translate3d(0, 0, 0) scale(1)";
  const there = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
  // The flight itself takes most of the time; the copy fades in before it takes off (out) or away after it lands (in).
  const moveMs = FLY_MS * 0.8;
  const fadeMs = FLY_MS * 0.2;
  const delay = dir === "in" ? 0 : fadeMs * 0.5;
  const total = dir === "in" ? FLY_MS : delay + moveMs;
  // The way: one smooth curve, slow at both ends, with no keyframe in the middle to make it stop and start again.
  const move = ghost.animate(dir === "in" ? [{ transform: start }, { transform: there }] : [{ transform: there }, { transform: start }], {
    fill: "both",
    delay,
    duration: moveMs,
    easing: "cubic-bezier(0.45, 0, 0.2, 1)",
  });
  // A little above the straight line half way: an arc, not a slide (its own property, so it adds to the way's).
  const lift = Math.min(44, Math.abs(ty) * 0.2);
  const arc = ghost.animate([{ translate: "0 0" }, { translate: `0 ${-lift}px`, offset: 0.5 }, { translate: "0 0" }], {
    fill: "both",
    delay,
    duration: moveMs,
    easing: "cubic-bezier(0.37, 0, 0.63, 1)",
  });
  const fade = ghost.animate(
    dir === "in"
      ? [{ opacity: 1 }, { opacity: 1, offset: moveMs / total }, { opacity: 0 }]
      : [{ opacity: 0 }, { opacity: 1, offset: fadeMs / total }, { opacity: 1 }],
    { fill: "both", duration: total, easing: "ease-out" }
  );
  // The letters melt away on the way (they have no place in the small logo's corner): only the tile arrives.
  ghost.querySelector(".tv-wordmark")?.animate(dir === "in" ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], {
    duration: moveMs * (dir === "in" ? 0.5 : 0.55),
    delay: dir === "in" ? 0 : delay + moveMs * 0.3,
    easing: "ease-in-out",
    fill: "both",
  });
  // The bar's logo and the big one trade places part by part: in, the bar's letters show as the big ones melt away, and
  // its tile fades in under the copy before it lands (so when the copy fades away over it there is no dip); out, the
  // letters are gone from the start and the tile goes under the copy as it takes off.
  const swaps =
    dir === "in"
      ? [setTimeout(() => holdBrand("in-tile"), moveMs * 0.6), setTimeout(() => holdBrand(null), moveMs * 0.9)]
      : [setTimeout(() => holdBrand(null), fadeMs)];
  const anim = { finished: Promise.all([move.finished, arc.finished, fade.finished]) };
  const finish = () => {
    swaps.forEach(clearTimeout);
    ghost.remove();
    if (landing) landing.style.visibility = "";
    landing = null;
    flying = false;
    holdBrand(null);
  };
  anim.finished.then(finish, finish);
  return true;
}
