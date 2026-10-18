import Icon from "../../components/home/Icon.jsx";
import { findMode } from "../index.js";
import "../../styles/playlist.css";

export const winsText = (n) => `${n} ${n === 1 ? "juego" : "juegos"}`;

// The playlist's games, small, in the kicker's line of its results: each game's icon in its colour, with a tick once
// the playlist is over (it's one match, so every game was played). Their names are only read out to screen readers.
export function PlaylistProgress({ run }) {
  return (
    <ol className="tv-pl-mini" aria-label="Juegos de la playlist">
      {run.games.map((game, i) => {
        const mode = findMode(game);
        return (
          <li
            key={i}
            className={`tv-pl-mini-game tv-c-${mode?.color || "neutral"}${run.finished ? " is-played" : ""}`}
            aria-label={`${i + 1}. ${mode?.name || game}`}
          >
            <Icon name={mode?.icon || "play"} size={12} strokeWidth={2.6} />
            {run.finished && (
              <span className="tv-pl-mini-tick" aria-hidden="true">
                <Icon name="check" size={8} strokeWidth={4} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
