import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import PlayerName from "./PlayerName.jsx";
import { RowChange } from "./Ratings.jsx";
import { useFiveRows } from "./ResultsParts.jsx";
import "../../styles/resultsLooks.css";

import { translate as tr } from "../../lib/i18n.js";
// The results screen at the end of a match: a bar as long as the points for each player, in the match's colour. The games
// won are on the right and whoever won (all of them on a tie) is ringed in the match's colour.

/** A player's games won, in a small box like a scoreboard's; lit (in the match's colour) for this game's winners. */
export function GamesDigit({ n, lit }) {
  return (
    <span className={`rl-digit${lit ? " is-lit" : ""}`}>
      <b key={`${n}-${lit}`}>{n}</b>
    </span>
  );
}

/**
 * Every game of a match in a row, as at the top of its final screen: each game's icon in its colour and the faces of
 * whoever won it (an empty face when nobody did), with no names. `items`: [{ icon, color, winners: [players] }].
 */
export function GamesWon({ items }) {
  return (
    <ol className="rl-won" aria-label={tr("Quién ganó cada juego")}>
      {items.map((g, i) => (
        <li key={i} className="rl-won-game" style={{ "--i": i }}>
          <span className={`rl-won-icon tv-c-${g.color}`} aria-hidden="true">
            <Icon name={g.icon} size={20} strokeWidth={2.4} />
          </span>
          {g.winners.length ? (
            g.winners.map((p) => <Avatar key={p.id} name={p.name} avatar={p.avatar} />)
          ) : (
            <span className="rl-won-empty" aria-label={tr("Nadie lo ganó")} />
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * The ranking card at the end of a match, like RankingCard (its head and "Ver tus respuestas"):
 * each player with their points beside the name and a bar under it, and their games won on the right (`wins(p)`, or
 * their points when the match was one game), all in the match's colour.
 * `changes` (Ratings.jsx rowChanges): what the match moved for each player, at the end of their row.
 */
export function RetouchCard({ icon = "play", color = "neutral", title, players, meId = null, onOpen = null, points, wins = null, winners = [], changes = null }) {
  const max = Math.max(1, ...players.map(points));
  const [listRef, five] = useFiveRows(players.length);
  return (
    <section className={`tv-res-card tv-res-game rl-rank tv-c-${color} is-color`} aria-labelledby="tv-res-game-title">
      <div className="tv-res-card-head">
        <h2 id="tv-res-game-title" className="tv-res-card-title">
          <span className={`tv-res-game-icon tv-c-${color}`} aria-hidden="true">
            <Icon name={icon} size={16} strokeWidth={2.4} />
          </span>
          {title}
        </h2>
        {onOpen && (
          <button type="button" className="tv-res-link" onClick={onOpen}>
            {tr("Ver tus respuestas")}
            <Icon name="chevron" size={14} strokeWidth={2.6} />
          </button>
        )}
      </div>
      <ol ref={listRef} className={`tv-res-table${five}`}>
        {players.map((p, i) => {
          const win = winners.includes(p.id);
          const pts = `${points(p).toLocaleString("es-ES")} pts`;
          const change = changes?.get(p.id);
          return (
            <li key={p.id} className={`tv-res-row rl-rankrow${p.id === meId ? " is-me" : ""}${win ? " is-win" : ""}`} style={{ "--i": i }}>
              <span className="tv-res-row-pos">{i + 1}</span>
              <Avatar name={p.name} avatar={p.avatar} mood="neutral" />
              <span className="tv-res-row-main">
                <span className="rl-nname-top">
                  <PlayerName player={p} className="tv-res-row-name" />
                  {wins && <small className="rl-rankpts">{pts}</small>}
                </span>
                <span className="rl-ntrack">
                  <i style={{ "--w": `${(points(p) / max) * 100}%` }} />
                </span>
              </span>
              {change ? <RowChange change={change} index={i} /> : changes && p.isGuest && <span className="tv-rowchange tv-rowchange--none">{tr("Sin cuenta")}</span>}
              {wins ? <GamesDigit n={wins(p)} lit={win} /> : <span className="tv-res-row-points">{pts}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
