import { useSyncExternalStore } from "react";

// The big logo of Inicio sends its tile to the top bar's small logo when an option is picked (and back when it is left):
// a copy of the big tile (without its letters) travels over the page and lands on the small tile. Nothing else moves:
// the letters of one logo just fade out in place and the other's fade in once the tile is there, so two logos are never
// half visible on top of each other. While it flies, the top bar's own logo is kept out of sight or in sight by `mode`:
//  - "in": the way into an option: the bar's logo is hidden (Inicio is already left) until the tile lands;
//  - "out": the way back to Inicio: the bar's tile stays until the copy takes off over it, but its letters fade at once;
//  - null: the bar's logo is where the page says (hidden on Inicio, shown anywhere else).
let mode = null;
let safety = 0;
const listeners = new Set();

export function holdBrand(next) {
  clearTimeout(safety);
  if (next) safety = setTimeout(() => holdBrand(null), 2500);
  if (next === mode) return;
  mode = next;
  listeners.forEach((fn) => fn());
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

// Where the bar's small logo is (its tile) right now: kept by the screen that is about to change the bar ("Volver" is
// about to shrink away and the logo with it slides left), so the flight back starts from where the logo was seen.
let remembered = null;
export function rememberBrand() {
  const tile = document.querySelector(".tv-brand .tv-appicon")?.getBoundingClientRect();
  remembered = tile?.width ? rectOf(tile) : null;
}

const FLY_MS = 800;
// The letters fade in or out this long.
const LETTERS_MS = 280;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const rectOf = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height });
const sameWindow = (m) => m && m.w === window.innerWidth && m.h === window.innerHeight;

// The big logo as it was when it last flew in (a copy of it, where its tile was, in a window of this size), so the flight
// back can start the moment "Volver" is pressed instead of waiting for Inicio to be on screen again.
let memory = null;
// A flight back that already took off, and the big logo it will land on (hidden until it has).
let flying = false;
let landing = null;
let earlyAt = -Infinity;

// The copy that flies: the big logo with its letters hidden, over the page, with a clip of its own (the tile's clip is
// found by an id, which the copy would share with the original: once that one is hidden or gone the copy's coloured frame
// is clipped away and the tile turns black).
function copyOf(logo) {
  const ghost = logo.cloneNode(true);
  ghost.classList.add("is-ghost");
  ghost.style.visibility = "";
  ghost.style.animation = "none";
  const letters = ghost.querySelector(".tv-wordmark");
  if (letters) letters.style.visibility = "hidden";
  ghost.querySelectorAll("clipPath[id]").forEach((clip) => {
    const old = clip.id.replace(/-fly$/, "");
    clip.id = `${old}-fly`;
    ghost.querySelectorAll(`[clip-path="url(#${old})"], [clip-path="url(#${old}-fly)"]`).forEach((el) => el.setAttribute("clip-path", `url(#${old}-fly)`));
  });
  return ghost;
}

// The letters of a logo fade in (once its tile is there) or out, in place.
function fadeLetters(logo, to) {
  const letters = logo?.querySelector(".tv-wordmark");
  if (!letters) return;
  letters.getAnimations?.().forEach((a) => a.cancel());
  letters.animate([{ opacity: to ? 0 : 1 }, { opacity: to ? 1 : 0 }], { duration: LETTERS_MS, easing: "ease-in-out", fill: "both" });
}

/**
 * Sends the tile, `dir` "in" (from the middle of Inicio to the top bar) or "out" (back). Releases the top bar's logo when
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
  let ghost;
  let box; // the big logo's box in the window, and its tile's
  let tile;
  let small; // the bar's tile
  if (early) {
    if (!sameWindow(memory) || !remembered) return false;
    ghost = copyOf(memory.node);
    ({ box, tile } = memory);
    small = remembered;
  } else {
    if (!big) {
      holdBrand(null);
      return false;
    }
    // Without its own way in (it would be moving while it is measured).
    big.style.animation = "none";
    box = rectOf(big.getBoundingClientRect());
    tile = rectOf(big.querySelector(".tv-appicon").getBoundingClientRect());
    // In: to where the bar's tile is now ("Volver" has already taken its place beside it, see .is-back-fly).
    small = (dir === "out" && remembered) || rectOf(brand.querySelector(".tv-appicon").getBoundingClientRect());
    ghost = copyOf(big);
    if (dir === "in") memory = { node: copyOf(big), box, tile, w: window.innerWidth, h: window.innerHeight };
  }
  remembered = null;
  if (!box.width || !small.width) {
    holdBrand(null);
    return false;
  }
  // The copy scales from its top left corner so that its tile lands on the small one.
  const s = small.width / tile.width;
  const tx = small.left + small.width / 2 - box.left - s * (tile.left + tile.width / 2 - box.left);
  const ty = small.top + small.height / 2 - box.top - s * (tile.top + tile.height / 2 - box.top);
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
    willChange: "transform",
    backfaceVisibility: "hidden",
  });
  host.appendChild(ghost);
  if (big) {
    // The tile goes (the copy is it now); the letters fade away in place on the way in, and the whole logo waits for the
    // landing on the way back.
    if (dir === "in") {
      const bigTile = big.querySelector(".tv-appicon");
      if (bigTile) bigTile.style.visibility = "hidden";
      fadeLetters(big, false);
    } else {
      big.style.visibility = "hidden";
    }
    landing = big;
  }
  if (dir === "out") flying = true;
  if (early) earlyAt = performance.now();

  const start = "translate3d(0, 0, 0) scale(1)";
  const there = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
  const opts = { fill: "both", duration: FLY_MS };
  // One smooth curve, slow at both ends...
  const move = ghost.animate(dir === "in" ? [{ transform: start }, { transform: there }] : [{ transform: there }, { transform: start }], {
    ...opts,
    easing: "cubic-bezier(0.45, 0, 0.2, 1)",
  });
  // ...with a little lift half way: an arc, not a slide (its own property, so it adds to the way's).
  const lift = Math.min(40, Math.abs(ty) * 0.18);
  const arc = ghost.animate([{ translate: "0 0" }, { translate: `0 ${-lift}px`, offset: 0.5 }, { translate: "0 0" }], {
    ...opts,
    easing: "cubic-bezier(0.37, 0, 0.63, 1)",
  });

  // The bar's logo: in, it appears (tile and letters, fading together) as the copy lands, and the copy stays over it until
  // it is all there; out, it goes the moment the copy takes off over its tile.
  const timers = [];
  if (dir === "in") timers.push(setTimeout(() => holdBrand(null), FLY_MS * 0.92));
  else timers.push(setTimeout(() => holdBrand(null), 60));

  const finish = () => {
    timers.forEach(clearTimeout);
    ghost.remove();
    if (dir === "out" && landing) {
      // The big logo's tile is there; its letters fade in.
      landing.style.visibility = "";
      fadeLetters(landing, true);
    }
    landing = null;
    flying = false;
    holdBrand(null);
  };
  // The copy stays a moment over the landing tile on the way in, until the bar's logo has faded in under it.
  const done = Promise.all([move.finished, arc.finished]).then(() => (dir === "in" ? new Promise((r) => setTimeout(r, 260)) : null));
  done.then(finish, finish);
  return true;
}
