import { useLayoutEffect, useRef } from "react";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import { joinNames, waitingNames } from "./WaitingPill.jsx";
import { MATCH_KINDS } from "./matchInfo.js";
import { findMode } from "../../modes/index.js";

// The pieces every game's match shares (the "Partidas" boards of the redesign): the round's card in the game's colour
// (`MatchCard`), the bar at the bottom (`MatchBar`: who's in, who's still missing and the match's tools) and
// what goes on the top bar (`matchTitle`, the game and its mode). The scoreboard is PartyPanel's (`scores`).

// Each topic's icon on a card's pill (Trivia's, Rey's).
const TOPIC_ICONS = { geografía: "landmark", historia: "scroll", música: "music", "películas y series": "film", deportes: "target", ciencia: "bolt", arte: "pencil", literatura: "scroll", videojuegos: "grid", cultura: "bulb" };
export const topicIcon = (category) => TOPIC_ICONS[String(category || "").toLowerCase()] || "bulb";

/** The game's colour class (`tv-c-*`) and icon, from the room's game. */
export function gameLook(room) {
  const mode = findMode(room?.game) || {};
  return { color: mode.color || "quiz", icon: mode.icon || "bulb", name: mode.name || "" };
}

/** What to do in the round. What comes after a " · " (how the points go) is the first thing to go where there's little
 * room: phones show only the first part (look.css), so the line is never cut. */
function CardDirection({ dir }) {
  if (typeof dir !== "string" || !dir.includes(" · ")) return <span className="tv-qc-dir">{dir}</span>;
  const [first, ...rest] = dir.split(" · ");
  return (
    <span className="tv-qc-dir">
      {first}
      <span className="tv-qc-dir-more"> · {rest.join(" · ")}</span>
    </span>
  );
}

/**
 * The round's card, in the game's colour: on its first row the round's mode or topic (`label`, with its `icon`), any
 * `pills`, and under them what to do (`dir`); the question (children) and the clock's bar under it. One fixed height for
 * every game and round (`.tv-qc`), so the card never changes size.
 */
export function MatchCard({ room, label, icon, pills = null, dir, seconds, pct = 100, urgent = false, className = "", children }) {
  const { color, icon: gameIcon } = gameLook(room);
  const counting = room.phase === "countdown";
  return (
    <section className={`tv-qc tv-c-${color} ${className}`.trim()}>
      <Icon name={gameIcon} size={220} strokeWidth={1.5} className="tv-qc-mark" />
      <div className="tv-qc-head">
        {label && (
          <span className="tv-qc-pill tv-qc-topic">
            {icon && <Icon name={icon} size={16} strokeWidth={2.6} />}
            <span className="tv-qc-topic-text">{label}</span>
          </span>
        )}
        {pills}
        {/* On screen the time is only the bar under the card; screen readers can still ask for it. */}
        <span className="tv-sr-only" role="timer">
          {counting ? `Empieza en ${Math.max(1, seconds)}` : room.phase === "reveal" ? "Respuesta" : `${seconds} segundos`}
        </span>
        {dir && <CardDirection dir={dir} />}
      </div>
      <div className="tv-qc-body">{children}</div>
      <div className="tv-qc-timer" aria-hidden="true">
        <i className={urgent ? "is-urgent" : ""} style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}

// The smallest a question gets to fit its card (px).
const QUESTION_MIN = 14;

/**
 * The question's text inside the card, always whole: at the card's size for it (`.tv-qc-q`), or as much smaller as it takes
 * for all of it to fit in the room the card has. A new text or another size of the card (the keyboard coming up) fits it again.
 */
export function MatchQuestion({ children }) {
  const ref = useRef(null);
  const text = String(children);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.closest(".tv-qc-body");
    if (!el || !box) return undefined;
    const fit = () => {
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (size > QUESTION_MIN && el.offsetHeight > box.clientHeight) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    // The site's font arriving late changes how much room the text takes.
    let live = true;
    document.fonts?.ready?.then(() => live && fit());
    const seen = new ResizeObserver(fit);
    seen.observe(box);
    return () => {
      live = false;
      seen.disconnect();
    };
  }, [text]);
  return (
    <h2 ref={ref} className="tv-qc-q">
      {children}
    </h2>
  );
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
 * and the match's tools (Reportar, Saltar, Pausar, Terminar: `tools`). `line` replaces the waiting line for a
 * game that says it its own way.
 */
export function MatchBar({ room, viewerId, tools, verb = "responder", line }) {
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
        {tools}
      </div>
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

// The match's games in play order: each game with its one way ("trivia-cerradas"); an older server only sends the games.
export const variantsOf = (intro) => intro.variants || intro.games;

// What the intro's top line says: what kind of match it is and which game this is ("Clásico · Juego 3").
export function introLine(room) {
  const intro = room.intro;
  const kind = MATCH_KINDS[room.matchmaking?.kind];
  // A Clásico of a private room: its name and colour instead of the public match's. The roulette's public match is
  // the Clásico too; a game searched for by name, its kind's ("Partida casual").
  const classic = findMode(room.run?.classic);
  const label = classic?.fullName || (intro.winsToWin ? "Clásico" : kind ? `Partida ${kind.name.toLowerCase()}` : null);
  const total = variantsOf(intro).length;
  // Two or more who got to the games it takes to win at the same time: this game breaks the tie.
  const tiebreak = Boolean(intro.winsToWin) && Math.max(0, ...room.players.map((p) => p.wins || 0)) >= intro.winsToWin;
  // One game alone isn't "Juego 1 de 1": only what kind of match it is.
  if (total === 1 && !intro.winsToWin) return label || "Partida privada";
  return `${label ? `${label} · ` : ""}${tiebreak ? "Juego de desempate" : intro.winsToWin ? `Juego ${intro.index + 1}` : `Juego ${intro.index + 1} de ${total}`}`;
}

/** On a phone's top bar, in the same place a round says which it is: the intro's line and one segment per game so far. */
export function IntroInfo({ room }) {
  const games = variantsOf(room.intro);
  return (
    <span className="tv-topbar-round tv-topbar-round--intro">
      <span className="tv-topbar-round-row">
        <span className="tv-topbar-round-game">{introLine(room)}</span>
      </span>
      <span className="tv-rounds" aria-hidden="true">
        {games.map((g, i) => (
          <i key={i} className={i < room.intro.index ? "is-done" : i === room.intro.index ? "is-now" : ""} />
        ))}
      </span>
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
