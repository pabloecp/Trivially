import { useSyncExternalStore } from "react";

// The big logo of Inicio flies to the top bar's small one when an option is picked (and back when it is left): a copy of
// the big logo travels over the page, its tile landing on the small tile, while the top bar's own logo stays out of
// sight (`mode`):
//  - "in": the way into an option; the bar's logo is hidden until the flight is over, though Inicio is already left;
//  - "out": the way back to Inicio; the bar's logo stays until the copy is on its way, though Inicio hides it;
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

/**
 * Flies the logo, `dir` "in" (from the middle of Inicio to the top bar) or "out" (back). Releases the top bar's logo when
 * done, or at once when there is nothing to fly (no big logo on screen, reduced motion).
 */
export function flyLogo(dir) {
  const big = document.querySelector(".tv-logo.tv-play-logo");
  const brand = document.querySelector(".tv-brand");
  const host = document.querySelector(".tv-app");
  if (!big || !brand || !host || reducedMotion()) {
    holdBrand(null);
    return;
  }
  // Without its own way in (it would be moving while it is measured).
  big.style.animation = "none";
  const box = big.getBoundingClientRect();
  const tile = big.querySelector(".tv-appicon").getBoundingClientRect();
  const target = brand.querySelector(".tv-appicon").getBoundingClientRect();
  if (!box.width || !target.width) {
    holdBrand(null);
    return;
  }
  // The copy scales from its top left corner so that its tile lands on the small one.
  const s = target.width / tile.width;
  const tx = target.left + target.width / 2 - box.left - s * (tile.left + tile.width / 2 - box.left);
  const ty = target.top + target.height / 2 - box.top - s * (tile.top + tile.height / 2 - box.top);
  const ghost = big.cloneNode(true);
  ghost.classList.add("is-ghost");
  // The tile's clip is found by an id, which the copy would share with the original: once that one is hidden or gone (the
  // page it is on has left) the copy's coloured frame is clipped away and the tile turns black. It gets its own.
  ghost.querySelectorAll("clipPath[id]").forEach((clip) => {
    const old = clip.id;
    clip.id = `${old}-fly`;
    ghost.querySelectorAll(`[clip-path="url(#${old})"]`).forEach((el) => el.setAttribute("clip-path", `url(#${old}-fly)`));
  });
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
  big.style.visibility = "hidden";
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
    duration: moveMs * 0.5,
    delay: dir === "in" ? 0 : delay + moveMs * 0.5,
    easing: "ease-in-out",
    fill: "both",
  });
  // The bar's logo goes out of sight as the copy takes over (out), or shows as the copy lands (in).
  const swap = setTimeout(() => holdBrand(null), dir === "in" ? moveMs * 0.92 : fadeMs);
  const anim = { finished: Promise.all([move.finished, arc.finished, fade.finished]) };
  const finish = () => {
    clearTimeout(swap);
    ghost.remove();
    big.style.visibility = "";
    holdBrand(null);
  };
  anim.finished.then(finish, finish);
}
