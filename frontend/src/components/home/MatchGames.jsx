import { findMode } from "../../modes/index.js";
import Icon from "./Icon.jsx";
import { variantsFor } from "./matchInfo.js";

/**
 * The games a public match draws from, only to read (nobody picks them: the roulette does, 1 or 3 of them): each game
 * with one way of playing it is a game of its own ("Trivia Cerradas", "Rango Cifras": MATCH_VARIANTS), shown as the
 * roulette's own cards (MatchIntro's .tv-mi-card): in its game's colour, its icon on a see-through square, its name and
 * its way under it. Flat (nothing to press). `compact` is a public match's lobby (MatchLobby) and a Clásico's, a little
 * smaller; otherwise they come under a setting-like title ("Juegos").
 */
export default function MatchGames({ kind = "competitivo", compact = false }) {
  const list = (
    <ul className={`tv-mgames${compact ? " is-compact" : ""}`} aria-label="Juegos que pueden tocar">
      {variantsFor(kind).map((v) => {
        const mode = findMode(v.game);
        return (
          <li key={v.id} className={`tv-mgame tv-c-${mode.color}`}>
            <span className="tv-mgame-icon" aria-hidden="true">
              <Icon name={mode.icon} size={compact ? 24 : 28} strokeWidth={2.4} />
            </span>
            <strong className="tv-mgame-name">{mode.name}</strong>
            <span className="tv-mgame-way">{v.way}</span>
          </li>
        );
      })}
    </ul>
  );
  if (compact) return list;
  return (
    <div className="tv-optrow">
      <span className="tv-optrow-name">
        <span className="tv-optrow-label">Juegos</span>
      </span>
      {list}
    </div>
  );
}
