import { useLayoutEffect, useRef } from "react";
import AppIcon from "./AppIcon.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import { joinNames, waitingNames } from "./WaitingPill.jsx";
import { MATCH_KINDS } from "./matchInfo.js";
import { findMode } from "../../modes/index.js";

import { translate as tr } from "../../lib/i18n.js";
// The pieces every game's match shares (the "Partidas" boards of the redesign): the round's card in the game's colour
// (`MatchCard`), the bar at the bottom (`MatchBar`: who's in, who's still missing and the match's tools) and
// what goes on the top bar (`matchTitle`, the game and its mode). The scoreboard is PartyPanel's (`scores`).

/** The game's colour class (`tv-c-*`) and icon, from the room's game. */
export function gameLook(room) {
  const mode = findMode(room?.game) || {};
  return { color: mode.color || "quiz", icon: mode.icon || "bulb", name: mode.name || "" };
}

/**
 * The round's card, in the game's colour: on its first row the game and how this round is played ("Trivia · Abiertas",
 * on a pill with the game's icon; the top bar doesn't say it), a tiebreak's `tag` ("Desempate") and any `pills` (the
 * round's result goes there too: `RoundVerdict`); the question (children), with `media` beside it (a flag, a
 * silhouette, the song's bars), and the clock's bar under it. No line saying what to do: the question and the answers
 * say it. Two sizes, each always as tall: the normal one, and `small` for the games played on a map or a board, which
 * need the room. The text never changes at the reveal: only the result is added on the first row.
 */
export function MatchCard({ room, tag = null, pills = null, seconds, pct = 100, urgent = false, small = false, media = null, mark = null, className = "", children }) {
  // From the second round on nothing flies in again: the card and the panels under it stay where they are and only
  // their content fades in (look.css, html.tv-round-next). The first round of a match keeps the full entrance.
  const nextRound = (room.currentRound || 0) > 0;
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("tv-round-next", nextRound);
    return () => root.classList.remove("tv-round-next");
  }, [nextRound]);
  const { color, icon: gameIcon, name } = gameLook(room);
  const mode = matchMode(room);
  const counting = room.phase === "countdown";
  const classes = ["tv-qc", `tv-c-${color}`, small && "tv-qc--small", room.phase === "reveal" && "is-reveal", className].filter(Boolean).join(" ");
  return (
    <section className={classes}>
      <Icon name={gameIcon} size={220} strokeWidth={1.5} className="tv-qc-mark" />
      <div className="tv-qc-head">
        <span className="tv-qc-pill tv-qc-topic">
          <Icon name={gameIcon} size={16} strokeWidth={2.6} />
          <span className="tv-qc-topic-text">{mode ? `${name} · ${mode}` : name}</span>
        </span>
        {tag && <span className="tv-qc-pill is-dark">{tag}</span>}
        {pills}
        {/* On screen the time is only the bar under the card; screen readers can still ask for it. */}
        <span className="tv-sr-only" role="timer">
          {counting ? tr("Empieza en {v0}", { v0: Math.max(1, seconds) }) : room.phase === "reveal" ? tr("Respuesta") : tr("{n} segundos", { n: seconds })}
        </span>
      </div>
      <div className="tv-qc-body">
        {media && <div className="tv-qc-media">{media}</div>}
        {children}
      </div>
      <div className="tv-qc-timer" aria-hidden="true">
        <i className={urgent ? "is-urgent" : ""} style={{ width: `${pct}%` }} />
        {/* A small notch on the bar at a moment of the round (Letra: where the song is cut), with nothing written. */}
        {mark != null && <b className="tv-qc-timer-mark" style={{ left: `${Math.max(0, Math.min(100, mark))}%` }} />}
      </div>
    </section>
  );
}

/**
 * The countdown before a round, the same in every game: only the number, big, in the game's colour, in the middle of
 * the panel where the round is answered (over its options, box, map, board or sky, already in their place), with no
 * words around it. The card's clock already tells screen readers ("Empieza en 3").
 */
export function RoundCountdown({ room, seconds }) {
  if (room?.phase !== "countdown") return null;
  const n = Math.max(1, seconds);
  return (
    <div className={`tv-round-count tv-c-${gameLook(room).color}`} aria-hidden="true">
      <span key={n} className="tv-round-count-num">{n}</span>
    </div>
  );
}

const VERDICT_ICONS = { ok: "check", near: "target", bad: "close", timeout: "hash" };

/**
 * How the round went for this player, on the card's first row (MatchCard `pills`), the same in every game: what happened
 * ("¡Correcto!", in white with green letters; red when wrong) and, apart, the points ("+900") and the streak (no
 * confetti here: it is kept for the end of the match). On a
 * phone the topic and the streak step aside at the reveal so this never gets cut (look.css).
 */
export function RoundVerdict({ tone = "ok", label, points = null, streak = 0, icon }) {
  return (
    <>
      <span className={`tv-qc-verdict is-${tone}`} role="status">
        <Icon name={icon || VERDICT_ICONS[tone] || "check"} size={16} strokeWidth={3.2} />
        {label}
      </span>
      {points != null && <span className="tv-qc-points">{typeof points === "number" ? `+${points}` : points}</span>}
      {streak > 1 && <span className="tv-qc-streak">{tr("Racha de")} {streak}</span>}
    </>
  );
}

/**
 * The answer at the end of a round, one card for every game: what it is (`label`: "La respuesta", "La canción"), the
 * answer big (`value`), an optional line under it (`detail`) and how it went for this player (`mine`, green or red).
 * `media` goes on its left (a song's cover). It takes the place of the box to write in, of the number, or floats over a
 * map or a board (`floating`).
 */
export function AnswerCard({ label, value, detail = null, media = null, mine = null, mineOk = false, icon = null, iconTone = null, floating = false }) {
  const tone = iconTone || (mine ? (mineOk ? "ok" : "bad") : "");
  const card = (
    <div className={`tv-acard${floating ? " is-floating" : ""}`} role="status">
      {media && <span className="tv-acard-media">{media}</span>}
      {!media && icon && (
        <span className={`tv-acard-icon${tone ? ` is-${tone}` : ""}`}>
          <Icon name={icon} size={24} strokeWidth={2.8} />
        </span>
      )}
      <span className="tv-acard-text">
        {label && <span className="tv-acard-label">{label}</span>}
        <strong className="tv-acard-value">{value}</strong>
        {detail && <span className="tv-acard-detail">{detail}</span>}
        {mine && (
          <span className={`tv-acard-mine ${mineOk ? "is-ok" : "is-bad"}`}>
            <Icon name={mineOk ? "check" : "close"} size={15} strokeWidth={3} />
            {mine}
          </span>
        )}
      </span>
    </div>
  );
  return floating ? <div className="tv-acard-float">{card}</div> : card;
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

/** "Falta Lynz por responder", "Faltan Pablo y Lynz por responder", "Faltan 3 por responder" (you by your name too):
 * the same words in every game. */
function missingLine(room) {
  if (room.phase === "countdown") return tr("Prepárense: la ronda empieza en un momento");
  if (room.phase === "reveal") return tr("Mira cómo les fue a todos");
  if (room.phase !== "playing") return "";
  const names = waitingNames(room, null);
  if (!names.length) return tr("Ya respondieron todos");
  if (names.length > 2) return tr("Faltan {length} por responder", { length: names.length });
  return tr(names.length === 1 ? tr("Falta {names} por responder") : tr("Faltan {names} por responder"), { names: joinNames(names) });
}

/**
 * The bar at the bottom of a match: everyone's face (a green mark once they answered), who the round still waits for,
 * and the match's tools (Reportar, Saltar, Pausar, Terminar: `tools`). `line` replaces the waiting line for a
 * game that says it its own way.
 */
export function MatchBar({ room, viewerId, tools, line }) {
  const players = room.players.filter((p) => !p.spectator);
  const text = line ?? missingLine(room);
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

// Two or more who got to the games it takes to win at the same time: this game breaks the tie.
export const isTiebreak = (room) => Boolean(room.intro?.winsToWin) && Math.max(0, ...room.players.map((p) => p.wins || 0)) >= room.intro.winsToWin;

// What the intro's top line says: what kind of match it is and which game this is ("Clásico" and "Juego 3").
function introLine(room) {
  const intro = room.intro;
  const kind = MATCH_KINDS[room.matchmaking?.kind];
  // A Clásico of a private room: its name and colour instead of the public match's. The roulette's public match is
  // the Clásico too; a game searched for by name, its kind's ("Partida casual").
  const classic = findMode(room.run?.classic);
  const label = classic?.fullName || (intro.winsToWin ? tr("Clásico") : kind ? tr("Partida {kind}", { kind: tr(kind.name).toLowerCase() }) : null);
  const total = variantsOf(intro).length;
  // One game alone isn't "Juego 1 de 1": only what kind of match it is.
  if (total === 1 && !intro.winsToWin) return { label: null, now: label || tr("Partida privada") };
  return { label, now: isTiebreak(room) ? tr("Juego de desempate") : intro.winsToWin ? tr("Juego {n}", { n: intro.index + 1 }) : tr("Juego {v0} de {total}", { v0: intro.index + 1, total: total }) };
}

/**
 * On the top bar before each game, in the same places as a round's: on a chip what's being played (a Clásico's in the
 * logo's look), then which game of the match this is and one segment per game so far. A phone has no room for the chip:
 * its name goes on that line, the part cut with "…" when it doesn't fit.
 */
export function IntroInfo({ room }) {
  const games = variantsOf(room.intro);
  const { label, now } = introLine(room);
  const classic = Boolean(room.intro.winsToWin || findMode(room.run?.classic));
  const { color, icon, name } = gameLook(room);
  return (
    <>
      <span className={`tv-chip tv-chip--game ${classic ? "is-classic" : `tv-c-${color}`}`}>
        {classic ? <AppIcon small /> : <Icon name={icon} size={20} strokeWidth={2.4} />}
        <span className="tv-chip-name">{classic ? label : name}</span>
      </span>
      <span className="tv-topbar-round">
        <span className="tv-topbar-round-row">
          <span className="tv-topbar-round-game">{label}</span>
          <span className="tv-topbar-round-now">
            {label && <span className="tv-topbar-round-dot"> · </span>}
            {now}
          </span>
        </span>
        <span className="tv-rounds" aria-hidden="true">
          {games.map((g, i) => (
            <i key={i} className={i < room.intro.index ? "is-done" : i === room.intro.index ? "is-now" : ""} />
          ))}
        </span>
      </span>
    </>
  );
}

/** The way this round is played, for the top bar's chip ("Trivia · Cerradas"); "" for a game with a single one. */
export function matchMode(room) {
  switch (room?.game) {
    case "opciones":
      return !room.question ? "" : room.question.type === "open" ? tr("Abiertas") : tr("Cerradas");
    case "musica":
      return room.lyrics ? tr("Letra") : tr("Título");
    case "mundo":
      return { nombre: tr("Nombre"), sombra: tr("Sombra"), bandera: tr("Bandera") }[room.question?.style] || "";
    case "historia":
      return tr("Cifras");
    case "minas":
      return tr("Carrera");
    default:
      return "";
  }
}
