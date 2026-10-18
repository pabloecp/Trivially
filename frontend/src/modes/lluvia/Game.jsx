import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import SpectatorBanner from "../../components/home/SpectatorBanner.jsx";
import { ControllerBar, GetReady, PhoneHint, joinNames } from "../../components/home/CentralBits.jsx";
import { PauseButton, PauseVeil, SkipButton } from "../../components/home/PauseControls.jsx";
import { resolveCode } from "../../lib/hiddenCode.js";
import { useApp, useRemainingMs, useView } from "../../lib/store.jsx";
import { play } from "../../lib/sounds.js";
import { DIFFICULTIES, findDifficulty, hitsText, pointsText, rainConfig } from "./rainInfo.js";
import "../../styles/home.css";
import "../../styles/quiz.css";
import "../../styles/rain.css";

const COUNTDOWN_MS = 3000;
// One colour per player for the marks of who answered each question (never the green, yellow and red of the
// questions themselves).
const PLAYER_COLORS = ["#a58bff", "#2ea8ff", "#ff9f1c", "#e879f9", "#14b8a6", "#7c80ff", "#f472b6", "#ffffff"];
// A computer's mouse: a missed answer stays selected, so typing the next one replaces it (on a phone it would bring
// up the selection's menu).
const finePointer = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

/**
 * How far into the round the rain is (ms), on the server's clock: where every question is. During the countdown
 * nothing falls; at the reveal the rain stops where the round ended; a pause stops it where it was.
 */
function rainElapsed(room) {
  if (room.phase === "reveal" || room.phase === "finished") return room.question?.roundMs ?? 0;
  if (room.phase !== "playing" || !room.phaseStartedAt) return -Infinity;
  if (room.paused) return room.phaseEndsAt - room.phaseStartedAt - room.paused.remainingMs;
  return Date.now() + (room.clockOffset || 0) - room.phaseStartedAt;
}

// How long a question someone took stays on screen, popping with who took it and its points.
const TAKEN_SHOW_MS = 1500;

/**
 * The sky the questions fall down, in three columns. Each one is placed on every frame from the server's clock
 * (rainElapsed), so every screen shows the same question at the same height, whatever arrived when: it starts just
 * above the top edge at its `at` and leaves under the bottom one `fallMs` later. A question someone took pops and goes
 * on every screen, with its points ("+3", or "Ana +3" for someone else).
 */
function Sky({ room, question, viewerId, nameOf, colorOf, onTap, children }) {
  const skyRef = useRef(null);
  const roomRef = useRef(room);
  roomRef.current = room;
  const fallMs = question.fallMs || 13000;

  useEffect(() => {
    let frame;
    const tick = () => {
      const sky = skyRef.current;
      if (sky) {
        const height = sky.clientHeight;
        const elapsed = rainElapsed(roomRef.current);
        for (const el of sky.querySelectorAll("[data-at]")) {
          const p = (elapsed - Number(el.dataset.at)) / fallMs;
          const shown = p >= 0 && p <= 1;
          el.style.visibility = shown ? "" : "hidden";
          if (shown) el.style.transform = `translate3d(0, calc(${(p * height).toFixed(1)}px - ${((1 - p) * 100).toFixed(2)}%), 0)`;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [fallMs]);

  const reveal = room.phase === "reveal";
  const now = rainElapsed(room);
  return (
    <div ref={skyRef} className={`tv-rain-sky${reveal ? " is-reveal" : ""}`} onPointerDown={onTap}>
      {(question.drops || []).map((d) => {
        // Taken a while ago (or before this screen came): it's gone already.
        if (d.by && now - d.takenAt > TAKEN_SHOW_MS) return null;
        const level = findDifficulty(d.difficulty);
        const mine = Boolean(d.by) && d.by === viewerId;
        return (
          <div
            key={d.id}
            className={`tv-rain-drop${d.by ? " is-taken" : ""}`}
            data-at={d.at}
            style={{ "--lane": d.lane, zIndex: 1000 - d.id, visibility: "hidden" }}
          >
            <div className={`tv-rain-card is-${level.id}`} aria-label={`${level.label}, ${pointsText(d.points)}: ${d.text}`}>
              <span className="tv-rain-card-top">
                <span className="tv-rain-card-cat">{d.category}</span>
                <span className="tv-rain-card-pts">+{d.points}</span>
              </span>
              <span className="tv-rain-card-text">{d.text}</span>
              {d.answer && (
                <span className="tv-rain-card-answer">
                  <Icon name="check" size={13} strokeWidth={3.4} />
                  {d.answer}
                </span>
              )}
            </div>
            {d.by && (
              <span className={`tv-rain-gain${mine ? "" : " is-other"}`} style={mine ? undefined : { "--owner": colorOf(d.by) }} aria-hidden="true">
                {mine ? `+${d.points}` : `${nameOf(d.by)} +${d.points}`}
              </span>
            )}
          </div>
        );
      })}
      {children}
    </div>
  );
}

/**
 * The box under the rain where this player writes. Enter sends what's written: if it's the answer to a question on
 * screen nobody took yet, this player takes it and the box empties; right but someone was faster, the box empties and
 * says who; wrong, the box shakes and keeps it, to fix a typo. The box keeps the keyboard the whole match (also
 * through the countdown, so a phone's keyboard is already up when the rain starts).
 */
function AnswerBox({ room, open, inputRef, onResult }) {
  const { rainAnswer } = useApp();
  const [text, setText] = useState("");
  const boxRef = useRef(null);
  const textRef = useRef("");
  textRef.current = text;

  // A hit lights the box up in green; a miss shakes it in red (without remounting it, so it keeps the keyboard).
  function flash(hit) {
    const box = boxRef.current;
    if (!box?.animate) return;
    const ring = hit ? "var(--p-ok)" : "var(--p-bad)";
    box.animate(
      hit
        ? [{ boxShadow: `0 0 0 4px ${ring}` }, { boxShadow: "0 0 0 0 transparent" }]
        : [
            { transform: "translateX(0)", boxShadow: `0 0 0 3px ${ring}` },
            { transform: "translateX(-8px)" },
            { transform: "translateX(7px)" },
            { transform: "translateX(-4px)" },
            { transform: "translateX(0)", boxShadow: "0 0 0 0 transparent" },
          ],
      { duration: hit ? 600 : 360, easing: "ease-out" }
    );
  }

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [room.currentRound, room.phase === "countdown"]);

  async function submit(e) {
    e.preventDefault();
    const sent = text.trim();
    if (!sent || !open) return;
    try {
      const { hit, takenBy, answer } = await rainAnswer(sent);
      const same = textRef.current.trim() === sent;
      if (hit) {
        play("correct");
        if (same) setText("");
        onResult({ hit });
      } else if (takenBy) {
        // Right, but too late: nothing to fix.
        play("wrong");
        if (same) setText("");
        onResult({ takenBy, answer });
      } else {
        play("wrong");
        if (finePointer() && same) inputRef.current?.select();
        onResult({ miss: sent });
      }
      flash(Boolean(hit));
    } catch (err) {
      flash(false);
      onResult({ error: err.message || "No se pudo enviar tu respuesta" });
    }
  }

  return (
    <form className="tv-search tv-rain-form" onSubmit={submit}>
      <div ref={boxRef} className="tv-search-box tv-rain-box">
        <Icon name="keyboard" size={22} className="tv-search-icon" />
        <input
          ref={inputRef}
          type="text"
          className="tv-search-input"
          placeholder={
            open ? "Tu respuesta…" : room.paused ? "En pausa" : room.phase === "reveal" ? "Fin de la ronda" : "Prepárate…"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck="false"
          enterKeyHint="send"
          maxLength={80}
          aria-label="Tu respuesta"
        />
        {text.trim() && open && (
          <button type="submit" className="tv-btn tv-btn--sm tv-c-rain" data-sound="none" aria-label="Enviar">
            <Icon name="send" size={18} strokeWidth={2.6} />
          </button>
        )}
      </div>
    </form>
  );
}

// What happened at the round's end, over the sky for a moment (then the rain stays still with every answer on it):
// this player won the round, someone else did, a tie, or nobody scored. The central device speaks to the whole room.
function roundBurst(room, question, viewerId) {
  const winners = (question.winners || []).map((id) => room.players.find((p) => p.id === id)).filter(Boolean);
  const me = room.players.find((p) => p.id === viewerId);
  const mine = me && !me.spectator ? `Tú: ${me.lastAnswer?.text?.toLowerCase() || "sin aciertos"}` : "";
  const best = pointsText(question.best || 0);
  if (!winners.length) return { tone: "none", icon: "rain", title: "Nadie sumó puntos", detail: "¡Que no se escapen en la próxima!" };
  if (winners.length > 1) {
    const iWon = winners.some((p) => p.id === viewerId);
    return { tone: iWon ? "win" : "tie", icon: "crown", title: iWon ? "¡Empate en cabeza!" : "¡Empate!", detail: `${joinNames(winners.map((p) => p.name))}, con ${best}`, confetti: iWon };
  }
  const [winner] = winners;
  if (winner.id === viewerId) return { tone: "win", icon: "crown", title: "¡Ganaste la ronda!", detail: `Con ${best}`, confetti: true };
  return { tone: "other", icon: "crown", title: `${winner.name} ganó la ronda`, detail: mine || `Con ${best}` };
}

function GameScreen() {
  const { code: codeParam } = useParams();
  const { user, room, joinRoom, setGame } = useApp();
  // The address's code ("oculta" while it's hidden: this tab's room, lib/hiddenCode.js).
  const code = resolveCode(codeParam, room);
  const nav = useNavigate();
  // With a central device in the room, the rain and the scoreboard show there; the players' phones only have the box
  // to write in, and how their round is going.
  const { central, controller, viewerId } = useView(room);

  const left = useRemainingMs(room);
  const [err, setErr] = useState("");
  // What this player's last answer did, for a moment: { key, hit } / { key, miss } / { key, error }.
  const [last, setLast] = useState(null);
  // This round's right answers on this phone, newest first (shown beside a central device).
  const [log, setLog] = useState([]);
  // Host's "Terminar" mid-match needs a second tap, since it ends the match for everyone.
  const [confirmHub, setConfirmHub] = useState(false);
  const [burst, setBurst] = useState(null);
  const inputRef = useRef(null);

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
  const question = room?.question || null;

  useEffect(() => {
    setLast(null);
    setLog([]);
  }, [round]);
  useEffect(() => {
    if (!last) return undefined;
    const t = setTimeout(() => setLast(null), last.hit ? 1800 : 1400);
    return () => clearTimeout(t);
  }, [last]);
  useEffect(() => {
    if (!err) return undefined;
    const t = setTimeout(() => setErr(""), 2500);
    return () => clearTimeout(t);
  }, [err]);

  // At the reveal, who won the round shows over the rain for a moment (and in the top card the whole reveal).
  const outcome = phase === "reveal" && question?.winners && room ? roundBurst(room, question, viewerId) : null;
  useEffect(() => {
    if (!outcome) {
      setBurst(null);
      return undefined;
    }
    setBurst({ key: round, ...outcome });
    const t = setTimeout(() => setBurst(null), 2600);
    return () => clearTimeout(t);
  }, [phase, round, Boolean(outcome)]);

  // The match is one frame as tall as the screen under the top bar (see .tv-rain-frame), so the sky and the box under
  // it show without scrolling; --rain-top is where the frame starts on the page. Big screens don't need it: the room's
  // frame already fills the window.
  const frameRef = useRef(null);
  const hasGame = Boolean(room) && room.phase !== "finished";
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!hasGame || !el) return undefined;
    const measure = () => el.style.setProperty("--rain-top", `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [hasGame]);

  function backToHub() {
    if (!confirmHub) {
      setConfirmHub(true);
      return;
    }
    setConfirmHub(false);
    setGame(null).catch((e) => setErr(e.message || "No se pudo volver a la sala"));
  }

  function onResult(result) {
    setLast({ key: Date.now(), ...result });
    if (result.hit) setLog((list) => [result.hit, ...list].slice(0, 4));
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

  if (phase === "finished" && room.results) return <MatchResults room={room} color="rain" />;

  const isHost = !central && room.hostId === user?.id;
  const me = room.players.find((p) => p.id === viewerId) || null;
  const spectator = Boolean(me?.spectator);
  const canWrite = !central && !spectator && Boolean(me);
  const open = phase === "playing" && !room.paused;
  const reveal = phase === "reveal";
  const playerIndex = (id) => Math.max(0, room.players.findIndex((p) => p.id === id));
  const colorOf = (id) => PLAYER_COLORS[playerIndex(id) % PLAYER_COLORS.length];
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || "Otro jugador";
  const myPoints = me?.lastPoints || 0;
  const myHits = me?.hits || 0;
  const lastRound = round + 1 >= room.totalRounds;

  const totalMs = phase === "playing" ? question?.roundMs || rainConfig(room).roundMs : COUNTDOWN_MS;
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const pct = phase === "playing" || phase === "countdown" ? Math.max(0, Math.min(100, (left / totalMs) * 100)) : 100;
  const urgent = phase === "playing" && left <= 5000;

  // The top card's middle line, where other games put the question: what this round is about (and, at the reveal, who
  // won it). This player's points of the round are beside the box under the rain (`score`).
  let title;
  if (phase === "countdown") title = "¡Prepárate, va a llover!";
  else if (outcome) title = outcome.title;
  else if (reveal) title = lastRound ? "¡Se acabó la lluvia!" : "Fin de la ronda";
  else if (central) title = "¡Escriban las respuestas!";
  else if (spectator) title = "Estás viendo la partida";
  else title = "Responde antes que nadie";

  // Its last line: what to do now, or what the last answer did (with an icon, green for a hit, red for a miss).
  let hint;
  let hintIcon = "keyboard";
  let hintTone = "";
  if (err) {
    hint = err;
    hintIcon = "close";
    hintTone = " is-out";
  } else if (last?.hit && phase === "playing") {
    hint = `¡+${last.hit.points}! ${last.hit.answer}`;
    hintIcon = "check";
    hintTone = " is-sent";
  } else if (last?.takenBy && phase === "playing") {
    hint = `${last.takenBy} respondió «${last.answer}» antes que tú`;
    hintIcon = "bolt";
    hintTone = " is-out";
  } else if ((last?.miss || last?.error) && phase === "playing") {
    hint = last.error || `«${last.miss}» no es la respuesta de ninguna pregunta`;
    hintIcon = "close";
    hintTone = " is-out";
  } else if (phase === "countdown") {
    hint = "Verde 1 punto, amarilla 3 y roja 5. Cada pregunta es de quien la responda primero.";
    hintIcon = "star";
  } else if (reveal) {
    hint = lastRound ? "Calculando resultados…" : "Siguiente ronda en breve…";
    hintIcon = "check";
  } else if (central) {
    hint = "Cada uno escribe en su teléfono. Cada pregunta es de quien la responda primero.";
    hintIcon = "phone";
  } else if (spectator) {
    hint = "Jugarás en la siguiente partida.";
    hintIcon = "info";
  } else {
    hint = myHits ? `${hitsText(myHits)}. ¡Sigue, que no paran de caer!` : "Escribe la respuesta de cualquier pregunta y pulsa Enter.";
  }

  // The host's controls of the match: in the top card, or in the thin bar of a phone beside a central device.
  const tools = (
    <>
      <SkipButton room={room} onError={setErr} />
      <PauseButton room={room} isHost={isHost} onError={setErr} />
      {isHost && (
        <button type="button" className={`tv-mini-btn${confirmHub ? " is-on" : ""}`} onClick={backToHub}>
          {confirmHub ? "¿Seguro? Toca otra vez" : "Terminar"}
        </button>
      )}
    </>
  );
  const hintLine = (
    <p key={`${phase}-${hintIcon}-${last?.key || 0}-${err}`} className={`tv-hint tv-mines-hint tv-rain-hint${hintTone}`} role="status">
      <Icon name={hintIcon} size={15} strokeWidth={2.8} />
      <span>{hint}</span>
    </p>
  );
  const levels = rainConfig(room).difficulties;
  const countdown = phase === "countdown" && (
    <div className="tv-rain-countdown">
      {controller ? (
        <GetReady />
      ) : (
        <>
          <span key={Math.max(1, seconds)} className="tv-quiz-count" aria-label={`Empieza en ${Math.max(1, seconds)}`}>
            {Math.max(1, seconds)}
          </span>
          <span className="tv-rain-legend" aria-hidden="true">
            {DIFFICULTIES.filter((d) => levels.includes(d.id)).map((d) => (
              <span key={d.id} className={`tv-rain-legend-chip is-${d.id}`}>
                {d.label} <strong>+{d.points}</strong>
              </span>
            ))}
          </span>
        </>
      )}
    </div>
  );
  const burstCard = burst && (
    <div key={burst.key} className={`tv-mines-burst tv-rain-burst is-${burst.tone}`} role="alert">
      <span className="tv-mines-burst-card">
        {burst.confetti && <Confetti pieces={28} />}
        <span className="tv-mines-burst-icon">
          <Icon name={burst.icon} size={30} strokeWidth={2.6} filled={burst.icon === "crown"} />
        </span>
        <strong>{burst.title}</strong>
        {burst.detail && <small>{burst.detail}</small>}
        {!central && !spectator && myPoints > 0 && <span className="tv-tag tv-tag--points">+{myPoints}</span>}
      </span>
    </div>
  );

  return (
    <div className={`tv-room tv-game tv-rain${central ? " is-central" : ""}${controller ? " is-controller" : ""}`}>
      <div ref={frameRef} className="tv-room-main tv-game-main tv-rain-frame">
        {spectator && <SpectatorBanner />}
        {controller ? (
          <ControllerBar seconds={seconds} pct={pct} urgent={urgent}>
            {tools}
          </ControllerBar>
        ) : (
          <section className="tv-game-top">
            <div className="tv-game-round tv-mines-find">
              <p className="tv-mono-label">
                Ronda {round + 1} de {room.totalRounds} · Lluvia
              </p>
              <h1 key={`${round}-${title}`} className="tv-card-title tv-mines-prompt tv-rain-title">
                {title}
              </h1>
              {hintLine}
            </div>

            <div className={`tv-clock${urgent ? " is-urgent" : ""}`} role="timer" aria-label={`${seconds} segundos`}>
              <svg viewBox="0 0 44 44" aria-hidden="true">
                <circle className="tv-clock-track" cx="22" cy="22" r="19" />
                <circle className="tv-clock-fill" cx="22" cy="22" r="19" style={{ strokeDashoffset: 119.4 * (1 - pct / 100) }} />
              </svg>
              <span key={seconds} className="tv-clock-num">{seconds}</span>
            </div>

            <div className="tv-game-tools">{tools}</div>

            <div className="tv-timer" aria-hidden="true">
              <span className={`tv-timer-fill${urgent ? " is-urgent" : ""}`} style={{ width: `${pct}%` }} />
            </div>
          </section>
        )}

        {question ? (
          <section key={round} className="tv-game-stage tv-rain-stage">
            <PauseVeil room={room} isHost={isHost} />
            {controller ? (
              // A phone beside the central device: the rain is on the big screen; here, how this round goes.
              <div className="tv-rain-pad">
                {countdown}
                {phase !== "countdown" && (
                  <>
                    <p className="tv-rain-pad-label">{reveal ? "Tu ronda" : "Tus puntos en esta ronda"}</p>
                    <strong key={myPoints} className="tv-rain-pad-points">{myPoints}</strong>
                    {outcome ? (
                      <p className="tv-rain-pad-note">{outcome.title}</p>
                    ) : (
                      <ul className="tv-rain-pad-log" aria-label="Tus últimos aciertos">
                        {log.map((hit, i) => (
                          <li key={`${hit.drop}-${i}`}>
                            <span>+{hit.points}</span>
                            {hit.answer}
                          </li>
                        ))}
                      </ul>
                    )}
                    {hintLine}
                  </>
                )}
              </div>
            ) : (
              <Sky
                room={room}
                question={question}
                viewerId={viewerId}
                nameOf={nameOf}
                colorOf={colorOf}
                onTap={canWrite ? () => setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0) : undefined}
              >
                {countdown}
                {burstCard}
              </Sky>
            )}

            {(canWrite || central) && (
              <div className="tv-rain-bar">
                {canWrite ? (
                  <>
                    <AnswerBox room={room} open={open} inputRef={inputRef} onResult={onResult} />
                    {/* This player's points in the round, beside where they're won; the number pops with each one. */}
                    <span className="tv-rain-score" role="status" aria-label={`${pointsText(myPoints)} en esta ronda`} title="Tus puntos en esta ronda">
                      <span className="tv-rain-score-icon" aria-hidden="true">
                        <Icon name="star" size={18} strokeWidth={2.6} filled />
                      </span>
                      <span className="tv-rain-score-text" aria-hidden="true">
                        <strong key={myPoints}>{myPoints}</strong>
                        <small>{myPoints === 1 ? "punto" : "puntos"}</small>
                      </span>
                    </span>
                  </>
                ) : (
                  <PhoneHint>Escriban las respuestas en su teléfono</PhoneHint>
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="tv-game-stage tv-countdown">
            <PauseVeil room={room} isHost={isHost} />
            <p className="tv-party-status">
              <span className="tv-pulse" aria-hidden="true" />
              Cargando la lluvia…
            </p>
          </section>
        )}
      </div>

      {/* The scoreboard is the central device's, when there is one. */}
      {!controller && <PartyPanel room={room} scores display={central} onToast={setErr} />}
    </div>
  );
}

export default function Game() {
  return (
    <TvShell mode="lluvia">
      <GameScreen />
    </TvShell>
  );
}
