import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import SpectatorBanner from "../../components/home/SpectatorBanner.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import { BACKEND_URL } from "../../lib/config.js";
import { useApp, useRemainingMs } from "../../lib/store.jsx";
import Timeline from "../historia/Timeline.jsx";
import { yearLabel, yearsText } from "../historia/historyInfo.js";
import { OPTION_LETTERS, findDifficulty, quizConfig } from "./quizInfo.js";
import "../../styles/home.css";
import "../../styles/quiz.css";
import "../../styles/geo.css";
import "../../styles/history.css";

const COUNTDOWN_MS = 3000;
// Keys that pick an option while a question is open: 1–4 or A–D.
const KEYS = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
// A year being moved goes to the server once it stops for this long (and right away when it's let go or confirmed),
// so the last one counts if the time runs out before "Confirmar".
const SEND_DELAY_MS = 250;

const flagSrc = (path) => (path ? `${BACKEND_URL}${path}` : null);

// The end of a round of options or a written answer: right, wrong or out of time, and the points.
function Verdict({ me, answered, detail }) {
  const isCorrect = Boolean(me?.lastAnswer?.correct);
  const skipped = Boolean(me?.lastAnswer?.skipped);
  const tone = isCorrect ? "ok" : answered ? "bad" : "timeout";
  return (
    <div className={`tv-quiz-verdict tv-quiz-verdict--${tone}`} role="status">
      {isCorrect && <Confetti pieces={18} />}
      <span className="tv-quiz-verdict-icon">
        <Icon name={isCorrect ? "check" : answered ? "close" : "hash"} size={22} strokeWidth={3.2} />
      </span>
      <strong className="tv-quiz-verdict-title">
        {isCorrect ? "¡Correcto!" : answered ? "Incorrecto" : skipped ? "Te la saltaste" : "¡Se acabó el tiempo!"}
      </strong>
      {detail && <span className="tv-quiz-verdict-detail">{detail}</span>}
      <span className="tv-tags">
        {isCorrect && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0} pts</span>}
        {me?.streak > 1 && <span className="tv-tag tv-tag--streak">Racha de {me.streak}</span>}
      </span>
    </div>
  );
}

// How each question is answered, on its chip.
const FORMAT_LABELS = { choice: "Opciones", open: "Escribir", year: "Año" };

// The question's card: its topic, how it's answered and its difficulty, the question, and (for four options) under it
// a slot that is always the same height (the countdown, what to do, or the verdict), so nothing moves between phases.
// Written and year questions have no slot: their countdown and verdict go where the answer is given, under the card.
function QuestionCard({ question, slot = true, children }) {
  const level = findDifficulty(question.difficulty);
  return (
    <div className="tv-quiz-q">
      <div className="tv-quiz-q-meta">
        <span className="tv-match-chip">{question.category}</span>
        <span className="tv-match-chip">{FORMAT_LABELS[question.type] || FORMAT_LABELS.choice}</span>
        <span className={`tv-match-chip tv-diff-chip tv-c-${level.color}`}>{level.label}</span>
      </div>
      <h2 className="tv-quiz-q-text">{question.text}</h2>
      {slot && <div className="tv-quiz-slot">{children}</div>}
    </div>
  );
}

function Count({ seconds }) {
  const n = Math.max(1, seconds);
  return (
    <span key={n} className="tv-quiz-count" aria-label={`Empieza en ${n}`}>
      {n}
    </span>
  );
}

// What to do now, in the card's slot.
function Hint({ icon, sent, children }) {
  return (
    <span className={`tv-quiz-hint${sent ? " is-sent" : ""}`} role="status">
      <Icon name={icon} size={16} strokeWidth={2.8} />
      {children}
    </span>
  );
}

// Four options, A to D (tap, or the keys 1–4 / A–D).
function ChoiceRound({ room, question, me, answer, seconds }) {
  const round = room.currentRound;
  const [picked, setPicked] = useState(null);
  const [err, setErr] = useState("");
  const sending = useRef(false);
  const localChoice = picked?.round === round ? picked.choice : null;
  const myChoice = Number.isInteger(me?.lastAnswer?.choice) ? me.lastAnswer.choice : localChoice;
  const spectator = Boolean(me?.spectator);
  const locked = room.phase !== "playing" || Boolean(me?.answered) || Number.isInteger(localChoice) || spectator;
  const reveal = room.phase === "reveal";
  const multiplayer = room.players.length > 1;

  async function choose(choice) {
    if (locked || sending.current || !question.options) return;
    sending.current = true;
    setPicked({ round, choice });
    setErr("");
    try {
      await answer(choice);
    } catch (e) {
      sending.current = false;
      setPicked(null);
      setErr(e.message || "No se pudo enviar tu respuesta");
    }
  }

  useEffect(() => {
    if (room.phase !== "playing" || locked) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const choice = KEYS[e.key.toLowerCase()];
      if (choice != null && choice < (question.options?.length || 0)) {
        e.preventDefault();
        choose(choice);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <QuestionCard question={question}>
        {room.phase === "countdown" && <Count seconds={seconds} />}
        {room.phase === "playing" && (
          <Hint key={spectator ? "watch" : locked ? "sent" : "pick"} icon={spectator ? "info" : locked ? "check" : "bolt"} sent={locked}>
            {spectator ? (
              "Estás viendo la partida"
            ) : locked ? (
              "Respuesta enviada. Esperando al resto"
            ) : (
              <>
                Toca una opción<span className="tv-quiz-keys"> o pulsa 1–4</span>
              </>
            )}
          </Hint>
        )}
        {reveal && !spectator && <Verdict me={me} answered={Number.isInteger(myChoice)} />}
      </QuestionCard>

      <div className={`tv-quiz-options${reveal ? " is-reveal" : ""}`} role="group" aria-label="Opciones">
        {OPTION_LETTERS.map((letter, i) => {
          const text = question.options?.[i];
          if (text == null) {
            return (
              <div key={`${round}-${i}`} className={`tv-quiz-opt tv-opt-${i} is-waiting`} aria-hidden="true">
                <span className="tv-quiz-opt-letter">{letter}</span>
              </div>
            );
          }
          const isRight = reveal && question.answer === i;
          const isMine = myChoice === i;
          const state = reveal ? (isRight ? " is-right" : isMine ? " is-wrong" : " is-out") : isMine ? " is-picked" : locked && !spectator ? " is-out" : "";
          const picks = question.picks?.[i] || 0;
          return (
            <button
              key={`${round}-${i}`}
              type="button"
              className={`tv-quiz-opt tv-opt-${i}${state}`}
              style={{ "--i": i }}
              onClick={() => choose(i)}
              disabled={locked}
              aria-pressed={isMine}
              aria-label={`${letter}: ${text}${isRight ? " (correcta)" : ""}${isMine ? " (tu respuesta)" : ""}`}
            >
              <span className="tv-quiz-opt-letter">{letter}</span>
              <span className="tv-quiz-opt-text">{text}</span>
              {reveal && (isRight || isMine) && (
                <span className="tv-quiz-opt-mark">
                  <Icon name={isRight ? "check" : "close"} size={18} strokeWidth={3.4} />
                </span>
              )}
              {reveal && multiplayer && (
                <span className="tv-quiz-opt-picks" title={`${picks} ${picks === 1 ? "jugador" : "jugadores"}`}>
                  <Icon name="users" size={14} strokeWidth={2.6} />
                  {picks}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {err && <p className="tv-lobby-error" role="alert">{err}</p>}
    </>
  );
}

function Flag({ src }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className="tv-geo-flag is-missing" role="img" aria-label="Bandera">
        <Icon name="flag" size={40} />
        <span>No se pudo cargar la bandera</span>
      </div>
    );
  }
  return <img key={src} className="tv-geo-flag" src={src} alt="Bandera de un país misterioso" onError={() => setFailed(true)} />;
}

// A written answer (a capital, the country of a flag...), checked with the same typo tolerance as Encuentra el país'.
function WriteRound({ room, question, me, answer, skipSong, seconds }) {
  const round = room.currentRound;
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState(null);
  const [err, setErr] = useState("");
  const sending = useRef(false);
  const inputRef = useRef(null);
  const mySent = sent?.round === round ? sent : null;
  const spectator = Boolean(me?.spectator);
  const locked = room.phase !== "playing" || Boolean(me?.answered) || Boolean(mySent) || spectator;
  const reveal = room.phase === "reveal";
  const isFlag = question.kind === "flag";

  useEffect(() => {
    setQuery("");
    sending.current = false;
  }, [round]);

  // The box takes the keyboard as soon as the round opens.
  useEffect(() => {
    if (room.phase === "playing" && !locked) inputRef.current?.focus();
  }, [room.phase, round]);

  async function submit(e) {
    e.preventDefault();
    const text = query.trim();
    if (locked || sending.current || !text) return;
    sending.current = true;
    setSent({ round, text });
    setErr("");
    try {
      await answer(text);
    } catch (e2) {
      sending.current = false;
      setSent(null);
      setErr(e2.message || "No se pudo enviar tu respuesta");
    }
  }

  function skip() {
    if (locked) return;
    setSent({ round, skipped: true });
    skipSong().catch((e) => {
      setSent(null);
      setErr(e.message || "No se pudo saltar la pregunta");
    });
  }

  const skipped = Boolean(mySent?.skipped || me?.lastAnswer?.skipped);
  const answered = Boolean(me?.lastAnswer?.text) && !skipped;

  return (
    <>
      <QuestionCard question={question} slot={false} />
      {/* A flag question keeps the flag's place from the countdown on, so nothing jumps when it shows. */}
      {isFlag && <div className="tv-quiz-flag">{question.flag && <Flag src={flagSrc(question.flag)} />}</div>}
      <div className="tv-quiz-answer">
        {room.phase === "countdown" && <Count seconds={seconds} />}
        {reveal && !spectator && <Verdict me={me} answered={answered} detail={`Respuesta: ${question.answer}`} />}
        {reveal && spectator && <p className="tv-geo-sent tv-quiz-sent">Respuesta: {question.answer}</p>}
      {room.phase === "playing" &&
        (!locked ? (
          <form className="tv-search tv-quiz-write" onSubmit={submit}>
            <div className="tv-search-box">
              <Icon name="keyboard" size={22} className="tv-search-icon" />
              <input
                ref={inputRef}
                type="text"
                className="tv-search-input"
                placeholder={isFlag ? "Escribe el país…" : "Escribe tu respuesta…"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                autoCapitalize="sentences"
                spellCheck="false"
                enterKeyHint="send"
                maxLength={80}
                aria-label="Tu respuesta"
              />
              {query.trim() && (
                <button type="submit" className="tv-btn tv-btn--sm tv-c-green">
                  Enviar
                </button>
              )}
            </div>
            <button type="button" className="tv-mini-btn tv-quiz-skip" onClick={skip}>
              No la sé, saltar
            </button>
          </form>
        ) : (
          <p className={`tv-geo-sent tv-quiz-sent${skipped ? " is-skipped" : ""}`}>
            <Icon name={spectator ? "info" : skipped ? "close" : "check"} size={18} strokeWidth={3} />
            {spectator ? "Estás viendo la partida" : skipped ? "Te la saltaste" : mySent?.text || me?.lastAnswer?.text || "Respuesta enviada"}
          </p>
        ))}
      </div>
      {err && <p className="tv-lobby-error" role="alert">{err}</p>}
    </>
  );
}

// A year on the timeline, like Línea del tiempo's: tap or drag the line, adjust with the buttons, then confirm. The
// closer, the more points.
function YearRound({ room, question, me, placeYear, seconds }) {
  const round = room.currentRound;
  const phase = room.phase;
  const [guess, setGuess] = useState(null);
  const [err, setErr] = useState("");
  const sending = useRef(false);
  const sendTimer = useRef(null);
  const pending = useRef(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const myGuess = guess?.round === round ? guess : null;
  const confirmed = Boolean(myGuess?.locked) || Boolean(me?.answered);
  const min = question.min ?? null;
  const max = question.max ?? null;
  const spectator = Boolean(me?.spectator);
  const open = phase === "playing" && !confirmed && min != null && !spectator;
  const limit = max != null ? Math.min(max, new Date().getFullYear()) : null;
  const step = min != null ? (max - min) / 10 : 10;
  const crossesZero = min != null && min < 0 && max > 0;
  const fmt = (year) => yearLabel(year, { crossesZero });
  const reveal = phase === "reveal";

  useEffect(() => {
    sending.current = false;
    clearTimeout(sendTimer.current);
    pending.current = null;
  }, [round]);
  useEffect(() => () => clearTimeout(sendTimer.current), []);
  useEffect(() => {
    if (room.me?.guess != null && !myGuess) setGuess({ round, year: room.me.guess, locked: Boolean(room.me.lastAnswer) });
  }, [room.me?.guess, round]);

  function flush() {
    clearTimeout(sendTimer.current);
    const year = pending.current;
    if (year == null) return;
    pending.current = null;
    placeYear({ year }).catch((e) => {
      if (phaseRef.current === "playing") setErr(e.message || "No se pudo guardar tu año");
    });
  }

  function choose(year) {
    if (!open || year == null) return;
    setGuess({ round, year, locked: false });
    setErr("");
    pending.current = year;
    clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(flush, SEND_DELAY_MS);
  }

  // From the chosen year (or the middle of the line, before there is one), skipping the year 0, which doesn't exist.
  function nudge(delta) {
    if (!open) return;
    const from = myGuess?.year ?? Math.round((min + max) / 2);
    let year = from + delta;
    if (year === 0 || (from < 0 !== year < 0 && from !== 0)) year += delta > 0 ? 1 : -1;
    choose(Math.min(limit, Math.max(min, year === 0 ? 1 : year)));
  }

  async function confirm() {
    if (!open || myGuess?.year == null || sending.current) return;
    sending.current = true;
    clearTimeout(sendTimer.current);
    pending.current = null;
    setGuess({ ...myGuess, locked: true });
    try {
      await placeYear({ year: myGuess.year, lock: true });
    } catch (e) {
      sending.current = false;
      if (phaseRef.current !== "playing") return;
      setGuess({ ...myGuess, locked: false });
      setErr(e.message || "No se pudo confirmar tu año");
    }
  }

  // ← → move a year (with Shift, ↑ ↓, a tenth of the line), Enter confirms.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const moves = { ArrowLeft: e.shiftKey ? -step : -1, ArrowRight: e.shiftKey ? step : 1, ArrowDown: -step, ArrowUp: step };
      if (e.key in moves) {
        e.preventDefault();
        nudge(moves[e.key]);
      } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        confirm();
      }
    };
    const onKeyUp = (e) => {
      if (e.key.startsWith("Arrow")) flush();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  const answer = me?.lastAnswer;
  const chose = Number.isInteger(answer?.year);
  const marks =
    reveal && chose ? [{ id: me.id, year: answer.year, color: "#ffb52e", label: "Tú", isMe: true }] : [];

  let verdict = null;
  if (reveal && !spectator && question.year != null) {
    const exact = Boolean(answer?.correct);
    const tone = exact ? "ok" : chose ? "near" : "timeout";
    verdict = (
      <div className={`tv-hist-verdict tv-hist-verdict--${tone}`} role="status">
        {exact && <Confetti pieces={18} />}
        <span className="tv-hist-verdict-icon">
          <Icon name={exact ? "check" : chose ? "target" : "hash"} size={22} strokeWidth={3} />
        </span>
        <span className="tv-hist-verdict-text">
          <strong>{exact ? "¡Año exacto!" : chose ? `A ${yearsText(answer.diff)}` : "¡Se acabó el tiempo!"}</strong>
          <small>{chose && !exact ? `Fue en ${fmt(question.year)} · elegiste ${fmt(answer.year)}` : `Fue en ${fmt(question.year)}.`}</small>
        </span>
        {chose && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0}</span>}
      </div>
    );
  }

  return (
    <>
      <QuestionCard question={question} slot={false} />
      <div className="tv-hist-slot">
        {phase === "countdown" && <Count seconds={seconds} />}
        {phase === "playing" && (
          <div className={`tv-hist-picker${confirmed ? " is-locked" : ""}`}>
            <button type="button" className="tv-hist-step" onClick={() => nudge(-step)} disabled={!open} aria-label={`${step} años antes`}>
              −{step}
            </button>
            <button type="button" className="tv-hist-step" onClick={() => nudge(-1)} disabled={!open} aria-label="Un año antes">
              −1
            </button>
            <output className={`tv-hist-year${myGuess ? "" : " is-empty"}`} aria-live="polite">
              {myGuess ? (
                <>
                  {Math.abs(myGuess.year)}
                  {(myGuess.year < 0 || crossesZero) && <small>{myGuess.year < 0 ? "a. C." : "d. C."}</small>}
                </>
              ) : (
                "¿?"
              )}
            </output>
            <button type="button" className="tv-hist-step" onClick={() => nudge(1)} disabled={!open} aria-label="Un año después">
              +1
            </button>
            <button type="button" className="tv-hist-step" onClick={() => nudge(step)} disabled={!open} aria-label={`${step} años después`}>
              +{step}
            </button>
          </div>
        )}
        {verdict}
      </div>

      <Timeline
        min={min}
        max={max}
        value={myGuess?.year ?? null}
        onChoose={choose}
        onRelease={flush}
        disabled={!open}
        answer={reveal ? question.year : null}
        marks={marks}
        format={fmt}
        label={min != null ? `Línea del tiempo de ${fmt(min)} a ${fmt(max)}` : "Línea del tiempo"}
      />

      {/* Always there (hidden outside the round), so the timeline doesn't move when it comes and goes. */}
      <div className={`tv-hist-action${phase === "playing" ? "" : " is-hidden"}`}>
        <button type="button" className="tv-btn tv-btn--block tv-c-quiz" onClick={confirm} disabled={!open || myGuess?.year == null}>
          <Icon name={confirmed ? "check" : "calendar"} size={20} strokeWidth={2.6} />
          {spectator ? "Estás viendo la partida" : confirmed ? "Año confirmado" : myGuess ? `Confirmar ${fmt(myGuess.year)}` : "Elige un año en la línea"}
        </button>
      </div>
      {err && <p className="tv-lobby-error" role="alert">{err}</p>}
    </>
  );
}

function GameScreen() {
  const { code } = useParams();
  const { user, room, joinRoom, answer, skipSong, placeYear, setGame } = useApp();
  const nav = useNavigate();

  const left = useRemainingMs(room);
  const [err, setErr] = useState("");
  // Host's "Terminar" mid-match needs a second tap, since it ends the match for everyone.
  const [confirmHub, setConfirmHub] = useState(false);

  // Join the room after a reload. Going back to the room screen is handled by RoomNavigator (App.jsx).
  useEffect(() => {
    if (!room || room.code !== code) {
      joinRoom(code).catch(() => nav("/"));
    }
  }, [code]);

  useEffect(() => {
    if (!confirmHub) return;
    const t = setTimeout(() => setConfirmHub(false), 3000);
    return () => clearTimeout(t);
  }, [confirmHub]);

  useEffect(() => setErr(""), [room?.currentRound]);

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

  if (room.phase === "finished" && room.results) {
    return <MatchResults room={room} color="quiz" />;
  }

  const playerObj = room.players?.find((p) => p.id === user?.id);
  const me = playerObj
    ? { ...playerObj, ...(room.me?.id === user?.id ? room.me : {}), lastAnswer: playerObj.lastAnswer || room.me?.lastAnswer }
    : room.me;
  const question = room.question;
  const round = room.currentRound;
  const type = question?.type || "choice";
  const isHost = room.hostId === user?.id;
  const totalMs = quizConfig(room).roundMs;
  const pct =
    room.phase === "playing"
      ? Math.max(0, Math.min(100, (left / totalMs) * 100))
      : room.phase === "countdown"
      ? Math.max(0, Math.min(100, (left / COUNTDOWN_MS) * 100))
      : 100;
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const urgent = room.phase === "playing" && left <= 4000;
  const props = { room, question, me, answer, skipSong, placeYear, seconds };

  return (
    <div className="tv-room tv-game tv-quiz">
      <div className="tv-room-main tv-game-main">
        {me?.spectator && <SpectatorBanner />}
        <section className="tv-game-top">
          <div className="tv-game-round">
            <p className="tv-mono-label">Sala {room.code} · Trivia</p>
            <h1 className="tv-card-title">
              Pregunta {round + 1} <span className="tv-muted">de {room.totalRounds}</span>
            </h1>
          </div>

          <div className={`tv-clock${urgent ? " is-urgent" : ""}`} role="timer" aria-label={`${seconds} segundos`}>
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle className="tv-clock-track" cx="22" cy="22" r="19" />
              <circle className="tv-clock-fill" cx="22" cy="22" r="19" style={{ strokeDashoffset: 119.4 * (1 - pct / 100) }} />
            </svg>
            <span key={seconds} className="tv-clock-num">{seconds}</span>
          </div>

          <div className="tv-game-tools">
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
          <section key={round} className={`tv-game-stage tv-quiz-stage is-${type}`}>
            {/* Every kind of round draws itself from the countdown on (empty option tiles, an empty timeline...), so
                nothing jumps when the round opens. */}
            {type === "choice" && <ChoiceRound {...props} />}
            {type === "open" && <WriteRound {...props} />}
            {type === "year" && <YearRound {...props} />}

            {err && <p className="tv-lobby-error" role="alert">{err}</p>}
          </section>
        ) : (
          <section className="tv-game-stage tv-countdown">
            <p className="tv-party-status">
              <span className="tv-pulse" aria-hidden="true" />
              Cargando la pregunta…
            </p>
          </section>
        )}
      </div>

      <PartyPanel room={room} scores onToast={setErr} />
    </div>
  );
}

export default function Game() {
  return (
    <TvShell mode="opciones">
      <GameScreen />
    </TvShell>
  );
}
