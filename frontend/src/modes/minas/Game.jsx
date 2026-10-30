import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import WaitingPill from "../../components/home/WaitingPill.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import SpectatorBanner from "../../components/home/SpectatorBanner.jsx";
import { ControllerBar, GetReady } from "../../components/home/CentralBits.jsx";
import { useApp, useRemainingMs, useView } from "../../lib/store.jsx";
import { findDifficulty, hitsText, minesConfig } from "./minesInfo.js";
import "../../styles/home.css";
import "../../styles/quiz.css";
import "../../styles/mines.css";
import { PauseButton, ReportButton, SkipButton, PauseVeil } from "../../components/home/PauseControls.jsx";
import { resolveCode } from "../../lib/hiddenCode.js";
import { MatchBar, MatchCard, MatchQuestion } from "../../components/home/MatchFrame.jsx";

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
  const { code: codeParam } = useParams();
  const { user, room, joinRoom, pickCell, restartGame } = useApp();
  // The address's code ("oculta" while it's hidden: this tab's room, lib/hiddenCode.js).
  const code = resolveCode(codeParam, room);
  const nav = useNavigate();
  // With a central device in the room, the prompt, everyone's picks and the scoreboard show there; the players'
  // phones only have the board to pick from (and what to do now).
  const { central, controller, viewerId } = useView(room);

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
  const me = room?.players?.find((p) => p.id === viewerId);
  // In a race ("carrera") there are no turns: each player picks as many cells as they like until they step on a mine.
  // Each round has its own way, when both are ticked.
  const race = question?.style === "carrera";
  // Joined mid-match: watches the board and plays from the next match.
  const spectator = Boolean(me?.spectator);
  // A tiebreak (a tie for first at the end): only the tied players pick, on a small board; the rest of the room watches.
  const tiebreak = room?.tiebreak || null;
  const watching = Boolean(tiebreak) && !tiebreak.playerIds.includes(viewerId);
  const out = phase === "playing" ? me?.out || null : null;
  const myPick = picked && picked.round === round && picked.turn === turn ? picked.cell : null;
  const pickedThisTurn = !race && (Boolean(me?.answered) || myPick != null);
  const canPick = phase === "playing" && Boolean(cells) && !spectator && !watching && !out && !pickedThisTurn && !central;

  useEffect(() => setErr(""), [round, phase, turn]);
  // What just happened shows for a moment in the middle of the board, like the countdown. This player stepping on a
  // mine or running out of time: straight away, with the round's points (and not again at the reveal). Someone else
  // stepping on one: a quieter card with their name. At the reveal, how the round went for whoever was still in.
  const [burst, setBurst] = useState(null);
  const burstTimer = useRef(null);
  const outShown = useRef(null);
  const othersOut = useRef({ round: null, ids: new Set() });
  function showBurst(next, ms) {
    clearTimeout(burstTimer.current);
    setBurst(next);
    burstTimer.current = setTimeout(() => setBurst(null), ms);
  }
  useEffect(() => () => clearTimeout(burstTimer.current), []);
  useEffect(() => {
    // In a tiebreak a player who stepped on a mine may come back for another turn, and step on one again.
    const key = tiebreak ? `${round}:${turn}` : round;
    if (!out || outShown.current === key) return;
    outShown.current = key;
    if (tiebreak) {
      showBurst({ key: `${round}:${turn}:me`, mine: true, tone: "mina", shake: true, icon: "bomb", title: "¡Pisaste una mina!", detail: "Si nadie acierta, vuelves a intentarlo" }, 2600);
      return;
    }
    showBurst({ key: `${round}:me`, mine: true, ...roundBurst({ ...me, lastPoints: roundPoints(me?.hits) }, question, { out, hits: me?.hits || 0 }) }, 2600);
  }, [out, round, turn]);
  // A tiebreak's turn where nobody found a right answer: whoever stepped on a mine plays another one.
  useEffect(() => {
    if (!tiebreak || phase !== "playing" || !turn || tiebreak.revivedTurn !== turn) return;
    const back = room.players.filter((p) => tiebreak.playerIds.includes(p.id) && p.connected && !p.out).map((p) => p.name);
    showBurst(
      { key: `${round}:${turn}:back`, tone: "other", icon: "users", title: "Nadie acertó", detail: `Vuelven ${joinNames(back)}. Las minas pisadas quedan a la vista.` },
      1800
    );
  }, [turn, tiebreak?.revivedTurn]);
  // Other players stepping on a mine in a race, unless this player's own card is showing. (By turns it isn't shown:
  // whoever waits sees who they wait for instead.)
  const fallen = phase === "playing" && race ? room?.players.filter((p) => p.id !== viewerId && p.out === "mina") || [] : [];
  const fallenKey = fallen.map((p) => p.id).join(",");
  useEffect(() => {
    if (othersOut.current.round !== round) othersOut.current = { round, ids: new Set() };
    const fresh = fallen.filter((p) => !othersOut.current.ids.has(p.id));
    fresh.forEach((p) => othersOut.current.ids.add(p.id));
    if (!fresh.length || phase !== "playing") return;
    setBurst((current) => {
      if (current?.mine) return current;
      clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(() => setBurst(null), 1800);
      return {
        key: `${round}:${fresh.map((p) => p.id).join(",")}`,
        tone: "other",
        icon: "bomb",
        title: fresh.length === 1 ? `${fresh[0].name} pisó una mina` : `${joinNames(fresh.map((p) => p.name))} pisaron una mina`,
        detail: fresh.length === 1 ? "Queda fuera de esta ronda" : "Quedan fuera de esta ronda",
      };
    });
  }, [fallenKey, round, phase]);
  useEffect(() => {
    if (phase !== "reveal") {
      if (phase !== "playing") setBurst(null);
      return;
    }
    // A tiebreak's end is for the whole room: who won it, who goes on to another one, or that the tie stands.
    if (tiebreak && question) {
      showBurst({ key: `${round}:reveal`, mine: true, ...tiebreakBurst(tiebreak, room.players, viewerId) }, 3200);
      return;
    }
    // Whoever was already out saw their card when it happened.
    if (spectator || central || !question || outShown.current === round) return;
    showBurst({ key: `${round}:reveal`, mine: true, ...roundBurst(me, question) }, 2600);
  }, [phase, round]);
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
    restartGame().catch((e) => setErr(e.message || "No se pudo volver a la sala"));
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

  if (phase === "finished" && room.results) return <MatchResults room={room} />;

  const isHost = !central && room.hostId === user?.id;
  // A turn's length, from the phase itself.
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
  // The central device has no "you": every player's cells in their own colour.
  const colorOf = (id) => (id === viewerId ? MY_COLOR : PLAYER_COLORS[playerIndex(id) % PLAYER_COLORS.length]);
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || "Jugador";
  const toFind = question ? question.total - question.found : 0;
  // 25 cells, or a tiebreak's few (one more than the tied players).
  const size = question?.size || CELLS;
  const tied = tiebreak ? tiebreak.playerIds : null;
  const tiedNames = tied ? joinNames(tied.map(nameOf)) : "";
  const standing = room.players.filter((p) => p.connected && !p.spectator && !p.out && (!tied || tied.includes(p.id)));
  // A tiebreak's turn waits for every tied player still in (none of them is ever "idle" there).
  const waitingFor = standing.filter((p) => !p.answered && (tied || !p.idle) && p.id !== viewerId).map((p) => p.name);
  const myHits = cells && viewerId ? cells.filter((c) => c.correct && c.by === viewerId).length : 0;
  const last = round + 1 >= room.totalRounds;
  // A tiebreak's board is laid out in up to three columns (four when it has four cells).
  const cols = size === CELLS ? 5 : size <= 4 ? size : 3;
  const rows = Math.ceil(size / cols);

  // The top card's last line: what to do now (with an icon, and red when this player is out or a pick failed).
  let hint;
  let hintIcon = "bolt";
  let hintTone = "";
  if (err) {
    hint = err;
    hintIcon = "close";
    hintTone = " is-out";
  } else if (tiebreak) {
    hintIcon = "bomb";
    if (phase === "countdown") {
      hint =
        central || watching || spectator
          ? `Desempate entre ${tiedNames}: una casilla cada uno. Quien acierte, sigue; quien pise una mina o no elija, fuera.`
          : "Desempate: elige una casilla. Si aciertas, sigues; si pisas una mina o no eliges, quedas fuera.";
    } else if (reveal) {
      hint = tiebreak.survivors ? "Otro desempate en breve…" : "Calculando resultados…";
      hintIcon = "check";
    } else if (central || watching || spectator) {
      hintIcon = central ? "phone" : "info";
      hint = waitingFor.length ? `Desempate entre ${tiedNames}. Esperando a ${joinNames(waitingFor)}…` : `Desempate entre ${tiedNames}.`;
    } else if (out) {
      hint = "Pisaste una mina. Si nadie acierta, vuelves a intentarlo.";
      hintTone = " is-out";
    } else if (pickedThisTurn) {
      hint = waitingFor.length ? `Elegiste. Esperando a ${joinNames(waitingFor)}…` : "Elegiste…";
      hintIcon = "check";
      hintTone = " is-sent";
    } else {
      hint = tiebreak.revivedTurn === turn ? "Nadie acertó: otra oportunidad. Elige otra casilla." : "Elige una casilla antes de que se acabe el tiempo.";
    }
  } else if (phase === "countdown" && central) {
    hint = race
      ? "Sin turnos: cada uno elige en su teléfono todas las correctas que pueda. Quien pise una mina, fuera."
      : "Una casilla por turno, desde el teléfono. Quien pise una mina queda fuera hasta la próxima ronda.";
    hintIcon = "bomb";
  } else if (phase === "countdown") {
    hint = race
      ? "Sin turnos: elige todas las correctas que puedas. Si pisas una mina, fuera."
      : "Una casilla por turno. Si pisas una mina, quedas fuera hasta la próxima ronda.";
    hintIcon = "bomb";
  } else if (reveal) {
    hint = `${question ? `${question.found} de ${question.total} encontrados. ` : ""}${last ? "Calculando resultados…" : "Siguiente ronda en breve…"}`;
    hintIcon = "check";
  } else if (central) {
    // The central device talks to the whole room: they pick on their phones.
    hintIcon = "phone";
    if (race) hint = "¡Carrera! Elijan en su teléfono las correctas antes que los demás.";
    else hint = waitingFor.length ? `Turno ${turn}: esperando a ${joinNames(waitingFor)}…` : `Turno ${turn}: siguiente turno…`;
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

  // The host's controls of the match: in the top card, or in the thin bar of a phone beside a central device.
  const tools = (
    <>
      <ReportButton room={room} onError={setErr} />
      <SkipButton room={room} onError={setErr} />
      <PauseButton room={room} isHost={isHost} onError={setErr} />
      {isHost && (
        <button
          type="button"
          className={`tv-mini-btn tv-end-btn${confirmHub ? " is-on" : ""}`}
          onClick={backToHub}
        >
          {confirmHub ? "¿Seguro? Toca otra vez" : "Terminar"}
        </button>
      )}
    </>
  );
  // What to do now: in the top card, or over the board on a phone beside a central device.
  const hintLine = (
    <p key={`${phase}-${turn}-${hintIcon}-${myHits}`} className={`tv-hint tv-mines-hint${hintTone}`} role="status">
      <Icon name={hintIcon} size={15} strokeWidth={2.8} />
      <span>{hint}</span>
    </p>
  );

  return (
    <div className={`tv-room tv-game tv-match tv-mines${central ? " is-central" : ""}${controller ? " is-controller" : ""}`}>
      <div ref={frameRef} className="tv-room-main tv-game-main tv-mines-frame">
        {spectator && <SpectatorBanner />}
        {/* The top card, like the one of Encuentra el país: the round, the topic and its difficulty; the prompt; and
            what to do now. Always three lines, so the board under it never moves. A phone beside the central device
            has only a thin bar: the prompt, the round and the clock are on the big screen. */}
        {controller ? (
          <ControllerBar seconds={seconds} pct={pct} urgent={urgent}>
            {tools}
          </ControllerBar>
        ) : (
          <MatchCard
            room={room}
            size="s"
            label={tiebreak ? `Desempate${tiebreak.round > 1 ? ` ${tiebreak.round}` : ""}` : "Carrera"}
            icon="bomb"
            dir={phase === "playing" && !tiebreak && !me?.out ? "Toca todas las casillas que cumplen · 100 por acierto, una mina y quedas fuera" : hint}
            seconds={seconds}
            pct={pct}
            urgent={urgent}
          >
            <MatchQuestion>{question?.prompt || "Prepárate…"}</MatchQuestion>
          </MatchCard>
        )}

        {question ? (
          <section key={round} className="tv-game-stage tv-mines-stage tv-mpanel">
            <PauseVeil room={room} isHost={isHost} />
            {/* One row over the board, always there: the board's counters, which only update (how this player's round
                went shows over the board). On a phone beside the central device it says what to do now instead: the
                counters are on the big screen. */}
            <div className="tv-mines-bar">
              {controller ? (
                hintLine
              ) : (
                <div className="tv-mines-chips" aria-live="polite">
                  {/* The board's counters, only an icon in its colour and a number (each says what it is to a screen
                      reader): right answers found out of the board's total, mines, and players still standing. The
                      numbers pop when they change. */}
                  <span className={`tv-mines-stat is-left${toFind === 0 ? " is-done" : ""}`} aria-label={`${question.found} de ${question.total} encontradas`}>
                    <span className="tv-mines-stat-icon" aria-hidden="true">
                      <Icon name="check" size={16} strokeWidth={3.2} />
                    </span>
                    <strong key={question.found} className="tv-mines-stat-num" aria-hidden="true">
                      {question.found}
                      <span className="tv-mines-stat-of">/{question.total}</span>
                    </strong>
                  </span>
                  <span className="tv-mines-stat is-mines" aria-label={`${size - question.total} minas`}>
                    <span className="tv-mines-stat-icon" aria-hidden="true">
                      <Icon name="bomb" size={16} strokeWidth={2.6} />
                    </span>
                    <strong aria-hidden="true">{size - question.total}</strong>
                  </span>
                  <span className="tv-mines-stat is-alive" aria-label={`${standing.length} en pie`}>
                    <span className="tv-mines-stat-icon" aria-hidden="true">
                      <Icon name="users" size={16} strokeWidth={2.6} />
                    </span>
                    <strong key={standing.length} className="tv-mines-stat-num" aria-hidden="true">
                      {standing.length}
                    </strong>
                  </span>
                </div>
              )}
            </div>

            <div
              className={`tv-mines-board${reveal ? " is-reveal" : ""}${burst?.shake ? " is-boom" : ""}${size !== CELLS ? " is-small" : ""}`}
              style={size !== CELLS ? { "--cols": cols, "--rows": rows } : undefined}
              role="group"
              aria-label="Tablero"
            >
              {cells
                ? cells.map((c, i) => {
                    const mine = myPick === i && !c.by;
                    const owned = Boolean(c.by);
                    let state = "";
                    if (owned) state = c.correct ? " is-hit" : " is-mine";
                    else if (reveal) state = c.correct ? " is-missed" : " is-buried";
                    else if (mine) state = " is-pending";
                    else if (!canPick && !spectator && !watching && !central) state = " is-locked";
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
                          <span className="tv-mines-owner" aria-hidden="true">
                            {nameOf(c.by).slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </button>
                    );
                  })
                : Array.from({ length: size }, (_, i) => <div key={i} className="tv-mines-cell is-waiting" style={{ "--i": i }} aria-hidden="true" />)}
              {phase === "countdown" && (
                <div className="tv-mines-countdown">
                  {controller ? (
                    <GetReady />
                  ) : (
                    <span key={Math.max(1, seconds)} className="tv-quiz-count" aria-label={`Empieza en ${Math.max(1, seconds)}`}>
                      {Math.max(1, seconds)}
                    </span>
                  )}
                </div>
              )}
              {/* By turns, once this player picked (or is out), who the turn still waits for, over the board. */}
              {!burst && phase === "playing" && !race && !spectator && !watching && (pickedThisTurn || out) && waitingFor.length > 0 && (
                <div className="tv-mines-wait" role="status">
                  <WaitingPill names={waitingFor} className="is-float" />
                </div>
              )}
              {burst && (
                <div key={burst.key} className={`tv-mines-burst is-${burst.tone}${burst.long ? " is-long" : ""}${burst.final ? " is-final" : ""}`} role="alert">
                  <span className="tv-mines-burst-card">
                    {burst.confetti && <Confetti pieces={28} />}
                    <span className="tv-mines-burst-icon">
                      <Icon name={burst.icon} size={30} strokeWidth={2.8} />
                    </span>
                    <strong>{burst.title}</strong>
                    {burst.detail && <small>{burst.detail}</small>}
                    {burst.points > 0 && <span className="tv-tag tv-tag--points">+{burst.points}</span>}
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

      {/* The scoreboard is the central device's, when there is one. */}
      {!controller && (
        <PartyPanel
          room={room}
          scores
          display={central}
          onToast={setErr}
          status={phase === "playing" ? `Siguen ${standing.length}/${room.players.filter((p) => !p.spectator).length}` : undefined}
        />
      )}
      {!controller && !central && <MatchBar
          room={room}
          viewerId={viewerId}
          tools={tools}
          verb="elegir"
          line={phase === "playing" && fallen.length ? `${fallen[fallen.length - 1].name} quedó fuera de esta ronda` : undefined}
        />}
    </div>
  );
}

// A round's points from its hits: 100 each (hitPoints on the server).
function roundPoints(hits = 0) {
  return 100 * hits;
}

// The card over the board at the reveal: how this player's round went, and a party when the whole board was found.
function roundBurst(me, question, live = null) {
  const answer = live || me?.lastAnswer;
  const hits = answer?.hits || 0;
  const points = me?.lastPoints || 0;
  const cleared = question.total > 0 && question.found >= question.total;
  if (answer?.out === "mina") return { tone: "mina", shake: true, icon: "bomb", title: "¡Pisaste una mina!", detail: hits ? `Te llevas ${hitsText(hits)}` : "Suerte en la próxima", points };
  if (answer?.out === "tiempo") return { tone: "tiempo", icon: "hourglass", title: "¡Se te acabó el tiempo!", detail: hits ? `Te llevas ${hitsText(hits)}` : "Suerte en la próxima", points };
  if (cleared) return { tone: "win", icon: "star", title: "¡Tablero limpio!", detail: hits ? `Encontraste ${hitsText(hits)}` : "Encontraron todas las correctas", points, confetti: true, long: true };
  return { tone: "ok", icon: "check", title: "¡Sobreviviste!", detail: hits ? `Encontraste ${hitsText(hits)}` : "Sin aciertos esta vez", points, confetti: hits > 0 };
}

// The card over the board at a tiebreak's reveal, for the whole room: who won it (and how), who goes on to another
// one, or that nobody picked and the tie stands.
function tiebreakBurst(tiebreak, players, viewerId) {
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "Jugador";
  if (tiebreak.winnerId) {
    const how = tiebreak.reason === "solo" ? "Nadie más eligió una casilla" : "Encontró la respuesta correcta";
    if (tiebreak.winnerId === viewerId) return { tone: "win", icon: "crown", title: "¡Ganaste el desempate!", detail: how, confetti: true, final: true };
    return { tone: "other", icon: "crown", title: `${nameOf(tiebreak.winnerId)} gana el desempate`, detail: how, final: true };
  }
  if (tiebreak.survivors) {
    const others = tiebreak.survivors.filter((id) => id !== viewerId).map(nameOf);
    if (tiebreak.survivors.includes(viewerId)) return { tone: "ok", icon: "check", title: "¡Sigues en el desempate!", detail: `Otro desempate contra ${joinNames(others)}`, final: true };
    return { tone: "other", icon: "users", title: `Siguen ${joinNames(others)}`, detail: "Juegan otro desempate", final: true };
  }
  return { tone: "tiempo", icon: "hourglass", title: "Nadie eligió", detail: "El empate se queda", final: true };
}

export default function Game() {
  return (
    <TvShell mode="minas">
      <GameScreen />
    </TvShell>
  );
}
