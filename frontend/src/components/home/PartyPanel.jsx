import { useEffect, useRef, useState } from "react";
import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import CentralSpot from "./CentralSpot.jsx";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import PlayerMenu from "./PlayerMenu.jsx";
import { useInvite } from "./useInvite.js";
import { shownCode, useHiddenCode } from "../../lib/hiddenCode.js";
import { findVariant } from "./matchInfo.js";
import { findMode } from "../../modes/index.js";
import { formatElo } from "../../lib/gameStats.js";

function playerTag(player, { isHost }) {
  if (!player.connected) return "Reconectando…";
  if (isHost) return "Anfitrión";
  if (player.canEditConfig) return "Puede editar ajustes";
  return "Conectado";
}

// What the line under a name says once they answered, in each game's words ("Respondió", "Confirmó", "Ya votó"…);
// yours in the second person.
function doneWord(room, isMe) {
  if (room.game === "mundo") return isMe ? "Confirmaste" : "Confirmó";
  if (room.game === "historia") return isMe ? "Fijaste tu respuesta" : "Fijó su respuesta";
  if (room.game === "farsante") return room.farsante?.stage === "voting" ? (isMe ? "Ya votaste" : "Ya votó") : isMe ? "Ya escribiste" : "Ya escribió";
  return isMe ? "Respondiste" : "Respondió";
}

// During a match the line under each name says how their round is going. The server sends everyone's answer only
// once the round is over (reveal), and at the end each player's totals (results).
function MatchTag({ player, room, isMe = false }) {
  if (player.spectator) return <span className="tv-player-tag">Espectador</span>;
  if (!player.connected) return <span className="tv-player-tag">Reconectando…</span>;
  if (room.phase === "finished") {
    const r = room.results?.find((x) => x.id === player.id);
    if (!r) return <span className="tv-player-tag">Sin resultados</span>;
    // Only the right answers ("1 acierto", "6 aciertos").
    return <span className="tv-player-tag">{r.correct === 1 ? "1 acierto" : `${r.correct || 0} aciertos`}</span>;
  }
  if (room.phase === "reveal") {
    const a = player.lastAnswer;
    if (!a || a.skipped || !a.text) return <span className="tv-player-tag">{a?.skipped ? "Se la saltó" : "Sin respuesta"}</span>;
    return (
      <span className={`tv-player-tag tv-player-answer ${a.correct ? "is-right" : "is-wrong"}`}>
        <Icon name={a.correct ? "check" : "close"} size={12} strokeWidth={3.2} />
        <span>{a.text}</span>
      </span>
    );
  }
  // Campo de minas: out of the round (stepped on a mine, or didn't pick a cell in time).
  if (room.phase === "playing" && player.out) {
    return (
      <span className="tv-player-tag tv-player-answer is-wrong">
        <Icon name={player.out === "mina" ? "bomb" : "close"} size={12} strokeWidth={3.2} />
        <span>{player.out === "mina" ? "Pisó una mina" : "Sin tiempo"}</span>
      </span>
    );
  }
  // Rey de la colina: who holds the crown, and who's trying to take it.
  if (room.game === "rey" && room.phase === "playing" && room.rey?.roundKingId) {
    if (player.id === room.rey.roundKingId) return <span className="tv-player-tag is-king">Rey</span>;
    if (!player.answered) return <span className="tv-player-tag">Retador</span>;
  }
  if (player.answered) return <span className="tv-player-tag is-done">{doneWord(room, isMe)}</span>;
  // Campo de minas: the right answers found so far in this round.
  if (room.phase === "playing" && player.hits > 0) {
    return <span className="tv-player-tag is-streak">{player.hits === 1 ? "1 acierto" : `${player.hits} aciertos`}</span>;
  }
  // Hasn't answered in a few rounds in a row: the rounds don't wait for them until they answer again.
  if (room.phase === "playing" && player.idle) return <span className="tv-player-tag">Inactivo</span>;
  if (player.streak > 1) return <span className="tv-player-tag is-streak">Racha de {player.streak}</span>;
  return <span className="tv-player-tag">{room.phase === "playing" ? (room.game === "mundo" ? "Buscando…" : "Pensando…") : room.phase === "countdown" ? "Preparándose…" : "Conectado"}</span>;
}

// The scoreboard's pill while a round is open: "Respondieron 3/4" (those still playing it); between rounds, the round.
function answeredLine(room, players) {
  if (room.phase !== "playing") return `Ronda ${Math.min(room.totalRounds || 1, (room.currentRound || 0) + 1)}`;
  const inRound = players.filter((p) => p.connected && !p.idle && p.status !== "mirando");
  return `Respondieron ${inRound.filter((p) => p.answered).length}/${inRound.length}`;
}

// A match's scoreboard on a phone, under the game: one chip per player in the order of the ranking (face, name and points,
// a green dot once they answered, you with the yellow ring), sideways when they don't fit, always with you in sight. A tap
// opens the whole scoreboard (`onOpen`).
function ScoreStrip({ players, viewerId, disabled, room, onOpen }) {
  const ref = useRef(null);
  const myPlace = players.findIndex((p) => p.id === viewerId);
  useEffect(() => {
    const strip = ref.current;
    const chip = strip?.children[myPlace];
    if (!chip) return;
    if (chip.offsetLeft < strip.scrollLeft || chip.offsetLeft + chip.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: chip.offsetLeft - 8, behavior: "smooth" });
    }
  }, [myPlace, players.length]);
  return (
    <div ref={ref} className="tv-pstrip" role="group" aria-label="Marcador">
      {players.map((p, i) => {
        const done = p.answered && room.phase === "playing";
        return (
          <button
            key={p.id}
            type="button"
            className={`tv-pstrip-chip${p.id === viewerId ? " is-me" : ""}${done ? " is-done" : ""}${p.connected ? "" : " is-away"}`}
            disabled={disabled}
            onClick={onOpen}
            aria-label={`${i + 1}. ${p.name}, ${formatElo(p.score || 0)} puntos. Ver el marcador`}
          >
            <span className="tv-pstrip-face">
              <Avatar name={p.name} avatar={p.avatar} />
            </span>
            <span className="tv-pstrip-text">
              <span className="tv-pstrip-name">{p.name}</span>
              <b key={p.score} className="tv-pstrip-score">
                {formatElo(p.score || 0)}
              </b>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// The room's side column, on the room screen and during a match: the group's code (a group's private match), who's in
// and the way out.
// With `scores` (a match) the players are ranked by points, each with their score and how their round is going.
// `className` lets a game add its own (Geografía hides the column on phones, where it shows a strip instead).
// At the top of the players, while the room has one, the "Dispositivo central" (CentralSpot): the screen that shows the
// match, picked from a player's menu (the host or a player with the settings permission). On the central device itself
// the column only shows (`display`): no menus or way out, and the code to join instead of "Invitar".
// In a match (`scores`) the header says how the round goes (`status`: "Respondieron 3/4"; by default how many answered).
export default function PartyPanel({ room, onToast, scores = false, display = false, className = "", status }) {
  const { user, isCentral } = useApp();
  const [menuFor, setMenuFor] = useState(null);
  // Phones: the whole scoreboard, opened from its strip.
  const [boardOpen, setBoardOpen] = useState(false);
  // A group's private match shows the group's code: it's how more people come into the group, and so into it.
  const { copied, copy: copyInvite } = useInvite(room.groupCode, onToast);
  const [codeHidden, toggleCode] = useHiddenCode();
  // Who "you" are in the list: nobody on the central device, even when its account is one of the players'.
  const viewerId = isCentral ? null : user?.id;
  const isHost = Boolean(viewerId) && room.hostId === viewerId;
  // The host or a player with the settings permission: they pick the central device (any player, themselves too).
  const canCentral = Boolean(viewerId) && (isHost || Boolean(room.coHosts?.includes(viewerId)));
  // A match decided by games won (a public one or a Clásico) sends each player's `wins`. Once it's over, the column lists
  // them by games won, the one with most highlighted. Private rooms keep no scoreboard across their matches.
  const hasWins = room.players.some((p) => p.wins !== undefined);
  const winsOf = (id) => room.players.find((p) => p.id === id)?.wins || 0;
  const showBoard = !scores && hasWins && room.phase === "finished";
  const topWins = showBoard ? Math.max(0, ...room.players.map((p) => winsOf(p.id))) : 0;
  // In a match, the ranking is of the players; those who joined mid-match (spectators) have their own list below it.
  const players = scores
    ? room.players.filter((p) => !p.spectator).sort((a, b) => b.score - a.score)
    : showBoard
    ? [...room.players].sort((a, b) => winsOf(b.id) - winsOf(a.id))
    : room.players;
  const spectators = scores ? room.players.filter((p) => p.spectator) : [];
  // The games each player already won, in the match's scoreboard and in the column once it's over: a small crown and
  // the number on the face.
  const gameWins = hasWins && (scores ? room.phase !== "finished" : showBoard);

  const inMatch = room.phase !== "lobby";
  // The spot: always while the room waits (that's where it's set); in a match only while there is a central device.
  // "Dispositivo central": only while the room has one (it's picked from a player's menu).
  const showSpot = !display && Boolean(room.central);
  const statusLine = status ?? answeredLine(room, players);

  // The players, with their places in a match: in the column, and on a phone in the panel its strip opens.
  const people = (
    <div className="tv-party-people">
      <div>
        {showSpot && <CentralSpot room={room} canEdit={canCentral} onToast={onToast} />}
        <ul className="tv-party-players" aria-label={scores ? "Marcador" : "Jugadores en la partida"}>
          {players.map((p, i) => {
            const isMe = p.id === viewerId;
            const isHostPlayer = p.id === room.hostId;
            const wins = winsOf(p.id);
            return (
              <li
                key={p.id}
                className={`tv-player${isMe ? " is-me" : ""}${scores && p.answered && room.phase === "playing" ? " is-answered" : ""}${p.spectator ? " is-spectator" : ""}${p.connected ? "" : " is-away"}${menuFor === p.id ? " is-open" : ""}${
                  scores && !p.spectator && i < 3 ? ` is-top-${i + 1}` : ""
                }${showBoard && topWins > 0 && wins === topWins ? " is-leader" : ""}`}
                style={{ "--i": i }}
              >
                <button
                  type="button"
                  className="tv-player-btn"
                  aria-haspopup={display ? undefined : "menu"}
                  aria-expanded={display ? undefined : menuFor === p.id}
                  disabled={display}
                  onClick={() => setMenuFor((cur) => (cur === p.id ? null : p.id))}
                >
                  {scores && !p.spectator && <span className="tv-player-pos">{i + 1}</span>}
                  {gameWins && p.wins > 0 ? (
                    <span className="tv-player-face">
                      <Avatar name={p.name} avatar={p.avatar} mood="neutral" />
                      <span key={p.wins} className="tv-player-badge is-neutro">
                        <Icon name="crown" size={13} strokeWidth={2.6} filled />
                        {p.wins}
                      </span>
                    </span>
                  ) : (
                    <Avatar name={p.name} avatar={p.avatar} mood="neutral" />
                  )}
                  <span className="tv-player-text">
                    <span className="tv-player-name">
                      {p.name}
                    </span>
                    {scores ? (
                      <MatchTag player={p} room={room} isMe={isMe} />
                    ) : (
                      <span className={`tv-player-tag${isHostPlayer ? " is-host" : ""}`}>{playerTag(p, { isHost: isHostPlayer })}</span>
                    )}
                  </span>
                  {scores && !p.spectator && (
                    <span key={p.score} className="tv-player-score">
                      {formatElo(p.score || 0)}
                    </span>
                  )}
                  {/* The host's crown, always last on the right. */}
                  {isHostPlayer && !scores && <Icon name="crown" size={18} strokeWidth={1.5} filled className="tv-player-crown" />}
                </button>
                {menuFor === p.id && !display && (
                  <PlayerMenu
                    player={p}
                    isMe={isMe}
                    canManage={isHost && !isMe}
                    inMatch={inMatch}
                    onClose={() => setMenuFor(null)}
                    onToast={onToast}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {spectators.length > 0 && (
          <>
            <div className="tv-party-title">
              <h2>Espectadores</h2>
              <span>{spectators.length === 1 ? "1 espectador" : `${spectators.length} espectadores`}</span>
            </div>
            <ul className="tv-party-players tv-party-spectators" aria-label="Espectadores">
              {spectators.map((p) => (
                <li key={p.id} className={`tv-player is-spectator${p.id === viewerId ? " is-me" : ""}${p.connected ? "" : " is-away"}`}>
                  <div className="tv-player-btn">
                    <Avatar name={p.name} avatar={p.avatar} mood="neutral" />
                    <span className="tv-player-text">
                      <span className="tv-player-name">{p.name}</span>
                      <span className="tv-player-tag">{p.connected ? "Entra en la próxima partida" : "Reconectando…"}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );

  return (
    <aside
      className={`tv-party${scores ? " is-scores" : ""}${display ? " is-display" : ""} ${className}`.trim()}
      aria-label="La partida"
    >
      {/* Only a group's private match has a code to share (the group's). Nobody joins a public match but by searching. The
          scoreboard of a match has none: only the scoreboard (the code is only here and in "Tu grupo"). */}
      {room.groupCode && !room.matchmaking && !scores && (
      <div className="tv-party-codebox">
        <div className="tv-party-codehead">
          <p className="tv-mono-label">Código del grupo</p>
          {/* Hides the code on this device's screens, for streaming. */}
          <button
            type="button"
            className={`tv-code-eye${codeHidden ? " is-on" : ""}`}
            onClick={toggleCode}
            aria-pressed={codeHidden}
            aria-label={codeHidden ? "Mostrar el código" : "Ocultar el código"}
          >
            <Icon name={codeHidden ? "eye-off" : "eye"} size={16} strokeWidth={2.4} />
            <span>{codeHidden ? "Oculto" : "Ocultar"}</span>
          </button>
        </div>
        <p className={`tv-party-code${codeHidden ? " is-hidden" : ""}`}>{shownCode(room.groupCode, codeHidden)}</p>
        {display ? (
          <p className="tv-party-joinhint">Entra a trivially y únete con este código</p>
        ) : (
          <button type="button" className="tv-btn tv-c-violet tv-invite-btn tv-shine" onClick={copyInvite} aria-label="Invitar con enlace">
            <Icon name={copied ? "check" : "link"} size={20} strokeWidth={2.6} />
            {copied ? "¡Copiado!" : "Invitar"}
          </button>
        )}
      </div>
      )}


      <div className="tv-party-title">
        <h2>{scores ? "Marcador" : "En la partida"}</h2>
        {scores ? (
          <span className="tv-party-status-pill">{statusLine}</span>
        ) : (
          <span>{players.length === 1 ? "1 jugador" : `${players.length} jugadores`}</span>
        )}
      </div>

      {people}

      {/* Phones: the scoreboard is a strip under the game; a tap opens all of it. */}
      {scores && (
        <>
          <ScoreStrip players={players} viewerId={viewerId} disabled={display} room={room} onOpen={() => setBoardOpen(true)} />
          <Modal open={boardOpen} title="Marcador" size="sm" className="tv-score-modal" onClose={() => setBoardOpen(false)}>
            <span className="tv-party-status-pill">{statusLine}</span>
            {people}
          </Modal>
        </>
      )}
    </aside>
  );
}
