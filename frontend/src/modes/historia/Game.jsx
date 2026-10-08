import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import { useApp, useRemainingMs } from "../../lib/store.jsx";
import Timeline from "./Timeline.jsx";
import { findDifficulty, findEra, historyConfig, yearLabel, yearsText } from "./historyInfo.js";
import "../../styles/home.css";
import "../../styles/quiz.css";
import "../../styles/history.css";

const COUNTDOWN_MS = 3000;
// One colour per player for their year on the reveal's timeline (never the green and red of right and wrong).
const MARK_COLORS = ["#ffb52e", "#a58bff", "#2ea8ff", "#f2456b", "#14b8a6", "#ff9f1c", "#e879f9", "#7c80ff"];
// A year being moved goes to the server once it stops for this long (and right away when it's let go or confirmed),
// so the last one counts if the time runs out before "Confirmar".
const SEND_DELAY_MS = 250;

// Closes a sentence with a period, unless it already ends in one ("Fue en 44 a. C.").
const sentence = (text) => (text.endsWith(".") ? text : `${text}.`);

// "Ana", "Ana y Luis", "Ana, Luis y Eva".
function joinNames(names) {
  if (names.length < 2) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function GameScreen() {
  const { code } = useParams();
  const { user, room, joinRoom, placeYear, setGame } = useApp();
  const nav = useNavigate();
  // Phones and tablets get "toca" in the hints; a mouse gets "haz clic".
  const [touch] = useState(() => Boolean(window.matchMedia?.("(pointer: coarse)").matches));

  const left = useRemainingMs(room);
  const [err, setErr] = useState("");
  // This player's year on the round being played: { round, year, locked }.
  const [guess, setGuess] = useState(null);
  // Host's "Terminar" mid-match needs a second tap, since it ends the match for everyone.
  const [confirmHub, setConfirmHub] = useState(false);
  const sending = useRef(false);
  const sendTimer = useRef(null);
  const pending = useRef(null);
  // The phase right now, for replies that arrive after the round closed (their errors no longer matter).
  const phaseRef = useRef(room?.phase);
  phaseRef.current = room?.phase;

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
  const tiebreak = room?.tiebreak || null;
  const spectator = Boolean(room?.players?.find((p) => p.id === user?.id)?.spectator);
  const iPlay = !spectator && (!tiebreak || tiebreak.playerIds.includes(user?.id));
  const playerObj = room?.players?.find((p) => p.id === user?.id);
  const me = playerObj
    ? { ...playerObj, ...(room?.me?.id === user?.id ? room.me : {}), lastAnswer: playerObj.lastAnswer || room?.me?.lastAnswer }
    : room?.me;
  const myGuess = guess?.round === round ? guess : null;
  const confirmed = Boolean(myGuess?.locked) || Boolean(me?.answered);
  const open = phase === "playing" && iPlay && !confirmed && question?.min != null;
  const min = question?.min ?? null;
  const max = question?.max ?? null;
  const limit = max != null ? Math.min(max, new Date().getFullYear()) : null;
  const step = min != null ? (max - min) / 10 : 10;
  const crossesZero = min != null && min < 0 && max > 0;
  const fmt = (year) => yearLabel(year, { crossesZero });

  // A new round: clean slate (and nothing left to send from the last one).
  useEffect(() => {
    sending.current = false;
    clearTimeout(sendTimer.current);
    pending.current = null;
  }, [round]);
  useEffect(() => setErr(""), [round, phase]);
  useEffect(() => () => clearTimeout(sendTimer.current), []);

  // After a reload mid-round, the year this player had chosen comes back with the room.
  useEffect(() => {
    if (room?.me?.guess != null && !myGuess) setGuess({ round, year: room.me.guess, locked: Boolean(room.me.lastAnswer) });
  }, [room?.me?.guess, round]);

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

  // The buttons and the keys: from the chosen year (or the middle of the line, before there is one), skipping year 0.
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

  // Keys while the round is open: ← → move a year (with Shift, or ↑ ↓ and Re Pág / Av Pág, a tenth of the line),
  // Inicio / Fin go to the ends, Enter confirms.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const big = step;
      const moves = {
        ArrowLeft: e.shiftKey ? -big : -1,
        ArrowRight: e.shiftKey ? big : 1,
        ArrowDown: -big,
        ArrowUp: big,
        PageDown: -big,
        PageUp: big,
      };
      if (e.key in moves) {
        e.preventDefault();
        nudge(moves[e.key]);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        choose(e.key === "Home" ? min : limit);
      } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        confirm();
      }
    };
    const onKeyUp = (e) => {
      if (e.key.startsWith("Arrow") || e.key.startsWith("Page") || e.key === "Home" || e.key === "End") flush();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
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

  if (phase === "finished" && room.results) return <MatchResults room={room} color="history" />;

  const isHost = room.hostId === user?.id;
  const totalMs = historyConfig(room).roundMs;
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const pct =
    phase === "playing"
      ? Math.max(0, Math.min(100, (left / totalMs) * 100))
      : phase === "countdown"
      ? Math.max(0, Math.min(100, (left / COUNTDOWN_MS) * 100))
      : 100;
  const urgent = phase === "playing" && left <= 4000;
  const era = findEra(question?.era);
  const level = findDifficulty(question?.difficulty);
  const reveal = phase === "reveal" ? room.reveal : null;
  const tiedNames = tiebreak ? tiebreak.playerIds.map((id) => room.players.find((p) => p.id === id)?.name || "Jugador") : [];
  const colorOf = (id) => MARK_COLORS[Math.max(0, room.players.findIndex((p) => p.id === id)) % MARK_COLORS.length];

  // Everyone's year at the reveal (only the tied players' in a tiebreak).
  const marks = reveal
    ? room.players
        .filter((p) => Number.isInteger(p.lastAnswer?.year) && (!tiebreak || tiebreak.playerIds.includes(p.id)))
        .map((p) => ({
          id: p.id,
          year: p.lastAnswer.year,
          color: colorOf(p.id),
          label: p.id === user?.id ? "Tú" : p.name.slice(0, 12),
          isMe: p.id === user?.id,
        }))
    : [];

  const nextText = tiebreak
    ? tiebreak.winnerId
      ? "Calculando resultados…"
      : tiebreak.round >= 3
      ? "Sigue el empate: calculando resultados…"
      : "Nadie ganó: otro desempate en breve…"
    : round + 1 >= room.totalRounds
    ? "Calculando resultados…"
    : "Siguiente acontecimiento en breve…";

  // Under the event: what to do now.
  let hint;
  if (phase === "countdown") {
    if (tiebreak) {
      hint = iPlay
        ? "Desempate: gana el primero que confirme el año exacto. Si nadie lo clava, el más cercano."
        : "Solo juegan los empatados. Tú miras cómo lo resuelven.";
    } else hint = "¿En qué año ocurrió? Prepárate para elegirlo en la línea del tiempo.";
  } else if (phase === "reveal") hint = tiebreak ? "" : closestText(room, user, fmt);
  else if (!iPlay) hint = `Solo juegan ${joinNames(tiedNames)}: gana el primero que confirme el año exacto.`;
  else if (confirmed) hint = tiebreak ? "Año confirmado. Si es el exacto y fuiste el primero, ganas." : "Año confirmado. Esperando al resto…";
  else if (myGuess) hint = `Ajusta con los botones${touch ? "" : " o las flechas"} y confirma.`;
  else hint = touch ? "Toca la línea del tiempo para elegir un año." : "Haz clic en la línea del tiempo o usa las flechas del teclado.";

  if (spectator && phase !== "reveal") hint = "Estás viendo la partida. Entrarás a la sala cuando termine.";

  // The row under the timeline, always the same height: confirm, or what's going on.
  let action;
  if (spectator && phase !== "reveal") {
    action = <p className="tv-hint tv-hist-next">Mira cómo responden los demás</p>;
  } else if (phase === "reveal") {
    action = <p className="tv-hint tv-hist-next">{nextText}</p>;
  } else if (!iPlay) {
    action = <p className="tv-hint tv-hist-next">Mira el desempate entre {joinNames(tiedNames)}</p>;
  } else {
    action = (
      <button
        type="button"
        className="tv-btn tv-btn--block tv-c-history"
        onClick={confirm}
        disabled={!open || myGuess?.year == null}
        aria-live="polite"
      >
        <Icon name={confirmed ? "check" : "calendar"} size={20} strokeWidth={2.6} />
        {confirmed ? "Año confirmado" : myGuess ? `Confirmar ${fmt(myGuess.year)}` : "Elige un año en la línea"}
      </button>
    );
  }

  return (
    <div className="tv-room tv-game tv-hist">
      <div className="tv-room-main tv-game-main">
        <section className="tv-game-top">
          <div className="tv-game-round">
            <p className="tv-mono-label">Sala {room.code} · Línea del tiempo</p>
            <h1 className="tv-card-title">
              {tiebreak ? (
                `Desempate${tiebreak.round > 1 ? ` ${tiebreak.round}` : ""}`
              ) : (
                <>
                  Ronda {round + 1} <span className="tv-muted">de {room.totalRounds}</span>
                </>
              )}
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
          <section key={round} className="tv-game-stage tv-hist-stage">
            <div className="tv-hist-event">
              <div className="tv-quiz-q-meta">
                {era && <span className="tv-match-chip">{era.label}</span>}
                <span className={`tv-match-chip tv-diff-chip tv-c-${level.color}`}>{level.label}</span>
              </div>
              <h2 className="tv-hist-prompt">{question.prompt}</h2>
              <p className="tv-hint tv-hist-hint" aria-live="polite">
                {hint}
              </p>
            </div>

            {/* Always the same height, so nothing moves: the countdown, the chosen year with its buttons, then the
                verdict. */}
            <div className="tv-hist-slot">
              {phase === "countdown" && (
                <span key={Math.max(1, seconds)} className="tv-quiz-count" aria-label={`Empieza en ${Math.max(1, seconds)}`}>
                  {Math.max(1, seconds)}
                </span>
              )}
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
              {reveal && !spectator && <Verdict room={room} me={me} user={user} tiebreak={tiebreak} tiedNames={tiedNames} iPlay={iPlay} fmt={fmt} />}
            </div>

            <Timeline
              min={min}
              max={max}
              value={myGuess?.year ?? null}
              onChoose={choose}
              onRelease={flush}
              disabled={!open}
              answer={reveal ? reveal.year : null}
              marks={marks}
              format={fmt}
              label={min != null ? `Línea del tiempo de ${fmt(min)} a ${fmt(max)}` : "Línea del tiempo"}
            />

            <div className="tv-hist-action">{action}</div>

            {err && (
              <p className="tv-lobby-error" role="alert">
                {err}
              </p>
            )}
          </section>
        ) : (
          <section className="tv-game-stage tv-countdown">
            <p className="tv-party-status">
              <span className="tv-pulse" aria-hidden="true" />
              Cargando el acontecimiento…
            </p>
          </section>
        )}
      </div>

      <PartyPanel room={room} scores onToast={setErr} />
    </div>
  );
}

// At the reveal, with more than one player: who came closest this round (or got the exact year).
function closestText(room, user, fmt) {
  const answers = room.players.filter((p) => Number.isInteger(p.lastAnswer?.diff));
  if (room.players.length < 2) return "";
  if (!answers.length) return "Nadie eligió un año a tiempo.";
  const best = Math.min(...answers.map((p) => p.lastAnswer.diff));
  const names = answers.filter((p) => p.lastAnswer.diff === best).map((p) => (p.id === user?.id ? "tú" : p.name));
  const who = joinNames(names);
  const label = who[0].toUpperCase() + who.slice(1);
  if (best === 0) return names.length > 1 ? `¡${label} clavaron el año!` : `¡${label} ${names[0] === "tú" ? "clavaste" : "clavó"} el año!`;
  return sentence(`Más cerca: ${label}, a ${yearsText(best)} de ${fmt(room.reveal.year)}`);
}

// The end of a round: how far this player's year was (and the right one), or who won the tiebreak.
function Verdict({ room, me, user, tiebreak, tiedNames, iPlay, fmt }) {
  const answer = me?.lastAnswer;
  const year = room.reveal.year;
  let tone;
  let icon;
  let title;
  let detail;
  let won = false;
  let points = false;
  if (tiebreak) {
    const winner = room.players.find((p) => p.id === tiebreak.winnerId);
    won = Boolean(winner) && winner.id === user?.id;
    tone = winner ? (won || !iPlay ? "ok" : "bad") : "timeout";
    icon = winner ? "crown" : "hash";
    title = winner ? (won ? "¡Ganaste el desempate!" : `¡${winner.name} gana el desempate!`) : "Nadie lo resolvió";
    detail = winner
      ? tiebreak.reason === "exacto"
        ? `${won ? "Confirmaste" : "Confirmó"} ${fmt(year)} primero.`
        : sentence(`Nadie lo clavó: ${won ? "tu" : "su"} año quedó más cerca de ${fmt(year)}`)
      : `${joinNames(tiedNames)} siguen empatados.`;
  } else {
    const chose = Number.isInteger(answer?.year);
    const exact = Boolean(answer?.correct);
    won = exact;
    points = chose;
    tone = exact ? "ok" : chose ? "near" : "timeout";
    icon = exact ? "check" : chose ? "target" : "hash";
    title = exact ? "¡Año exacto!" : chose ? `A ${yearsText(answer.diff)}` : "¡Se acabó el tiempo!";
    detail = exact ? sentence(`Fue en ${fmt(year)}`) : chose ? `Fue en ${fmt(year)} · elegiste ${fmt(answer.year)}` : sentence(`No elegiste un año. Fue en ${fmt(year)}`);
  }
  return (
    <div className={`tv-hist-verdict tv-hist-verdict--${tone}`} role="status">
      {won && <Confetti pieces={18} />}
      <span className="tv-hist-verdict-icon">
        <Icon name={icon} size={22} strokeWidth={tiebreak ? 2.6 : 3} />
      </span>
      <span className="tv-hist-verdict-text">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {points && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0}</span>}
    </div>
  );
}

export default function Game() {
  return (
    <TvShell mode="historia">
      <GameScreen />
    </TvShell>
  );
}
