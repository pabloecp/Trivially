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

const FLY_MS = 760;
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
  });
  host.appendChild(ghost);
  big.style.visibility = "hidden";
  const there = `translate(${tx}px, ${ty}px) scale(${s})`;
  const frames =
    dir === "in"
      ? [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: there, opacity: 1, offset: 0.86 },
          { transform: there, opacity: 0 },
        ]
      : [
          { transform: there, opacity: 0 },
          { transform: there, opacity: 1, offset: 0.14 },
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
        ];
  // The letters melt away on the way (they have no place in the small logo's corner): only the tile arrives.
  const letters = ghost.querySelector(".tv-wordmark");
  letters?.animate(dir === "in" ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], {
    duration: FLY_MS * 0.45,
    delay: dir === "in" ? 0 : FLY_MS * 0.55,
    easing: "ease-in-out",
    fill: "both",
  });
  const anim = ghost.animate(frames, { duration: FLY_MS, easing: "cubic-bezier(0.5, 0, 0.15, 1)", fill: "both" });
  // The bar's logo goes out of sight as the copy takes over (out), or shows as the copy lands (in).
  const swap = setTimeout(() => holdBrand(null), FLY_MS * (dir === "in" ? 0.8 : 0.16));
  const finish = () => {
    clearTimeout(swap);
    ghost.remove();
    big.style.visibility = "";
    holdBrand(null);
  };
  anim.finished.then(finish, finish);
}
