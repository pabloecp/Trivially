import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Avatar from "./Avatar.jsx";
import CountUp from "./CountUp.jsx";
import Icon from "./Icon.jsx";
import PlayerName from "./PlayerName.jsx";
import { usePhone } from "./RoomChat.jsx";

// The pieces of the results screens (MatchResults, the playlist's intermission and its final screen, all in the same
// frame): the podium in its card, the ranking in its card beside it, and a player's rounds as dots.

// "1 jugador", "4 jugadores".
export const countText = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// A player's rounds as dots, each in its colour (RoomManager.recordRound's status): right, close, wrong, no answer.
export function RoundDots({ rounds = [] }) {
  const hits = rounds.filter((r) => r.status === "ok").length;
  return (
    <span className="tv-res-dots" role="img" aria-label={`${hits} de ${rounds.length} acertadas`}>
      {rounds.map((r) => (
        <span key={`${r.round}-${r.game}`} className={`tv-res-dot is-${r.status}`} />
      ))}
    </span>
  );
}

/**
 * The podium: first place in the middle, second and third on each side. `players` are in final position; `score(p)`
 * is what shows under each name (the points, by default) and `below(p)` what shows inside each block under its place
 * (a match's right answers and dots).
 */
// `tied`: how many players share first place (a tie: nobody won). They all stand on the top step.
export function Podium({ players, score = (p) => <><CountUp value={p.score} /> pts</>, below = null, meId = null, tied = 0 }) {
  const podium = [players[1], players[0], players[2]]; // 2nd, 1st, 3rd
  const rank = (p) => (tied > 1 && players.indexOf(p) < tied ? 1 : players.indexOf(p) + 1);
  return (
    <div className="tv-podium" role="list" aria-label="Podio">
      {podium.map((p, i) => {
        const slot = i === 1 ? 1 : i === 0 ? 2 : 3;
        if (!p) return <div key={slot} className="tv-podium-spot is-empty" aria-hidden="true" />;
        const place = rank(p);
        return (
          <div key={p.id} role="listitem" className={`tv-podium-spot is-${place}`}>
            <span className="tv-podium-avatar">
              {/* First place celebrates (tied, all of them); second and third look down. */}
              <Avatar name={p.name} avatar={p.avatar} className={place === 1 ? "tv-avatar--lg" : ""} mood={place === 1 ? "victoria" : "derrota"} />
            </span>
            <span className="tv-podium-who">
              {/* On phones only the first name, whole ("Mateo", not "Mateo Com…"); the ranking beside keeps the full one. */}
              <PlayerName player={p} className="tv-podium-name">
                <span className="tv-podium-full">{p.name}</span>
                <span className="tv-podium-first">{p.name.trim().split(/\s+/)[0]}</span>
              </PlayerName>
            </span>
            <span className="tv-podium-score">{score(p)}</span>
            <div className="tv-podium-block">
              <span className="tv-podium-place">{place}</span>
              {below && <span className="tv-podium-below">{below(p)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// What comes next at the end of a match (the buttons, or "Esperando a que el anfitrión…"). On phones it's a bar pinned to
// the bottom like the room's (.tv-roomdock), so the buttons are always in sight however long the results are: put at
// the end of the app's frame, outside the results, whose container (and entrance animations) would pin it to them.
export function ResultsFoot({ children }) {
  const phone = usePhone();
  // The app's frame, once it's on the page (on the first render it may not be yet).
  const [frame, setFrame] = useState(null);
  useEffect(() => {
    if (phone) setFrame(document.querySelector(".tv-app") || document.body);
  }, [phone]);
  const foot = <footer className="tv-res-foot">{children}</footer>;
  if (!phone) return foot;
  return frame ? createPortal(<div className="tv-res-dock">{foot}</div>, frame) : null;
}

// The podium in its card, titled "Podio", with a short line on the right ("2 jugadores · 5 preguntas").
export function PodiumCard({ meta, children }) {
  return (
    <section className="tv-res-card tv-res-podium" aria-labelledby="tv-res-podium-title">
      <div className="tv-res-card-head">
        <h2 id="tv-res-podium-title" className="tv-res-card-title">Podio</h2>
        {meta && <span className="tv-res-meta">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * The ranking in its card, beside the podium: titled with the game's (or the playlist's) icon in its colour and name,
 * every player in final position with their avatar, name, a dot per round and `value(p)` (their points), this player
 * ringed. "Ver tus respuestas" (`onOpen`, only when this player has rounds) opens their answers.
 */
export function RankingCard({ icon = "play", color = "neutral", title, players, meId = null, onOpen = null, value }) {
  return (
    <section className="tv-res-card tv-res-game" aria-labelledby="tv-res-game-title">
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
      <ol className="tv-res-table">
        {players.map((p, i) => (
          <li key={p.id} className={`tv-res-row${p.id === meId ? " is-me" : ""}`} style={{ "--i": i }}>
            <span className="tv-res-row-pos">{i + 1}</span>
            <Avatar name={p.name} avatar={p.avatar} mood="neutral" />
            <span className="tv-res-row-main">
              <PlayerName player={p} className="tv-res-row-name" />
              <RoundDots rounds={p.rounds} />
            </span>
            <span className="tv-res-row-points">{value(p)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
