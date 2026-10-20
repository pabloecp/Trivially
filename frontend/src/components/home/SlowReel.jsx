import "../../styles/match.css";

/**
 * The roulettes' marker: a soft, rounded arrow above and below the middle, pointing at it (in the colour of the match's
 * kind, through --marker). On the roulette that picks the game (MatchIntro).
 */
export function ReelMarker() {
  const arrow = (side) => (
    <svg className={`tv-mi-pin is-${side}`} viewBox="0 0 28 18" aria-hidden="true">
      <path d="M6 5h16l-8 8z" />
    </svg>
  );
  return (
    <span className="tv-mi-marker" aria-hidden="true">
      {arrow("top")}
      {arrow("bottom")}
    </span>
  );
}
