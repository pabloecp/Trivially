import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import AnswerSkip from "../../components/home/AnswerSkip.jsx";
import WaitingPill, { waitingNames } from "../../components/home/WaitingPill.jsx";
import SpectatorBanner from "../../components/home/SpectatorBanner.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import { ControllerBar, GetReady, PhoneHint, RoomVerdict } from "../../components/home/CentralBits.jsx";
import { BACKEND_URL } from "../../lib/config.js";
import { useApp, useRemainingMs, useView } from "../../lib/store.jsx";
import { OPTION_LETTERS, findDifficulty, quizConfig } from "./quizInfo.js";
import "../../styles/home.css";
import { PauseButton, ReportButton, SkipButton, PauseVeil } from "../../components/home/PauseControls.jsx";
import "../../styles/quiz.css";
import "../../styles/geo.css";
import { resolveCode } from "../../lib/hiddenCode.js";
import { MatchBar, MatchCard, MatchQuestion, topicIcon } from "../../components/home/MatchFrame.jsx";

const COUNTDOWN_MS = 3000;
// Keys that pick an option while a question is open: 1–4 or A–D.
const KEYS = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };

const flagSrc = (path) => (path ? `${BACKEND_URL}${path}` : null);

// The end of a round, on the card's first row: right (and the points), wrong or out of time.
function Verdict({ me, answered }) {
  const isCorrect = Boolean(me?.lastAnswer?.correct);
  const skipped = Boolean(me?.lastAnswer?.skipped);
  const tone = isCorrect ? "ok" : answered ? "bad" : "timeout";
  return (
    <span className={`tv-qc-verdict is-${tone}`} role="status">
      {isCorrect && <Confetti pieces={18} />}
      <Icon name={isCorrect ? "check" : answered ? "close" : "hash"} size={16} strokeWidth={3.2} />
      {isCorrect ? `¡Correcto! +${me?.lastPoints || 0}` : answered ? "Incorrecto" : skipped ? "Te la saltaste" : "Se acabó el tiempo"}
    </span>
  );
}

// What to do, under the card's first row.
const DIRECTIONS = {
  choice: "Cerradas: elige una de las cuatro · más rápido, más puntos",
  open: "Abiertas: escribe la respuesta · más rápido, más puntos",
};

// The question's card (MatchCard): its topic, what to do and the time; the question at the bottom. `note` goes on its
// first row (the verdict at the end of the round).
function QuestionCard({ room, question, clock, note }) {
  return (
    <MatchCard
      room={room}
      label={question.category}
      icon={topicIcon(question.category)}
      pills={note}
      dir={DIRECTIONS[question.type] || DIRECTIONS.choice}
      {...clock}
    >
      <MatchQuestion>{question.text}</MatchQuestion>
    </MatchCard>
  );
}

// A player's phone while the room's central device shows the question: only the slot (what to do, the verdict), no
// question; where to look is in its bar (ControllerBar).
function ControllerCard({ children }) {
  return (
    <div className="tv-quiz-q is-controller">
      <div className="tv-quiz-slot">{children}</div>
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

// Four options, A to D (tap, or the keys 1–4 / A–D). On the room's central device they only show (with how many picked
// each at the reveal); on a player's phone beside it (`controller`) only the options are there, not the question.
function ChoiceRound({ room, question, me, answer, seconds, clock, central, controller }) {
  const round = room.currentRound;
  const [picked, setPicked] = useState(null);
  const [err, setErr] = useState("");
  const sending = useRef(false);
  const localChoice = picked?.round === round ? picked.choice : null;
  const myChoice = Number.isInteger(me?.lastAnswer?.choice) ? me.lastAnswer.choice : localChoice;
  const spectator = Boolean(me?.spectator);
  const locked = room.phase !== "playing" || Boolean(me?.answered) || Number.isInteger(localChoice) || spectator || central;
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
      {controller ? (
        <ControllerCard>
          {room.phase === "countdown" && <GetReady />}
          {room.phase === "playing" && (
            <Hint key={spectator ? "watch" : locked ? "sent" : "pick"} icon={spectator ? "info" : locked ? "check" : "bolt"} sent={locked}>
              {spectator ? "Estás viendo la partida" : locked ? <WaitingPill room={room} userId={me?.id} inline fallback="Respuesta enviada" /> : "Toca una opción"}
            </Hint>
          )}
          {reveal && !spectator && <Verdict me={me} answered={Number.isInteger(myChoice)} />}
        </ControllerCard>
      ) : (
        <QuestionCard
          room={room}
          question={question}
          clock={clock}
          note={
            reveal && central ? <RoomVerdict room={room} /> : reveal && !spectator && !central ? <Verdict me={me} answered={Number.isInteger(myChoice)} /> : null
          }
        />
      )}
      {room.phase === "playing" && central && <PhoneHint room={room}>Respondan desde su teléfono</PhoneHint>}

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
            : locked && !spectator && !central
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
              {isMine && !reveal && <span className="tv-quiz-opt-mine">Tu respuesta</span>}
              {reveal && (isRight || isMine) && (
                <span className="tv-quiz-opt-mark">
                  <Icon name={isRight ? "check" : "close"} size={18} strokeWidth={3.4} />
                </span>
              )}
              {reveal && (multiplayer || central) && !controller && (
                <span className="tv-quiz-opt-picks">
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

// A written answer (a capital, the country of a flag...), checked with some tolerance for typos. On the room's central
// device the question (and the flag) shows while the players write on their phones, which (`controller`) have only the
// box; the answer and how many got it show at the reveal.
function WriteRound({ room, question, me, answer, skipSong, seconds, clock, central, controller }) {
  const round = room.currentRound;
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState(null);
  const [err, setErr] = useState("");
  const sending = useRef(false);
  const inputRef = useRef(null);
  const mySent = sent?.round === round ? sent : null;
  const spectator = Boolean(me?.spectator);
  const locked = room.phase !== "playing" || Boolean(me?.answered) || Boolean(mySent) || spectator || central;
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
      {!controller && (
        <QuestionCard
          room={room}
          question={question}
          clock={clock}
          note={reveal && central ? <RoomVerdict room={room} /> : reveal && !spectator && !central ? <Verdict me={me} answered={answered} /> : null}
        />
      )}
      {/* The answer's panel: the flag (a flag question), then the box to write in, or what was sent, or the answer. */}
      <div className="tv-mpanel">
        {isFlag && !controller && (
          <div className="tv-quiz-flag">
            {question.flag ? (
              <Flag src={flagSrc(question.flag)} />
            ) : room.phase === "countdown" ? (
              <div className="tv-quiz-flag-wait">
                <Count seconds={seconds} />
              </div>
            ) : null}
          </div>
        )}
        {room.phase === "countdown" && controller && <GetReady />}
        {!controller && room.phase !== "reveal" && <span className="tv-mpanel-label">Tu respuesta</span>}
        {room.phase === "countdown" && !controller && (
          <div className="tv-mwrite is-off">
            <span className="tv-mwrite-box">
              <Icon name="keyboard" size={24} />
              <span className="tv-mwrite-ph">Escribe cuando empiece la pregunta…</span>
            </span>
          </div>
        )}
        {reveal && (
          <div className="tv-mreveal">
            <span className="tv-mpanel-label">La respuesta</span>
            <p className="tv-mreveal-answer">{question.answer}</p>
            {!central && !spectator && (me?.lastAnswer?.text || skipped) && (
              <p className={`tv-mreveal-mine ${me?.lastAnswer?.correct ? "is-ok" : "is-bad"}`}>
                <Icon name={me?.lastAnswer?.correct ? "check" : "close"} size={16} strokeWidth={3} />
                {skipped ? "Te la saltaste" : `Escribiste: ${me.lastAnswer.text}`}
              </p>
            )}
          </div>
        )}
        {room.phase === "playing" && central && <PhoneHint room={room}>Escriban la respuesta en su teléfono</PhoneHint>}
        {room.phase === "playing" &&
          !central &&
          (!locked ? (
            <form className="tv-mwrite" onSubmit={submit}>
              <label className="tv-mwrite-box">
                <Icon name="keyboard" size={24} />
                <input
                  ref={inputRef}
                  type="text"
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
              </label>
              <button type="submit" className="tv-btn tv-btn--primary tv-mwrite-send" disabled={!query.trim()}>
                <Icon name="send" size={20} strokeWidth={2.4} />
                <span className="tv-mwrite-send-label">Enviar</span>
              </button>
            </form>
          ) : (
            <p className={`tv-mwrite-sent${skipped ? " is-skipped" : ""}`}>
              <Icon name={spectator ? "info" : skipped ? "close" : "check"} size={20} strokeWidth={3} />
              {spectator ? "Estás viendo la partida" : skipped ? "Te la saltaste" : mySent?.text || me?.lastAnswer?.text || "Respuesta enviada"}
            </p>
          ))}
        {room.phase === "playing" && !locked && !central && (
          <div className="tv-mpanel-foot">
            {/* A player may still give up on the question: the first tap asks, the second skips. */}
            <AnswerSkip confirm={confirmSkip} onClick={skip} />
          </div>
        )}
      </div>
      {err && <p className="tv-lobby-error" role="alert">{err}</p>}
    </>
  );
}

function GameScreen() {
  const { code: codeParam } = useParams();
  const { user, room, joinRoom, answer, skipSong, restartGame } = useApp();
  // The address's code ("oculta" while it's hidden: this tab's room, lib/hiddenCode.js).
  const code = resolveCode(codeParam, room);
  const nav = useNavigate();
  // The room's central device shows the question to everyone; beside it, the players' phones only the ways to answer.
  const { central, controller, viewerId } = useView(room);

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

  if (room.phase === "finished" && room.results) {
    return <MatchResults room={room} />;
  }

  const playerObj = room.players?.find((p) => p.id === viewerId);
  const me = central
    ? null
    : playerObj
    ? { ...playerObj, ...(room.me?.id === user?.id ? room.me : {}), lastAnswer: playerObj.lastAnswer || room.me?.lastAnswer }
    : room.me;
  const question = room.question;
  const round = room.currentRound;
  const type = question?.type || "choice";
  const isHost = !central && room.hostId === user?.id;
  const totalMs = quizConfig(room).roundMs;
  const pct =
    room.phase === "playing"
      ? Math.max(0, Math.min(100, (left / totalMs) * 100))
      : room.phase === "countdown"
      ? Math.max(0, Math.min(100, (left / COUNTDOWN_MS) * 100))
      : 100;
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const urgent = room.phase === "playing" && left <= 4000;
  const clock = { seconds, pct, urgent };
  const props = { room, question, me, answer, skipSong, seconds, clock, central, controller };
  // The host's controls of the match: in the round's card, or in the thin bar of a phone beside a central device.
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

  return (
    <div className={`tv-room tv-game tv-match tv-quiz${central ? " is-central" : ""}${controller ? " is-controller" : ""}`}>
      <div className="tv-room-main tv-game-main">
        {me?.spectator && <SpectatorBanner />}
        {/* Beside a central device the round, the clock and the question are on the big screen: only the options here. */}
        {controller && (
          <ControllerBar seconds={seconds} pct={pct} urgent={urgent}>
            {tools}
          </ControllerBar>
        )}

        {question ? (
          <section key={round} className={`tv-game-stage tv-quiz-stage is-${type}`}>
            <PauseVeil room={room} isHost={isHost} />
            {/* Every kind of round draws itself from the countdown on (empty option tiles, an empty answer box), so
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

      {/* The scoreboard is the central device's, when there is one. */}
      {!controller && <PartyPanel room={room} scores display={central} onToast={setErr} />}
      {!controller && !central && <MatchBar room={room} viewerId={viewerId} tools={tools} />}
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
