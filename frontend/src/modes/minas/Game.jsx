import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import SpectatorBanner from "../../components/home/SpectatorBanner.jsx";
import { useApp, useRemainingMs } from "../../lib/store.jsx";
import { findDifficulty, hitsText, minesConfig } from "./minesInfo.js";
import "../../styles/home.css";
import "../../styles/quiz.css";
import "../../styles/mines.css";
import { PauseButton, PauseVeil } from "../../components/home/PauseControls.jsx";

const COUNTDOWN_MS = 3000;
const CELLS = 25;
// One colour per player for the cells they picked (never the green and red of right and mine, nor the white of this
// player's own cells).
const PLAYER_COLORS = ["#ffb52e", "#a58bff", "#2ea8ff", "#f2456b", "#14b8a6", "#ff9f1c", "#e879f9", "#7c80ff"];
const MY_COLOR = "#ffffff";

// "Ana", "Ana y Luis", "Ana, Luis y Eva".
function joinNames(names) {
  if (names.length < 2) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

// Long words get soft hyphens between their syllables (Ro·man·ti·cis·mo), so a narrow cell splits them where a person
// would, with a hyphen, instead of at any letter. A rough Spanish rule: a syllable starts at a consonant followed by a
// vowel, or at a pair that goes together (br, cl, tr, ch, ll...); never in the first or last two letters.
const VOWEL = /[aeiouáéíóúü]/;
const LETTER = /\p{L}/u;
const PAIRS = new Set(["bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "kl", "kr", "pl", "pr", "tr", "ch", "ll", "rr"]);
// Invisible unless the line breaks there, where it shows as "-".
const SOFT_HYPHEN = String.fromCharCode(0xad);
function hyphenateWord(word) {
  if (word.length < 8) return word;
  const w = word.toLowerCase();
  let out = word.slice(0, 2);
  for (let i = 2; i < word.length; i += 1) {
    const [prev, c, next] = [w[i - 1], w[i], w[i + 1] || ""];
    const startsSyllable =
      i <= word.length - 2 &&
      LETTER.test(c) &&
      LETTER.test(prev) &&
      !VOWEL.test(c) &&
      (VOWEL.test(next) || PAIRS.has(c + next)) &&
      (VOWEL.test(prev) || !PAIRS.has(prev + c));
    out += (startsSyllable ? SOFT_HYPHEN : "") + word[i];
  }
  return out;
}
const hyphenate = (text) => text.split(" ").map(hyphenateWord).join(" ");

// How long a cell's text is (is-long, is-xlong) and its longest word (is-word, is-xword), so the longest ones get a
// smaller letter and still fit their square; long words only matter on a phone's narrow cells (styles/mines.css).
function sizeClass(text) {
  const word = Math.max(...text.split(/\s+/).map((w) => w.length));
  let out = text.length > 30 ? " is-xlong" : text.length > 18 ? " is-long" : "";
  if (word > 11) out += " is-xword";
  else if (word > 8) out += " is-word";
  return out;
}

function GameScreen() {
  const { code } = useParams();
  const { user, room, joinRoom, pickCell, setGame } = useApp();
  const nav = useNavigate();

  const left = useRemainingMs(room);
  const [err, setErr] = useState("");
  // The cell this player tapped, shown straight away (before the server answers): { round, turn, cell }.
  const [picked, setPicked] = useState(null);
  // Host's "Terminar" mid-match needs a second tap, since it ends the match for everyone.
  const [confirmHub, setConfirmHub] = useState(false);
  const sending = useRef(false);
  // The turn on screen right now, for replies that arrive after it closed (their errors no longer matter).
  const turnRef = useRef(null);

  // Join the room after a reload. Going back to the room screen is handled by RoomNavigator (App.jsx).
  useEffect(() => {
    if (!room || room.code !== code) joinRoom(code).catch(() => nav("/"));
  }, [code]);

  useEffect(() => {
    if (!confirmHub) return undefined;
    const t = setTimeout(() => setConfirmHub(false), 3000);
    return () => clearTimeout(t);
  }, [confirmHub]);

  const round = room?.currentRound;
  const phase = room?.phase;
  const question = room?.question;
  const turn = question?.turn ?? null;
  turnRef.current = phase === "playing" ? turn : null;
  const cells = question?.cells || null;
  const me = room?.players?.find((p) => p.id === user?.id);
  // In a race ("carrera") there are no turns: each player picks as many cells as they like until they step on a mine.
  // Each round has its own way, when both are ticked.
  const race = question?.style === "carrera";
  // Joined mid-match: watches the board and plays from the next match.
  const spectator = Boolean(me?.spectator);
  const out = phase === "playing" ? me?.out || null : null;
  const myPick = picked && picked.round === round && picked.turn === turn ? picked.cell : null;
  const pickedThisTurn = !race && (Boolean(me?.answered) || myPick != null);
  const canPick = phase === "playing" && Boolean(cells) && !spectator && !out && !pickedThisTurn;

  useEffect(() => setErr(""), [round, phase, turn]);
  // A failed pick (someone was faster) shows for a moment in the top card, then what to do comes back.
  useEffect(() => {
    if (!err) return undefined;
    const t = setTimeout(() => setErr(""), 2500);
    return () => clearTimeout(t);
  }, [err]);

  // The match is one frame as tall as the screen under the top bar (see .tv-mines-frame), so the whole board shows
  // without scrolling; --mines-top is where the frame starts on the page. Big screens don't need it: the room's frame
  // already fills the window.
  const frameRef = useRef(null);
  const hasGame = Boolean(room) && room.phase !== "finished";
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!hasGame || !el) return undefined;
    const measure = () => el.style.setProperty("--mines-top", `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [hasGame]);

  // Whoever scrolled away (to the scoreboard on a phone, or on the results) is brought back to the board as a round
  // counts down.
  useEffect(() => {
    if (phase === "countdown" && window.scrollY > 4) window.scrollTo({ top: 0 });
  }, [phase, round]);

  async function choose(index) {
    if (!canPick || sending.current || cells[index]?.by) return;
    sending.current = true;
    setPicked({ round, turn, cell: index });
    setErr("");
    try {
      await pickCell({ cell: index, turn });
    } catch (e) {
      setPicked(null);
      if (turnRef.current === turn) setErr(e.message || "No se pudo elegir la casilla");
    } finally {
      sending.current = false;
    }
  }

  function backToHub() {
    if (!confirmHub) {
      setConfirmHub(true);
      return;
    }
    setConfirmHub(false);
    setGame(null).catch((e) => setErr(e.message || "No se pudo volver a la sala"));
  }

  if (!room) {
    return (
      <div className="tv-card tv-lobby-guest">
        <p className="tv-party-status">
          <span className="tv-pulse" aria-hidden="true" />
          Conectando a la partida…
        </p>
      </div>
    );
  }

  if (phase === "finished" && room.results) return <MatchResults room={room} color="mines" />;

  const isHost = room.hostId === user?.id;
  // A turn's length, from the phase itself: the first turn of a round is longer than the others.
  const totalMs = room.phaseEndsAt && room.phaseStartedAt ? room.phaseEndsAt - room.phaseStartedAt : minesConfig(room).turnMs;
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const pct =
    phase === "playing"
      ? Math.max(0, Math.min(100, (left / totalMs) * 100))
      : phase === "countdown"
      ? Math.max(0, Math.min(100, (left / COUNTDOWN_MS) * 100))
      : 100;
  const urgent = phase === "playing" && left <= (race ? 5000 : 3000);
  const level = findDifficulty(question?.difficulty);
  const reveal = phase === "reveal";
  const playerIndex = (id) => Math.max(0, room.players.findIndex((p) => p.id === id));
  const colorOf = (id) => (id === user?.id ? MY_COLOR : PLAYER_COLORS[playerIndex(id) % PLAYER_COLORS.length]);
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || "Jugador";
  const toFind = question ? question.total - question.found : 0;
  const standing = room.players.filter((p) => p.connected && !p.spectator && !p.out);
  const waitingFor = standing.filter((p) => !p.answered && p.id !== user?.id).map((p) => p.name);
  const myHits = cells ? cells.filter((c) => c.correct && c.by === user?.id).length : 0;
  const last = round + 1 >= room.totalRounds;

  // The top card's last line: what to do now (with an icon, and red when this player is out or a pick failed).
  let hint;
  let hintIcon = "bolt";
  let hintTone = "";
  if (err) {
    hint = err;
    hintIcon = "close";
    hintTone = " is-out";
  } else if (phase === "countdown") {
    hint = race
      ? "Sin turnos: elige todas las correctas que puedas. Si pisas una mina, fuera."
      : "Una casilla por turno. Si pisas una mina, quedas fuera hasta la próxima ronda.";
    hintIcon = "bomb";
  } else if (reveal) {
    hint = `${question ? `${question.found} de ${question.total} encontrados. ` : ""}${last ? "Calculando resultados…" : "Siguiente ronda en breve…"}`;
    hintIcon = "check";
  } else if (spectator) {
    hint = "Estás viendo la partida. Jugarás en la siguiente.";
    hintIcon = "info";
  } else if (out) {
    hint = out === "mina" ? "¡Pisaste una mina! Estás fuera hasta la próxima ronda." : "Se te acabó el tiempo. Estás fuera hasta la próxima ronda.";
    hintIcon = out === "mina" ? "bomb" : "close";
    hintTone = " is-out";
  } else if (race) {
    hint = myHits ? `Llevas ${hitsText(myHits)}. ¡Sigue antes de que te las quiten!` : "¡Rápido! Elige todas las correctas que puedas.";
    if (myHits) {
      hintIcon = "check";
      hintTone = " is-sent";
    }
  } else if (pickedThisTurn) {
    hint = waitingFor.length ? `Elegiste. Esperando a ${joinNames(waitingFor)}…` : "Elegiste. Siguiente turno…";
    hintIcon = "check";
    hintTone = " is-sent";
  } else {
    hint = `Turno ${turn}: elige una casilla.`;
  }

  return (
    <div className="tv-room tv-game tv-mines">
      <div ref={frameRef} className="tv-room-main tv-game-main tv-mines-frame">
        {spectator && <SpectatorBanner />}
        {/* The top card, like the one of Encuentra el país: the round, the topic and its difficulty; the prompt; and
            what to do now. Always three lines, so the board under it never moves. */}
        <section className="tv-game-top">
          <div className="tv-game-round tv-mines-find">
            <p className="tv-mono-label">
              Ronda {round + 1} de {room.totalRounds}
              {question ? ` · ${question.category} · ${level.label}` : " · Campo de minas"}
            </p>
            <h1 key={round} className={`tv-card-title tv-mines-prompt${question?.prompt?.length > 40 ? " is-long" : ""}`}>
              {question?.prompt || "Prepárate…"}
            </h1>
            <p key={`${phase}-${turn}-${hintIcon}-${myHits}`} className={`tv-hint tv-mines-hint${hintTone}`} role="status">
              <Icon name={hintIcon} size={15} strokeWidth={2.8} />
              <span>{hint}</span>
            </p>
          </div>

          <div className={`tv-clock${urgent ? " is-urgent" : ""}`} role="timer" aria-label={`${seconds} segundos`}>
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle className="tv-clock-track" cx="22" cy="22" r="19" />
              <circle className="tv-clock-fill" cx="22" cy="22" r="19" style={{ strokeDashoffset: 119.4 * (1 - pct / 100) }} />
            </svg>
            <span key={seconds} className="tv-clock-num">{seconds}</span>
          </div>

          <div className="tv-game-tools">
            <PauseButton room={room} isHost={isHost} onError={setErr} />
            {isHost && (
              <button
                type="button"
                className={`tv-mini-btn${confirmHub ? " is-on" : ""}`}
                onClick={backToHub}
                title="Termina la partida y lleva a todos al inicio"
              >
                {confirmHub ? "¿Seguro? Toca otra vez" : "Terminar"}
              </button>
            )}
          </div>

          <div className="tv-timer" aria-hidden="true">
            <span className={`tv-timer-fill${urgent ? " is-urgent" : ""}`} style={{ width: `${pct}%` }} />
          </div>
        </section>

        {question ? (
          <section key={round} className="tv-game-stage tv-mines-stage">
            <PauseVeil room={room} isHost={isHost} />
            {/* One row over the board, always as tall: the board's counters, and at the reveal how this player's
                round went. */}
            <div className="tv-mines-bar">
              {reveal && !spectator ? (
                <Verdict me={me} />
              ) : (
                <div className="tv-mines-chips" aria-live="polite">
                  <span className="tv-match-chip tv-mines-count">
                    <Icon name="check" size={14} strokeWidth={3} />
                    {reveal ? `${question.found} de ${question.total} encontrados` : `${toFind} por encontrar`}
                  </span>
                  <span className="tv-match-chip tv-mines-count">
                    <Icon name="bomb" size={14} strokeWidth={2.6} />
                    {CELLS - question.total} minas
                  </span>
                  {phase === "playing" && (
                    <span className="tv-match-chip tv-mines-count">
                      <Icon name="users" size={14} strokeWidth={2.6} />
                      {standing.length} en pie
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className={`tv-mines-board${reveal ? " is-reveal" : ""}`} role="group" aria-label="Tablero">
              {cells
                ? cells.map((c, i) => {
                    const mine = myPick === i && !c.by;
                    const owned = Boolean(c.by);
                    let state = "";
                    if (owned) state = c.correct ? " is-hit" : " is-mine";
                    else if (reveal) state = c.correct ? " is-missed" : " is-buried";
                    else if (mine) state = " is-pending";
                    else if (!canPick && !spectator) state = " is-locked";
                    const label = owned
                      ? `${c.text}: ${c.correct ? "correcta" : "mina"}, de ${nameOf(c.by)}`
                      : reveal
                      ? `${c.text}: ${c.correct ? "correcta, nadie la encontró" : "mina"}`
                      : c.text;
                    return (
                      <button
                        key={`${round}-${i}`}
                        type="button"
                        className={`tv-mines-cell${state}${sizeClass(c.text)}`}
                        style={{ "--i": i, "--owner": owned ? colorOf(c.by) : undefined }}
                        onClick={() => choose(i)}
                        disabled={!canPick || owned}
                        aria-label={label}
                      >
                        <span className="tv-mines-cell-text">{hyphenate(c.text)}</span>
                        {(owned || reveal) && (
                          <span className="tv-mines-cell-mark" aria-hidden="true">
                            <Icon name={c.correct ? "check" : "bomb"} size={14} strokeWidth={c.correct ? 3.4 : 2.6} />
                          </span>
                        )}
                        {owned && (
                          <span className="tv-mines-owner" aria-hidden="true" title={nameOf(c.by)}>
                            {nameOf(c.by).slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </button>
                    );
                  })
                : Array.from({ length: CELLS }, (_, i) => <div key={i} className="tv-mines-cell is-waiting" style={{ "--i": i }} aria-hidden="true" />)}
              {phase === "countdown" && (
                <div className="tv-mines-countdown">
                  <span key={Math.max(1, seconds)} className="tv-quiz-count" aria-label={`Empieza en ${Math.max(1, seconds)}`}>
                    {Math.max(1, seconds)}
                  </span>
                </div>
              )}
            </div>

          </section>
        ) : (
          <section className="tv-game-stage tv-countdown">
            <PauseVeil room={room} isHost={isHost} />
            <p className="tv-party-status">
              <span className="tv-pulse" aria-hidden="true" />
              Cargando el tablero…
            </p>
          </section>
        )}
      </div>

      <PartyPanel room={room} scores onToast={setErr} />
    </div>
  );
}

// The end of a round: whether this player survived, how many right answers they found and their points.
function Verdict({ me }) {
  const answer = me?.lastAnswer;
  const hits = answer?.hits || 0;
  let tone;
  let icon;
  let title;
  let detail;
  if (answer?.hits == null) {
    tone = "timeout";
    icon = "hash";
    title = "Miraste esta ronda";
    detail = "Juegas desde la siguiente";
  } else if (answer.out === "mina") {
    tone = "bad";
    icon = "bomb";
    title = "¡Pisaste una mina!";
  } else if (answer.out === "tiempo") {
    tone = "timeout";
    icon = "close";
    title = "Se te acabó el tiempo";
  } else {
    tone = "ok";
    icon = "check";
    title = "¡Sobreviviste!";
  }
  return (
    <div className={`tv-mines-verdict tv-mines-verdict--${tone}`} role="status">
      {tone === "ok" && hits > 0 && <Confetti pieces={18} />}
      <span className="tv-mines-verdict-icon">
        <Icon name={icon} size={22} strokeWidth={2.8} />
      </span>
      <span className="tv-mines-verdict-text">
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {hits > 0 && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0}</span>}
    </div>
  );
}

export default function Game() {
  return (
    <TvShell mode="minas">
      <GameScreen />
    </TvShell>
  );
}
