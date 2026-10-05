import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import { useApp, useRemainingMs } from "../../lib/store.jsx";
import { OPTION_LETTERS, findDifficulty, quizConfig } from "./quizInfo.js";
import "../../styles/home.css";
import "../../styles/quiz.css";

const COUNTDOWN_MS = 3000;
// Keys that pick an option while a question is open: 1–4 or A–D.
const KEYS = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };

function Verdict({ me, myChoice }) {
  const isCorrect = Boolean(me?.lastAnswer?.correct);
  const didAnswer = Number.isInteger(myChoice);
  const tone = isCorrect ? "ok" : didAnswer ? "bad" : "timeout";
  return (
    <div className={`tv-quiz-verdict tv-quiz-verdict--${tone}`} role="status">
      {isCorrect && <Confetti pieces={18} />}
      <span className="tv-quiz-verdict-icon">
        <Icon name={isCorrect ? "check" : didAnswer ? "close" : "hash"} size={22} strokeWidth={3.2} />
      </span>
      <strong className="tv-quiz-verdict-title">
        {isCorrect ? "¡Correcto!" : didAnswer ? "Incorrecto" : "¡Se acabó el tiempo!"}
      </strong>
      <span className="tv-tags">
        {isCorrect && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0} pts</span>}
        {me?.streak > 1 && <span className="tv-tag tv-tag--streak">Racha de {me.streak}</span>}
      </span>
    </div>
  );
}

function GameScreen() {
  const { code } = useParams();
  const { user, room, joinRoom, answer, setGame } = useApp();
  const nav = useNavigate();

  const left = useRemainingMs(room);
  const [err, setErr] = useState("");
  // The option this player tapped, shown straight away (before the server confirms): { round, choice }.
  const [picked, setPicked] = useState(null);
  // Host's "Terminar" mid-match needs a second tap, since it ends the match for everyone.
  const [confirmHub, setConfirmHub] = useState(false);
  const sending = useRef(false);

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

  // A new question: nothing picked yet.
  useEffect(() => {
    sending.current = false;
    setErr("");
  }, [room?.currentRound]);

  const playerObj = room?.players?.find((p) => p.id === user?.id);
  const me = playerObj
    ? { ...playerObj, ...(room?.me?.id === user?.id ? room.me : {}), lastAnswer: playerObj.lastAnswer || room?.me?.lastAnswer }
    : room?.me;
  const question = room?.question;
  const round = room?.currentRound;
  const localChoice = picked?.round === round ? picked.choice : null;
  const myChoice = Number.isInteger(me?.lastAnswer?.choice) ? me.lastAnswer.choice : localChoice;
  const locked = room?.phase !== "playing" || Boolean(me?.answered) || Number.isInteger(localChoice);

  async function choose(choice) {
    if (locked || sending.current || !question?.options) return;
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

  // 1–4 or A–D answer from the keyboard.
  useEffect(() => {
    if (room?.phase !== "playing" || locked) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const choice = KEYS[e.key.toLowerCase()];
      if (choice != null && choice < (question?.options?.length || 0)) {
        e.preventDefault();
        choose(choice);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
  const level = findDifficulty(question?.difficulty);
  const reveal = room.phase === "reveal";
  const multiplayer = room.players.length > 1;

  return (
    <div className="tv-room tv-game tv-quiz">
      <div className="tv-room-main tv-game-main">
        <section className="tv-game-top">
          <div className="tv-game-round">
            <p className="tv-mono-label">Sala {room.code} · Opción múltiple</p>
            <h1 className="tv-card-title">
              Pregunta {room.currentRound + 1} <span className="tv-muted">de {room.totalRounds}</span>
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
          <section key={round} className="tv-game-stage tv-quiz-stage">
            <div className="tv-quiz-q">
              <div className="tv-quiz-q-meta">
                <span className="tv-match-chip">{question.category}</span>
                <span className={`tv-match-chip tv-diff-chip tv-c-${level.color}`}>{level.label}</span>
              </div>
              <h2 className="tv-quiz-q-text">{question.text}</h2>
              {/* Always the same height, so nothing moves: the countdown, what to do while answering (or that the
                  answer is in), then the verdict. */}
              <div className="tv-quiz-slot">
                {room.phase === "countdown" && (
                  <span key={Math.max(1, seconds)} className="tv-quiz-count" aria-label={`Empieza en ${Math.max(1, seconds)}`}>
                    {Math.max(1, seconds)}
                  </span>
                )}
                {room.phase === "playing" && (
                  <span key={locked ? "sent" : "pick"} className={`tv-quiz-hint${locked ? " is-sent" : ""}`} role="status">
                    <Icon name={locked ? "check" : "bolt"} size={16} strokeWidth={2.8} />
                    {locked ? (
                      "Respuesta enviada. Esperando al resto"
                    ) : (
                      <>
                        Toca una opción<span className="tv-quiz-keys"> o pulsa 1–4</span>
                      </>
                    )}
                  </span>
                )}
                {reveal && <Verdict me={me} myChoice={myChoice} />}
              </div>
            </div>

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
                const state = reveal
                  ? isRight
                    ? " is-right"
                    : isMine
                    ? " is-wrong"
                    : " is-out"
                  : isMine
                  ? " is-picked"
                  : locked
                  ? " is-out"
                  : "";
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
