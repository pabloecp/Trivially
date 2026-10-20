import { findMode } from "../../modes/index.js";
import Icon from "./Icon.jsx";
import { MATCH_GAMES } from "./matchInfo.js";
import "../../styles/match.css";

// Enough laps of the three games that half the track is always wider than any box it's in: the track moves by half and
// starts over, which looks the same, so it never runs out of cards nor jumps.
const LAPS = 10;

/**
 * The roulettes' marker: a soft, rounded arrow above and below the middle, pointing at it (in the colour of the match's
 * kind, through --marker). Shared by the slow roulette and the one that picks the game (MatchIntro).
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

/**
 * The games going slowly past the marker, round and round: the roulette that will pick them (MatchIntro), before it
 * spins. The same square cards, only their icons. On the "¿Cómo quieres jugar?" settings and in a public match's lobby.
 * `color`: the match's kind (Casual or Competitivo), whose colour the marker takes.
 */
export default function SlowReel({ className = "", color = null }) {
  return (
    <div className={`tv-play-reel${color ? ` tv-reel-${color}` : ""} ${className}`.trim()} aria-label="Trivia, Rango y Campo de minas">
      <ReelMarker />
      <div className="tv-play-reel-track" aria-hidden="true">
        {Array.from({ length: LAPS }, () => MATCH_GAMES)
          .flat()
          .map((id, i) => {
            const m = findMode(id);
            return (
              <span key={i} className={`tv-mi-card tv-play-reel-card tv-c-${m.color}`}>
                <span className="tv-mi-card-icon">
                  <Icon name={m.icon} size={26} strokeWidth={2.4} />
                </span>
              </span>
            );
          })}
      </div>
    </div>
  );
}
