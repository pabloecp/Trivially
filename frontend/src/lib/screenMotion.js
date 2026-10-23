// Screens that should feel like one: Casual and its search for players (the same frame, MatchLobby), and the options of
// /jugar and the room they open. Instead of the big panels' usual way out and in (--tv-box-in / --tv-box-out), what is
// the same stays put and only what changes moves, softly (Home's "seam").

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Ends the CSS animations of `els` at once (their way in), so they show where they already are. */
export function settle(els) {
  for (const el of els) for (const a of el.getAnimations?.() || []) a.finish();
}

/**
 * A soft way in over whatever an element had: a short fade and lift, one after another. `lift` is how far it rises
 * (px), `scale` how small it starts.
 */
export function softIn(els, { delay = 0, step = 60, lift = 16, scale = 0.985, duration = 480 } = {}) {
  if (reduced()) return;
  [...els].forEach((el, i) =>
    el.animate?.(
      [
        { opacity: 0, transform: `translateY(${lift}px) scale(${scale})` },
        { opacity: 1, transform: "none" },
      ],
      { duration, delay: delay + i * step, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)", fill: "backwards" }
    )
  );
}
