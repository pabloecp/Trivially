import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import PlayerName from "./PlayerName.jsx";
import { useFiveRows } from "./ResultsParts.jsx";
import "../../styles/resultsLooks.css";

// The results screens of a match (between games and at the end), in two styles (lib/ownerView.js, useResultsLook):
// "panel" (everyone's: each player's points under the name) and "barras" (a bar as long as the points, for an owner to
// try), "color" or "neutro". The games won are on the right and whoever won (all of them on a tie) is ringed in the
// match's colour.

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
    <ol className="rl-won" aria-label="Quién ganó cada juego">
      {items.map((g, i) => (
        <li key={i} className="rl-won-game" style={{ "--i": i }}>
          <span className={`rl-won-icon tv-c-${g.color}`} aria-hidden="true">
            <Icon name={g.icon} size={20} strokeWidth={2.4} />
          </span>
          {g.winners.length ? (
            g.winners.map((p) => <Avatar key={p.id} name={p.name} avatar={p.avatar} />)
          ) : (
            <span className="rl-won-empty" aria-label="Nadie lo ganó" />
          )}
        </li>
      ))}
    </ol>
  );
}

const firstName = (name = "") => name.split(" ")[0];

/**
 * Between games: a quiet line saying who won the game, then the players as rows with their points under the name
 * ("panel") or with a bar as long as them ("barras"), each with their games won (`wins(p)`) on the right; and what is
 * left of the match.
 * `tone`: "color" (all in a panel of the match's colour) or "neutro" (dark rows, the winners ringed in it).
 */
export function RetouchBetween({ kicker, line, note, players, winners = [], points, wins, retouch = "panel", tone = "color", color = "site" }) {
  const max = Math.max(1, ...players.map(points));
  const many = players.length > 5;
  return (
    <div className={`rl-nb tv-c-${color} is-${tone}`}>
      <p className="tv-mono-label">{kicker}</p>
      <h3 className="rl-line">{line}</h3>
      <ul className={`rl-nlist${many ? " is-many" : ""}`} style={{ "--rows": Math.ceil(players.length / 2) }}>
        {players.map((p, i) => {
          const win = winners.includes(p.id);
          const pts = <small>{points(p).toLocaleString("es-ES")} pts</small>;
          return (
            <li key={p.id} className={`rl-nrow${win ? " is-win" : ""}`} style={{ "--i": i }}>
              <Avatar name={p.name} avatar={p.avatar} mood="neutral" />
              <span className="rl-nname">
                {retouch === "barras" ? (
                  <>
                    <span className="rl-nname-top">
                      <b>{many ? firstName(p.name) : p.name}</b>
                      {pts}
                    </span>
                    <span className="rl-ntrack">
                      <i style={{ "--w": `${(points(p) / max) * 100}%` }} />
                    </span>
                  </>
                ) : (
                  <>
                    <b>{many ? firstName(p.name) : p.name}</b>
                    {pts}
                  </>
                )}
              </span>
              <GamesDigit n={wins(p)} lit={win} />
            </li>
          );
        })}
      </ul>
      {note && <p className="rl-note">{note}</p>}
    </div>
  );
}

/**
 * The ranking card at the end of a match, like RankingCard (its head and "Ver tus respuestas"):
 * each player with their points under the name (in "barras", beside it with a bar under) and their games won on the
 * right (`wins(p)`, or their points when the match was one game). `tone` "color" puts the card in the match's colour.
 */
export function RetouchCard({ icon = "play", color = "neutral", title, players, meId = null, onOpen = null, points, wins = null, winners = [], retouch = "panel", tone = "color" }) {
  const max = Math.max(1, ...players.map(points));
  const [listRef, five] = useFiveRows(players.length);
  return (
    <section className={`tv-res-card tv-res-game rl-rank tv-c-${color} is-${tone}`} aria-labelledby="tv-res-game-title">
      <div className="tv-res-card-head">
        <h2 id="tv-res-game-title" className="tv-res-card-title">
          <span className={`tv-res-game-icon tv-c-${color}`} aria-hidden="true">
            <Icon name={icon} size={16} strokeWidth={2.4} />
          </span>
          {title}
        </h2>
        {onOpen && (
          <button type="button" className="tv-res-link" onClick={onOpen}>
            Ver tus respuestas
            <Icon name="chevron" size={14} strokeWidth={2.6} />
          </button>
        )}
      </div>
      <ol ref={listRef} className={`tv-res-table${five}`}>
        {players.map((p, i) => {
          const win = winners.includes(p.id);
          const pts = `${points(p).toLocaleString("es-ES")} pts`;
          return (
            <li key={p.id} className={`tv-res-row rl-rankrow${p.id === meId ? " is-me" : ""}${win ? " is-win" : ""}`} style={{ "--i": i }}>
              <span className="tv-res-row-pos">{i + 1}</span>
              <Avatar name={p.name} avatar={p.avatar} mood="neutral" />
              <span className="tv-res-row-main">
                {retouch === "barras" ? (
                  <>
                    <span className="rl-nname-top">
                      <PlayerName player={p} className="tv-res-row-name" />
                      {wins && <small className="rl-rankpts">{pts}</small>}
                    </span>
                    <span className="rl-ntrack">
                      <i style={{ "--w": `${(points(p) / max) * 100}%` }} />
                    </span>
                  </>
                ) : (
                  <>
                    <PlayerName player={p} className="tv-res-row-name" />
                    {wins && <small className="rl-rankpts">{pts}</small>}
                  </>
                )}
              </span>
              {wins ? <GamesDigit n={wins(p)} lit={win} /> : <span className="tv-res-row-points">{pts}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
