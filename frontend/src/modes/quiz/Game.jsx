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
import { OPTION_LETTERS, findDifficulty, quizConfig } from "./quizInfo.js";
import "../../styles/home.css";
import { PauseButton, PauseVeil } from "../../components/home/PauseControls.jsx";
import "../../styles/quiz.css";
import "../../styles/geo.css";

const COUNTDOWN_MS = 3000;
// Keys that pick an option while a question is open: 1–4 or A–D.
const KEYS = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };

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
const FORMAT_LABELS = { choice: "Pregunta cerrada", open: "Pregunta abierta" };

// The question's card: its topic, how it's answered and its difficulty, the question, and (for four options) under it
// a slot that is always the same height (the countdown, what to do, or the verdict), so nothing moves between phases.
// Written questions have no slot: their countdown and verdict go where the answer is given, under the card.
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

  const [confirmSkip, setConfirmSkip] = useState(false);
  useEffect(() => {
    if (!confirmSkip) return undefined;
    const t = setTimeout(() => setConfirmSkip(false), 3000);
    return () => clearTimeout(t);
  }, [confirmSkip]);

  // "Saltar", like Adivina la canción's: the first tap asks, the second skips.
  function skip() {
    if (locked) return;
    if (!confirmSkip) {
      setConfirmSkip(true);
      return;
    }
    setConfirmSkip(false);
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
            {/* Hidden while typing, but it keeps its space so the answer box never moves. */}
            <button
              type="button"
              className={`tv-btn tv-btn--block tv-c-neutral tv-skip-btn${confirmSkip ? " is-on" : ""}${query.trim() ? " is-hidden" : ""}`}
              onClick={skip}
              aria-live="polite"
              aria-hidden={query.trim() ? "true" : undefined}
              tabIndex={query.trim() ? -1 : undefined}
            >
              <Icon name={confirmSkip ? "lock" : "close"} size={16} strokeWidth={3} />
              {confirmSkip ? "No te dará puntos. Toca otra vez" : "Saltar"}
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

function GameScreen() {
  const { code } = useParams();
  const { user, room, joinRoom, answer, skipSong, setGame } = useApp();
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
  const props = { room, question, me, answer, skipSong, seconds };

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
          <section key={round} className={`tv-game-stage tv-quiz-stage is-${type}`}>
            <PauseVeil room={room} isHost={isHost} />
            {/* Every kind of round draws itself from the countdown on (empty option tiles, an empty timeline...), so
                nothing jumps when the round opens. */}
            {type === "choice" && <ChoiceRound {...props} />}
            {type === "open" && <WriteRound {...props} />}

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
