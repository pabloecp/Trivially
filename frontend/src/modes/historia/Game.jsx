import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import { ControllerBar, GetReady, PhoneHint } from "../../components/home/CentralBits.jsx";
import { useApp, useRemainingMs, useView } from "../../lib/store.jsx";
import Timeline from "./Timeline.jsx";
import { figureLabel, figureScale, findDifficulty, historyConfig, yearLabel, yearsText } from "./historyInfo.js";
import "../../styles/home.css";
import "../../styles/quiz.css";
import "../../styles/history.css";
import { PauseButton, ReportButton, SkipButton, PauseVeil } from "../../components/home/PauseControls.jsx";
import { resolveCode } from "../../lib/hiddenCode.js";
import { AnswerCard, MatchBar, MatchCard, MatchQuestion, RoundCountdown, RoundVerdict } from "../../components/home/MatchFrame.jsx";

import { translate as tr } from "../../lib/i18n.js";
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
  return tr("{list} y {last}", { list: names.slice(0, -1).join(", "), last: names[names.length - 1] });
}

function GameScreen() {
  const { code: codeParam } = useParams();
  const { user, room, joinRoom, placeYear, restartGame } = useApp();
  // The address's code ("oculta" while it's hidden: this tab's room, lib/hiddenCode.js).
  const code = resolveCode(codeParam, room);
  const nav = useNavigate();
  // With a central device in the room, the event shows there (and, at the reveal, everyone's year on its timeline);
  // the players' phones only have the timeline and the buttons to pick the year.
  const { central, controller, viewerId } = useView(room);
  // Phones and tablets get "toca" in the hints; a mouse gets "haz clic".
  const [touch] = useState(() => Boolean(window.matchMedia?.("(pointer: coarse)").matches));

  const left = useRemainingMs(room);
  const [err, setErr] = useState("");
  // This player's year (or Cifras' number) on the round being played: { round, year, locked }.
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
    if (code && (!room || room.code !== code)) joinRoom(code).catch(() => nav("/", { replace: true }));
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
  const spectator = Boolean(room?.players?.find((p) => p.id === viewerId)?.spectator);
  const iPlay = !central && !spectator && (!tiebreak || tiebreak.playerIds.includes(viewerId));
  const playerObj = room?.players?.find((p) => p.id === viewerId);
  const me = central
    ? null
    : playerObj
    ? { ...playerObj, ...(room?.me?.id === user?.id ? room.me : {}), lastAnswer: playerObj.lastAnswer || room?.me?.lastAnswer }
    : room?.me;
  const myGuess = guess?.round === round ? guess : null;
  const confirmed = Boolean(myGuess?.locked) || Boolean(me?.answered);
  const open = phase === "playing" && iPlay && !confirmed && question?.min != null;
  const min = question?.min ?? null;
  const max = question?.max ?? null;
  // Cifras: a number on a bar (no future, no year 0), placed on the bar in steps of `snap`; the small buttons always move 1, to land on the exact number.
  const isNum = question?.kind === "cifras";
  const unit = question?.unit || "";
  const snap = question?.snap || 1;
  const limit = max != null ? (isNum ? max : Math.min(max, new Date().getFullYear())) : null;
  const step = min != null ? (max - min) / 10 : 10;
  const fine = 1;
  const crossesZero = !isNum && min != null && min < 0 && max > 0;
  const fmt = (n) => (isNum ? figureLabel(n, unit) : yearLabel(n, { crossesZero }));
  // What a player answered, either way.
  const answerOf = (a) => (isNum ? a?.value : a?.year);
  const send = (n, lock) => placeYear(isNum ? { value: n, lock } : { year: n, lock });

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
    send(year, false).catch((e) => {
      if (phaseRef.current === "playing") setErr(e.message || (isNum ? tr("No se pudo guardar tu número") : tr("No se pudo guardar tu año")));
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
    if (isNum) return choose(Math.min(limit, Math.max(min, from + delta)));
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
      await send(myGuess.year, true);
    } catch (e) {
      sending.current = false;
      if (phaseRef.current !== "playing") return;
      setGuess({ ...myGuess, locked: false });
      setErr(e.message || (isNum ? tr("No se pudo confirmar tu número") : tr("No se pudo confirmar tu año")));
    }
  }

  // Keys while the round is open: ← → move a year (in Cifras, 1; with Shift, or ↑ ↓ and Re Pág / Av Pág, a tenth of the line),
  // Inicio / Fin go to the ends, Enter confirms.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const big = step;
      const moves = {
        ArrowLeft: e.shiftKey ? -big : -fine,
        ArrowRight: e.shiftKey ? big : fine,
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
    restartGame().catch((e) => setErr(e.message || tr("No se pudo terminar la partida")));
  }

  if (!room) {
    return (
      <div className="tv-card tv-lobby-guest">
        <p className="tv-party-status">
          <span className="tv-pulse" aria-hidden="true" />
          {tr("Conectando a la partida…")}
        </p>
      </div>
    );
  }

  if (phase === "finished" && room.results) return <MatchResults room={room} />;

  const isHost = !central && room.hostId === user?.id;
  const totalMs = historyConfig(room).roundMs;
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const pct =
    phase === "playing"
      ? Math.max(0, Math.min(100, (left / totalMs) * 100))
      : phase === "countdown"
      ? Math.max(0, Math.min(100, (left / COUNTDOWN_MS) * 100))
      : 100;
  const urgent = phase === "playing" && left <= 4000;
  const level = findDifficulty(question?.difficulty);
  const reveal = phase === "reveal" ? room.reveal : null;
  const answerValue = reveal ? (isNum ? reveal.value : reveal.year) : null;
  const tiedNames = tiebreak ? tiebreak.playerIds.map((id) => room.players.find((p) => p.id === id)?.name || tr("Jugador")) : [];
  const colorOf = (id) => MARK_COLORS[Math.max(0, room.players.findIndex((p) => p.id === id)) % MARK_COLORS.length];

  // Everyone's year at the reveal (only the tied players' in a tiebreak).
  const marks = reveal
    ? room.players
        .filter((p) => Number.isInteger(answerOf(p.lastAnswer)) && (!tiebreak || tiebreak.playerIds.includes(p.id)))
        .map((p) => ({
          id: p.id,
          year: answerOf(p.lastAnswer),
          color: colorOf(p.id),
          label: p.name.slice(0, 12),
          isMe: p.id === viewerId,
        }))
    : [];

  const nextText = tiebreak
    ? tiebreak.winnerId
      ? tr("Calculando resultados…")
      : tiebreak.round >= 3
      ? tr("Sigue el empate: calculando resultados…")
      : tr("Nadie ganó: otro desempate en breve…")
    : round + 1 >= room.totalRounds
    ? tr("Calculando resultados…")
    : tr("Siguiente pregunta en breve…");

  // The words of each way of playing.
  const words = isNum
    ? { exact: tr("el número exacto"), done: tr("Número confirmado"), line: tr("la barra"), pick: tr("un número") }
    : { exact: tr("el año exacto"), done: tr("Año confirmado"), line: tr("la línea del tiempo"), pick: tr("un año") };

  // Under the question: what to do now.
  let hint;
  if (phase === "countdown") {
    if (tiebreak) {
      hint = iPlay
        ? tr("Desempate: gana el primero que confirme {exact}. Si nadie lo clava, el más cercano.", { exact: words.exact })
        : tr("Solo juegan los empatados. Tú miras cómo lo resuelven.");
    } else hint = isNum ? tr("¿Cuánto será? Prepárate para elegirlo en la barra.") : tr("¿En qué año ocurrió? Prepárate para elegirlo en la línea del tiempo.");
  } else if (phase === "reveal") hint = tiebreak ? "" : closestText(room, fmt, isNum);
  else if (!iPlay) hint = tr("Solo juegan {v0}: gana el primero que confirme {exact}.", { v0: joinNames(tiedNames), exact: words.exact });
  else if (confirmed)
    hint = tiebreak
      ? tr("{done}. Si es {exact} y fuiste el primero, ganas.", { done: words.done, exact: words.exact })
      : `${words.done}.`;
  else if (myGuess) hint = tr("Ajusta con los botones{v0} y confirma.", { v0: touch ? "" : tr(" o las flechas") });
  else hint = touch ? tr("Toca {line} para elegir {pick}.", { line: words.line, pick: words.pick }) : tr("Haz clic en {line} o usa las flechas del teclado.", { line: words.line });

  if (spectator && phase !== "reveal") hint = tr("Estás viendo la partida. Entrarás a jugar cuando termine.");
  // The central device talks to the whole room: they pick the year on their phones.
  if (central && phase === "countdown") {
    hint = tiebreak
      ? tr("Desempate entre {v0}: gana el primero que confirme {exact}.", { v0: joinNames(tiedNames), exact: words.exact })
      : isNum
      ? tr("¿Cuánto será? Elíjanlo en su teléfono.")
      : tr("¿En qué año ocurrió? Elíjanlo en su teléfono.");
  } else if (central && phase === "playing") {
    hint = tiebreak
      ? tr("Solo juegan {names}.", { names: joinNames(tiedNames) })
      : isNum
      ? tr("Elijan el número en la barra de su teléfono.")
      : tr("Elijan el año en la línea del tiempo de su teléfono.");
  }

  // The two buttons on each side of the chosen number: a little (a year, or 1 in Cifras) and a lot (ten years, a
  // tenth of the bar), the small one next to the number.
  const stepButtons = (dir) => {
    const mark = dir < 0 ? "−" : "+";
    const sizes = dir < 0 ? [step, fine] : [fine, step];
    return sizes.map((n) => (
      <button
        key={n}
        type="button"
        className="tv-hist-step"
        onClick={() => nudge(dir * n)}
        disabled={!open}
        aria-label={`${dir < 0 ? tr("Restar") : tr("Sumar")} ${isNum ? figureLabel(n) : n === 1 ? tr("un año") : tr("{n} años", { n: n })}`}
      >
        {mark}
        {isNum ? figureLabel(n) : n}
      </button>
    ));
  };

  // The row under the timeline, always the same height: confirm, or what's going on.
  let action;
  if (central) {
    action = <p className="tv-hint tv-hist-next">{phase === "reveal" ? nextText : phase === "countdown" ? tr("Prepárense…") : ""}</p>;
  } else if (spectator && phase !== "reveal") {
    action = <p className="tv-hint tv-hist-next">{tr("Mira cómo responden los demás")}</p>;
  } else if (phase === "reveal") {
    action = <p className="tv-hint tv-hist-next">{nextText}</p>;
  } else if (!iPlay) {
    action = <p className="tv-hint tv-hist-next">{tr("Mira el desempate entre")} {joinNames(tiedNames)}</p>;
  } else {
    action = (
      <button
        type="button"
        className="tv-btn tv-btn--primary tv-hist-confirm"
        onClick={confirm}
        disabled={!open || myGuess?.year == null}
        aria-live="polite"
      >
        <Icon name={confirmed ? "check" : "send"} size={20} strokeWidth={2.6} />
        {confirmed ? tr("Enviado") : tr("Enviar")}
      </button>
    );
  }

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
          {confirmHub ? tr("¿Seguro? Toca otra vez") : tr("Terminar")}
        </button>
      )}
    </>
  );

  return (
    <div className={`tv-room tv-game tv-match tv-hist${central ? " is-central" : ""}${controller ? " is-controller" : ""}`}>
      <div className="tv-room-main tv-game-main">
        {/* Beside a central device the round and the clock are on the big screen: only the timeline here. */}
        {controller ? (
          <ControllerBar seconds={seconds} pct={pct} urgent={urgent}>
            {tools}
          </ControllerBar>
        ) : (
          <MatchCard
            room={room}
            tag={tiebreak ? (tiebreak.round > 1 ? tr("Desempate {n}", { n: tiebreak.round }) : tr("Desempate")) : null}
            seconds={seconds}
            pct={pct}
            urgent={urgent}
            pills={reveal && !tiebreak && !spectator && !central ? <HistVerdict me={me} fmt={fmt} isNum={isNum} /> : null}
          >
            <MatchQuestion>{question?.prompt || tr("Cargando la pregunta…")}</MatchQuestion>
          </MatchCard>
        )}

        {question ? (
          <section key={round} className="tv-game-stage tv-hist-stage tv-mpanel">
            <PauseVeil room={room} isHost={isHost} />
            {!controller && <RoundCountdown room={room} seconds={seconds} />}
            {controller && (
              <div className="tv-hist-event">
                <p className="tv-hint tv-hist-hint" aria-live="polite">
                  {hint}
                </p>
              </div>
            )}
            {/* The answer's row, always as tall: "TU RESPUESTA" and, on the right, the countdown, the chosen number (or
                year) big, or the verdict. */}
            <div className="tv-hist-slot">
              {phase === "countdown" && controller && <GetReady />}
              {phase === "playing" && central && <PhoneHint room={room}>{tr("Respondan desde su teléfono")}</PhoneHint>}
              {reveal && central && !tiebreak && (
                <p className="tv-central-answer">
                  <small>{isNum ? tr("Era") : tr("Fue en")}</small> {fmt(answerValue)}
                </p>
              )}
              {reveal && central && tiebreak && (
                <Verdict room={room} me={null} user={null} tiebreak={tiebreak} tiedNames={tiedNames} iPlay={false} fmt={fmt} isNum={isNum} />
              )}
              {phase === "playing" && !central && (
                <div className={`tv-hist-picker${confirmed ? " is-locked" : ""}`}>
                  {stepButtons(-1)}
                    <output className={`tv-hist-year${myGuess ? "" : " is-empty"}${isNum ? " is-number" : ""}`} aria-live="polite">
                      {myGuess && isNum ? (
                        <>
                          {figureLabel(myGuess.year)}
                          {unit && <small>{unit}</small>}
                        </>
                      ) : myGuess ? (
                        <>
                          {Math.abs(myGuess.year)}
                          {(myGuess.year < 0 || crossesZero) && <small>{myGuess.year < 0 ? "a. C." : "d. C."}</small>}
                        </>
                      ) : (
                        "¿?"
                      )}
                    </output>
                  {stepButtons(1)}
                </div>
              )}
              {reveal && !spectator && !central && (
                <Verdict room={room} me={me} user={user} tiebreak={tiebreak} tiedNames={tiedNames} iPlay={iPlay} fmt={fmt} isNum={isNum} />
              )}
            </div>

            {/* The bar (the arrow keys move it too). */}
            <div className={`tv-hist-barrow${confirmed ? " is-locked" : ""}`}>
              <Timeline
                min={min}
                max={max}
                value={myGuess?.year ?? null}
                onChoose={choose}
                onRelease={flush}
                disabled={!open}
                answer={answerValue}
                marks={marks}
                format={fmt}
                numeric={isNum}
                snap={snap}
                scaleFormat={figureScale}
                label={
                  min == null ? (isNum ? tr("Barra") : tr("Línea del tiempo")) : tr("{v0} de {v1} a {v2}", { v0: isNum ? tr("Barra") : tr("Línea del tiempo"), v1: fmt(min), v2: fmt(max) })
                }
              />
            </div>

            <div className="tv-hist-action">{action}</div>

            {err && (
              <p className="tv-lobby-error" role="alert">
                {err}
              </p>
            )}
          </section>
        ) : (
          <section className="tv-game-stage tv-countdown">
            <PauseVeil room={room} isHost={isHost} />
            <p className="tv-party-status">
              <span className="tv-pulse" aria-hidden="true" />
              {tr("Cargando la pregunta…")}
            </p>
          </section>
        )}
      </div>

      {/* The scoreboard is the central device's, when there is one. */}
      {!controller && <PartyPanel room={room} scores display={central} onToast={setErr} />}
      {/* A tiebreak's rules (who plays it, how it's won) or an error, in place of who is missing. */}
      {!controller && !central && <MatchBar room={room} viewerId={viewerId} tools={tools} line={err || (tiebreak && phase !== "reveal" ? hint : undefined)} />}
    </div>
  );
}


// At the reveal, with more than one player: who came closest this round (or got the exact year or number).
function closestText(room, fmt, isNum) {
  const answers = room.players.filter((p) => Number.isInteger(p.lastAnswer?.diff));
  if (room.players.length < 2) return "";
  if (!answers.length) return isNum ? tr("Nadie eligió un número a tiempo.") : tr("Nadie eligió un año a tiempo.");
  const best = Math.min(...answers.map((p) => p.lastAnswer.diff));
  const closest = answers.filter((p) => p.lastAnswer.diff === best);
  const names = closest.map((p) => p.name);
  const who = joinNames(names);
  const label = who[0].toUpperCase() + who.slice(1);
  const exact = isNum ? closest.every((p) => p.lastAnswer.correct) : best === 0;
  if (exact) return tr(names.length > 1 ? "¡{label} clavaron {what}!" : "¡{label} clavó {what}!", { label, what: isNum ? tr("el número") : tr("el año") });
  if (isNum) return sentence(tr("Más cerca: {label}, a {v1} de {v2}", { label: label, v1: fmt(best), v2: fmt(room.reveal.value) }));
  return sentence(tr("Más cerca: {label}, a {v1} de {v2}", { label: label, v1: yearsText(best), v2: fmt(room.reveal.year) }));
}

// The end of a round: how far this player's year was (and the right one), or who won the tiebreak.
// How this player's guess did, on the card's first row (the same place as every game's result).
function HistVerdict({ me, fmt, isNum = false }) {
  const answer = me?.lastAnswer;
  const chose = Number.isInteger(isNum ? answer?.value : answer?.year);
  const exact = Boolean(answer?.correct);
  let label;
  if (exact) label = isNum ? tr("¡Lo clavaste!") : tr("¡Año exacto!");
  else if (!chose) label = tr("Se acabó el tiempo");
  else if (isNum) label = `${answer.over ? tr("Te pasaste por") : tr("Te faltaron")} ${fmt(answer.diff)}`;
  else label = tr("A {years}", { years: yearsText(answer.diff) });
  return <RoundVerdict tone={exact ? "ok" : chose ? "near" : "timeout"} label={label} points={chose ? me?.lastPoints || 0 : null} />;
}

// The answer, in the answer's row where the number was chosen (the same card as every game's): the right number or
// year big and what this player chose, or who won the tiebreak.
function Verdict({ room, me, user, tiebreak, tiedNames, iPlay, fmt, isNum = false }) {
  const answer = me?.lastAnswer;
  const year = isNum ? room.reveal.value : room.reveal.year;
  if (tiebreak) {
    const winner = room.players.find((p) => p.id === tiebreak.winnerId);
    const won = Boolean(winner) && winner.id === user?.id;
    return (
      <AnswerCard
        icon={winner ? "crown" : "hash"}
        iconTone={winner && (won || !iPlay) ? "ok" : null}
        label={tr("Desempate")}
        value={winner ? (won ? tr("¡Ganaste el desempate!") : tr("¡{name} gana el desempate!", { name: winner.name })) : tr("Nadie lo resolvió")}
        detail={
          winner
            ? tiebreak.reason === "exacto"
              ? won ? tr("Confirmaste {name} primero.", { name: fmt(year) }) : tr("Confirmó {name} primero.", { name: fmt(year) })
              : sentence(tr("Nadie lo clavó: {v0} {v1} quedó más cerca de {v2}", { v0: won ? tr("tu") : tr("su"), v1: isNum ? tr("número") : tr("año"), v2: fmt(year) }))
            : tr("{names} siguen empatados.", { names: joinNames(tiedNames) })
        }
      />
    );
  }
  const chosen = isNum ? answer?.value : answer?.year;
  const chose = Number.isInteger(chosen);
  const exact = Boolean(answer?.correct);
  let mine;
  if (exact) mine = isNum ? tr("Lo clavaste") : tr("Año exacto");
  else if (!chose) mine = isNum ? tr("No elegiste un número") : tr("No elegiste un año");
  else if (isNum) mine = tr("Pusiste {chosen} · {how} {diff}", { chosen: fmt(chosen), how: answer.over ? tr("te pasaste por") : tr("te faltaron"), diff: fmt(answer.diff) });
  else mine = tr("Pusiste {chosen} · a {years}", { chosen: fmt(chosen), years: yearsText(answer.diff) });
  return <AnswerCard label={isNum ? tr("La respuesta") : tr("Fue en")} value={fmt(year)} mine={mine} mineOk={exact} />;
}

export default function Game() {
  return (
    <TvShell mode="historia">
      <GameScreen />
    </TvShell>
  );
}
