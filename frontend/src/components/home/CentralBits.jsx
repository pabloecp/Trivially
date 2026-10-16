import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import "../../styles/central.css";

// Pieces the games' screens share when the room has a central device (lib/store.jsx useView): what the central device
// says about the whole room instead of "you", and where a player's phone tells them to look.

// "Ana", "Ana y Luis", "Ana, Luis y Eva".
export function joinNames(names) {
  if (names.length < 2) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

// The players who answer this round: connected, not watching it (spectators) and, in a tiebreak, only the tied ones.
export function roundPlayers(room) {
  const tied = room.tiebreak?.playerIds;
  return room.players.filter((p) => p.connected && !p.spectator && (!tied || tied.includes(p.id)));
}

// While a round is played on the central device: how many have answered ("Respuestas: 2 de 4").
export function answeredText(room, what = "Respuestas") {
  const players = roundPlayers(room);
  return `${what}: ${players.filter((p) => p.answered).length} de ${players.length}`;
}

/**
 * At the reveal, on the central device: how the room did this round, instead of one player's verdict. `right(p)` says
 * whether a player got it (by default their answer was right); `detail` goes under it when it doesn't name who.
 */
export function RoomVerdict({ room, right = (p) => Boolean(p.lastAnswer?.correct), detail = "" }) {
  const players = roundPlayers(room);
  const hits = players.filter(right);
  const names = hits.map((p) => p.name);
  let title;
  let tone = "ok";
  if (!players.length) {
    title = "Ronda terminada";
    tone = "timeout";
  } else if (players.length === 1) {
    title = hits.length ? `¡${players[0].name} acertó!` : `${players[0].name} no acertó`;
    if (!hits.length) tone = "bad";
  } else if (hits.length === players.length) {
    title = "¡Todos acertaron!";
  } else if (!hits.length) {
    title = "Nadie acertó";
    tone = "bad";
  } else {
    title = `${hits.length} de ${players.length} acertaron`;
  }
  const who = hits.length && hits.length < players.length && players.length > 1 ? joinNames(names.slice(0, 4)) + (names.length > 4 ? " y más" : "") : "";
  return (
    <div className={`tv-quiz-verdict tv-quiz-verdict--${tone} tv-central-verdict`} role="status">
      <span className="tv-quiz-verdict-icon">
        <Icon name={tone === "ok" ? "check" : tone === "bad" ? "close" : "hash"} size={22} strokeWidth={3.2} />
      </span>
      <strong className="tv-quiz-verdict-title">{title}</strong>
      {(who || detail) && <span className="tv-quiz-verdict-detail">{who || detail}</span>}
    </div>
  );
}

/**
 * A player's phone beside the central device, in place of the round's card: no round and no question (they're on the
 * big screen), only where to look, the time left (`seconds`, and `pct` of the phase for its bar; `urgent` turns them
 * red) and the match's tools (`children`: Reportar, and the host's Pausar and Terminar; each shows only to whom it
 * may).
 */
export function ControllerBar({ seconds, pct, urgent = false, children }) {
  return (
    <div className="tv-ctrl-bar">
      <p className="tv-ctrl-look">
        <Icon name="tv" size={16} strokeWidth={2.4} />
        Mira la pantalla central
      </p>
      <div className="tv-ctrl-tools">{children}</div>
      <div className={`tv-clock tv-ctrl-clock${urgent ? " is-urgent" : ""}`} role="timer" aria-label={`${seconds} segundos`}>
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle className="tv-clock-track" cx="22" cy="22" r="19" />
          <circle className="tv-clock-fill" cx="22" cy="22" r="19" style={{ strokeDashoffset: 119.4 * (1 - pct / 100) }} />
        </svg>
        <span key={seconds} className="tv-clock-num">
          {seconds}
        </span>
      </div>
      <div className="tv-timer tv-ctrl-timer" aria-hidden="true">
        <span className={`tv-timer-fill${urgent ? " is-urgent" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// A phone beside the central device while the round counts down there: no number, only that it's coming.
export function GetReady({ children = "¡Prepárate!" }) {
  return (
    <p className="tv-ctrl-ready" role="status">
      {children}
    </p>
  );
}

// On the central device while a round is played: the players answer from their phones, and each one's face lights up
// (with a check) once they have.
export function PhoneHint({ room, children }) {
  const players = room ? roundPlayers(room) : [];
  return (
    <div className="tv-phone-hint" role="status" aria-label={room ? `${children}. ${answeredText(room)}` : undefined}>
      <Icon name="phone" size={18} strokeWidth={2.4} />
      <span>{children}</span>
      {players.length > 0 && (
        <ul className="tv-answer-faces" aria-hidden="true">
          {players.map((p, i) => (
            <li key={p.id} className={p.answered ? "is-done" : ""} style={{ "--i": i }} title={p.name}>
              <Avatar name={p.name} avatar={p.avatar} />
              {p.answered && (
                <span className="tv-answer-faces-check">
                  <Icon name="check" size={10} strokeWidth={3.6} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
