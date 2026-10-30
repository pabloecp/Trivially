import { useState } from "react";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import { ChatSheet, useChatUnread } from "./RoomChat.jsx";
import { joinNames, waitingNames } from "./WaitingPill.jsx";
import { findMode } from "../../modes/index.js";

// The pieces every game's match shares (the "Partidas" boards of the redesign): the round's card in the game's colour
// (`MatchCard`), the bar at the bottom (`MatchBar`: who's in, who's still missing, the chat and the match's tools) and
// what goes on the top bar (`matchTitle`, the game and its mode). The scoreboard is PartyPanel's (`scores`).

// Each topic's icon on a card's pill (Trivia's, Rey's).
const TOPIC_ICONS = { geografía: "landmark", historia: "scroll", música: "music", "películas y series": "film", deportes: "target", ciencia: "bolt", arte: "pencil", literatura: "scroll", videojuegos: "grid", cultura: "bulb" };
export const topicIcon = (category) => TOPIC_ICONS[String(category || "").toLowerCase()] || "bulb";

/** The game's colour class (`tv-c-*`) and icon, from the room's game. */
export function gameLook(room) {
  const mode = findMode(room?.game) || {};
  return { color: mode.color || "quiz", icon: mode.icon || "bulb", name: mode.name || "" };
}

/**
 * The round's card, in the game's colour: on its first row the round's mode or topic (`label`, with its `icon`), any
 * `pills`, the time left on the right and under them what to do (`dir`); the question (children) at the bottom and the
 * clock's bar under it. Three fixed heights (`size` s, m, l) so a game's card never changes size between rounds.
 */
export function MatchCard({ room, label, icon, pills = null, dir, seconds, pct = 100, urgent = false, size = "m", className = "", children }) {
  const { color, icon: gameIcon } = gameLook(room);
  const counting = room.phase === "countdown";
  return (
    <section className={`tv-qc tv-qc--${size} tv-c-${color} ${className}`.trim()}>
      <Icon name={gameIcon} size={220} strokeWidth={1.5} className="tv-qc-mark" />
      <div className="tv-qc-head">
        {label && (
          <span className="tv-qc-pill">
            {icon && <Icon name={icon} size={16} strokeWidth={2.6} />}
            {label}
          </span>
        )}
        {pills}
        <span className={`tv-qc-time${urgent ? " is-urgent" : ""}`} role="timer" aria-label={counting ? `Empieza en ${seconds}` : `${seconds} segundos`}>
          {counting ? `Empieza en ${Math.max(1, seconds)}` : room.phase === "reveal" ? "Respuesta" : `${seconds} s`}
        </span>
        {dir && <span className="tv-qc-dir">{dir}</span>}
      </div>
      <div className="tv-qc-body">{children}</div>
      <div className="tv-qc-timer" aria-hidden="true">
        <i className={urgent ? "is-urgent" : ""} style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}

/** The question's text inside the card, its size picked by how long it is. */
export function MatchQuestion({ children, big = false }) {
  const text = typeof children === "string" ? children : "";
  const long = text.length > 90 ? " is-long" : text.length > 60 ? " is-mid" : "";
  return <h2 className={`tv-qc-q${big ? " is-big" : ""}${long}`}>{children}</h2>;
}

/** "Falta Lynz por responder", "Faltan Pablo y Lynz por confirmar", "Faltan 3 por responder" (you by your name too).
 * `verb` is the game's ("responder", "confirmar", "fijar", "votar"…). */
function missingLine(room, verb) {
  if (room.phase === "countdown") return "Prepárense: la ronda empieza en un momento";
  if (room.phase === "reveal") return "Mira cómo les fue a todos";
  if (room.phase !== "playing") return "";
  const names = waitingNames(room, null);
  if (!names.length) return "Ya respondieron todos";
  if (names.length > 2) return `Faltan ${names.length} por ${verb}`;
  return `${names.length === 1 ? "Falta" : "Faltan"} ${joinNames(names)} por ${verb}`;
}

/**
 * The bar at the bottom of a match: everyone's face (a green mark once they answered), who the round still waits for,
 * the chat and the match's tools (Reportar, Saltar, Pausar, Terminar: `tools`). `line` replaces the waiting line for a
 * game that says it its own way.
 */
export function MatchBar({ room, viewerId, tools, verb = "responder", line }) {
  const [chat, setChat] = useState(false);
  const unread = useChatUnread(room, chat);
  const players = room.players.filter((p) => !p.spectator);
  const text = line ?? missingLine(room, verb);
  return (
    <div className="tv-mbar">
      <div className="tv-mbar-who">
        <span className="tv-mbar-faces" aria-hidden="true">
          {players.slice(0, 6).map((p) => (
            <span key={p.id} className={`tv-mbar-face${p.id === viewerId ? " is-me" : ""}${p.answered ? " is-done" : ""}${p.connected ? "" : " is-away"}`}>
              <Avatar avatar={p.avatar} />
            </span>
          ))}
          {players.length > 6 && <span className="tv-mbar-more">+{players.length - 6}</span>}
        </span>
        {text && <span className="tv-mbar-text">{text}</span>}
      </div>
      <div className="tv-mbar-tools">
        <button type="button" className="tv-btn tv-btn--neutral tv-mbar-btn" onClick={() => setChat(true)} aria-label={unread ? `Chat: ${unread} mensajes nuevos` : "Abrir el chat"}>
          <Icon name="chat" size={20} strokeWidth={2.4} />
          <span className="tv-mbar-label">Chat</span>
          {unread > 0 && <span className="tv-chat-badge">{unread > 9 ? "9+" : unread}</span>}
        </button>
        {tools}
      </div>
      {chat && <ChatSheet room={room} onClose={() => setChat(false)} />}
    </div>
  );
}

/** The round's progress, on the top bar: "RONDA 4 DE 10" and one segment per round. */
export function RoundSegments({ room }) {
  const total = Math.max(1, room.totalRounds || 1);
  const now = Math.min(total - 1, Math.max(0, room.currentRound || 0));
  return (
    <span className="tv-rounds" aria-hidden="true">
      {Array.from({ length: Math.min(total, 30) }, (_, i) => (
        <i key={i} className={i < now ? "is-done" : i === now ? "is-now" : ""} />
      ))}
    </span>
  );
}

/** The way this round is played, for the top bar's chip ("Trivia · Cerradas"); "" for a game with a single one. */
export function matchMode(room) {
  switch (room?.game) {
    case "opciones":
      return !room.question ? "" : room.question.type === "open" ? "Abiertas" : "Cerradas";
    case "musica":
      return room.lyrics ? "Letra" : "Título";
    case "mundo":
      return { nombre: "Nombre", sombra: "Sombra", bandera: "Bandera" }[room.question?.style] || "";
    case "historia":
      return "Cifras";
    case "minas":
      return "Carrera";
    default:
      return "";
  }
}
