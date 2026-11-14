import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Avatar from "../../components/home/Avatar.jsx";
import Blob from "../../components/home/Blob.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import SpectatorBanner from "../../components/home/SpectatorBanner.jsx";
import { ControllerBar, GetReady, PhoneHint } from "../../components/home/CentralBits.jsx";
import { PauseButton, PauseVeil, ReportButton, SkipButton } from "../../components/home/PauseControls.jsx";
import { resolveCode } from "../../lib/hiddenCode.js";
import { AnswerCard, MatchBar, MatchCard, MatchQuestion, RoundVerdict } from "../../components/home/MatchFrame.jsx";
import { useApp, useRemainingMs, useView } from "../../lib/store.jsx";
import { findDifficulty, pointsText, reyConfig } from "./reyInfo.js";
import "../../styles/home.css";
import "../../styles/quiz.css";
import "../../styles/rey.css";

import { translate as tr } from "../../lib/i18n.js";
const PICK_MS = 10000;
const LEVEL_CLASS = { facil: "is-facil", media: "is-media", dificil: "is-dificil" };

// While a question is played: the king big on the left (the crown, their Blob, their name) and the ones trying to take
// the crown on the right, "RETADORES", each with how their round goes.
function Court({ room, king, viewerId }) {
  const reveal = room.phase === "reveal";
  const challengers = room.players.filter((p) => !p.spectator && p.id !== king?.id);
  const status = (p) => {
    if (reveal) return p.lastAnswer?.correct ? [tr("Acertó"), "is-ok"] : p.lastAnswer?.text ? [tr("Falló"), "is-bad"] : [tr("Sin respuesta"), ""];
    if (p.answered) return [p.id === viewerId ? tr("Respondiste") : tr("Respondió"), ""];
    return [p.id === viewerId ? tr("Tu turno") : "Pensando…", ""];
  };
  return (
    <div className="tv-rey-court">
      <div className="tv-rey-throne">
        <Icon name="crown" size={44} strokeWidth={1.2} filled className="tv-rey-throne-crown" />
        <span className="tv-rey-throne-blob">
          <Blob />
        </span>
        <b>{king ? (king.id === viewerId ? tr("Tú") : king.name) : tr("Sin rey")}</b>
        <span>{reveal && room.rey?.dethronedBy ? tr("Era el rey") : tr("El rey · eligió esta")}</span>
      </div>
      <div className="tv-rey-challengers">
        <span className="tv-mpanel-label">{tr("Retadores")}</span>
        {challengers.map((p) => {
          const [text, tone] = status(p);
          return (
            <div key={p.id} className={`tv-rey-challenger${p.id === viewerId ? " is-me" : ""}`}>
              <Avatar avatar={p.avatar} />
              <b>
                {p.name}
              </b>
              <span className={tone}>{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Who holds the crown now: their face, their name and what they have.
function KingBar({ room, king, you }) {
  if (!king) return null;
  return (
    <div className="tv-rey-king" role="status">
      <span className="tv-rey-crown" aria-hidden="true">
        <Icon name="crown" size={20} strokeWidth={2.4} filled />
      </span>
      <Avatar name={king.name} avatar={king.avatar} />
      <span className="tv-rey-king-text">
        <small>{room.phase === "reveal" && room.rey?.dethronedBy ? tr("Era el rey") : tr("El rey")}</small>
        <strong>{you ? tr("Tú") : king.name}</strong>
      </span>
      <span className="tv-rey-king-points">{pointsText(king.score || 0)}</span>
    </div>
  );
}

// The three questions the king chooses from, with their difficulty and what keeping the crown through each is worth.
// Only the king can tap them; everyone else sees them, and who is choosing.
function Offers({ offers, canPick, onPick, picked }) {
  return (
    <div className="tv-rey-offers" role={canPick ? "group" : undefined} aria-label={tr("Preguntas para elegir")}>
      {offers.map((o) => {
        const level = findDifficulty(o.difficulty);
        const Tag = canPick ? "button" : "div";
        return (
          <Tag
            key={o.index}
            type={canPick ? "button" : undefined}
            className={`tv-rey-offer ${LEVEL_CLASS[o.difficulty] || ""}${picked === o.index ? " is-picked" : ""}`}
            disabled={canPick ? picked != null : undefined}
            onClick={canPick ? () => onPick(o.index) : undefined}
          >
            <span className="tv-rey-offer-meta">
              <span className="tv-match-chip">{tr(o.category)}</span>
              <span className="tv-match-chip tv-rey-level">
                {level.label} · +{o.points}
              </span>
            </span>
            <span className="tv-rey-offer-text">{o.text}</span>
          </Tag>
        );
      })}
    </div>
  );
}

function GameScreen() {
  const { code: codeParam } = useParams();
  const { user, room, joinRoom, answer, kingPick, restartGame } = useApp();
  const code = resolveCode(codeParam, room);
  const nav = useNavigate();
  const { central, controller, viewerId } = useView(room);

  const left = useRemainingMs(room);
  const [err, setErr] = useState("");
  const [confirmHub, setConfirmHub] = useState(false);
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState(null);
  const [picked, setPicked] = useState(null);
  const sending = useRef(false);
  const inputRef = useRef(null);
  const round = room?.currentRound;

  // Join the room after a reload. Going back to the room screen is handled by RoomNavigator (App.jsx).
  useEffect(() => {
    if (code && (!room || room.code !== code)) joinRoom(code).catch(() => nav("/", { replace: true }));
  }, [code]);
  useEffect(() => {
    if (!confirmHub) return undefined;
    const t = setTimeout(() => setConfirmHub(false), 3000);
    return () => clearTimeout(t);
  }, [confirmHub]);
  useEffect(() => {
    setErr("");
    setQuery("");
    setSent(null);
    setPicked(null);
    sending.current = false;
  }, [round]);

  const playing = room?.phase === "playing";
  const me = room?.players.find((p) => p.id === viewerId) || null;
  const kingId = room?.rey?.kingId || null;
  // The king of this round (while it's played they can't answer; at the reveal the crown may already be someone else's).
  const isKing = !central && Boolean(viewerId) && viewerId === room?.rey?.roundKingId;
  const locked = !playing || room?.paused || Boolean(sent) || Boolean(me?.answered) || Boolean(me?.spectator) || isKing || central;
  // The box takes the keyboard as soon as the round opens.
  useEffect(() => {
    if (playing && !locked) inputRef.current?.focus();
  }, [playing, round]);

  // Time running out with something written: it goes on its own, as if "Enviar" had been pressed.
  useEffect(() => {
    if (playing && !locked && query.trim() && left > 0 && left <= 500) submit();
  }, [left]);

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
  if (room.phase === "finished" && room.results) return <MatchResults room={room} />;

  const rey = room.rey || {};
  const question = room.question;
  const reveal = room.phase === "reveal";
  const picking = room.phase === "countdown";
  const spectator = Boolean(me?.spectator);
  const isHost = !central && room.hostId === user?.id;
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || tr("Otro jugador");
  const roundKing = room.players.find((p) => p.id === rey.roundKingId) || null;
  const king = room.players.find((p) => p.id === (reveal ? rey.roundKingId : kingId)) || null;
  const youAreRoundKing = !central && viewerId === rey.roundKingId;
  const youWon = !central && reveal && rey.dethronedBy === viewerId;
  const kingPicking = picking && viewerId === kingId && !central && !spectator;

  const totalMs = playing ? question?.roundMs || reyConfig(room).roundMs : PICK_MS;
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const pct = playing || picking ? Math.max(0, Math.min(100, (left / totalMs) * 100)) : 100;
  const urgent = (playing && left <= 5000) || (picking && left <= 3000);

  async function pick(index) {
    if (picked != null) return;
    setPicked(index);
    try {
      await kingPick(index);
    } catch (e) {
      setPicked(null);
      setErr(e.message || tr("No se pudo elegir la pregunta"));
    }
  }

  async function submit(e) {
    e?.preventDefault();
    const text = query.trim();
    if (locked || sending.current || !text) return;
    sending.current = true;
    setSent({ text });
    setErr("");
    try {
      await answer(text);
    } catch (e2) {
      sending.current = false;
      setSent(null);
      setErr(e2.message || tr("No se pudo enviar tu respuesta"));
    }
  }

  // The round's middle line: what is going on.
  let title;
  if (picking) title = kingPicking ? tr("Elige una pregunta") : tr("{v0} la pregunta", { v0: king ? (viewerId === king.id ? tr("Tú eliges") : tr("{name} elige", { name: king.name })) : tr("El rey elige") });
  else if (reveal) {
    title = rey.dethronedBy
      ? tr("¡{v0} se queda con la corona!", { v0: nameOf(rey.dethronedBy) })
      : tr("¡{v0} sigue en el trono!", { v0: roundKing ? roundKing.name : tr("El rey") });
  } else if (youAreRoundKing) title = tr("Eres el rey: resiste");
  else if (spectator) title = tr("Estás viendo la partida");
  else title = tr("Respóndela antes que nadie");

  let hint;
  if (picking) hint = kingPicking ? tr("Cuanto más difícil, más puntos si nadie la acierta.") : tr("El rey tiene unos segundos para elegir.");
  else if (reveal) hint = rey.survived ? tr("{v0} para el rey.", { v0: pointsText(rey.points) }) : "";
  else if (youAreRoundKing) hint = tr("Si alguien la acierta, te quita la corona.");
  else hint = tr("El primero en acertar se convierte en el rey.");

  const tools = (
    <>
      <ReportButton room={room} onError={setErr} />
      <SkipButton room={room} onError={setErr} />
      <PauseButton room={room} isHost={isHost} onError={setErr} />
      {isHost && (
        <button type="button" className={`tv-mini-btn tv-end-btn${confirmHub ? " is-on" : ""}`} onClick={backToHub}>
          {confirmHub ? tr("¿Seguro? Toca otra vez") : tr("Terminar")}
        </button>
      )}
    </>
  );

  const level = question ? findDifficulty(question.difficulty) : null;

  return (
    <div className={`tv-room tv-game tv-match tv-rey${central ? " is-central" : ""}${controller ? " is-controller" : ""}`}>
      <div className="tv-room-main tv-game-main">
        {spectator && <SpectatorBanner />}
        {controller ? (
          <ControllerBar seconds={seconds} pct={pct} urgent={urgent}>
            {tools}
          </ControllerBar>
        ) : (
          <MatchCard
            room={room}
            pills={
              reveal && question && !central && !spectator ? (
                <ReyVerdict me={me} rey={rey} youWon={youWon} youAreRoundKing={youAreRoundKing} />
              ) : (
                !picking && question && <span className="tv-qc-pill is-dark">{level.label} · {pointsText(level.points)}</span>
              )
            }
            seconds={seconds}
            pct={pct}
            urgent={urgent}
          >
            <MatchQuestion>{!picking && question ? question.text : title}</MatchQuestion>
          </MatchCard>
        )}

        <section key={round} className="tv-game-stage tv-rey-stage tv-mpanel">
          <PauseVeil room={room} isHost={isHost} />
          {!controller && picking && <KingBar room={room} king={king} you={!central && viewerId === king?.id} />}
          {!controller && !picking && <Court room={room} king={roundKing || king} viewerId={central ? null : viewerId} />}

          {picking && rey.offers && !controller && (
            <Offers offers={rey.offers} canPick={kingPicking} onPick={pick} picked={picked} />
          )}
          {picking && controller && (kingPicking ? <Offers offers={rey.offers || []} canPick onPick={pick} picked={picked} /> : <GetReady />)}

          <div className="tv-rey-answerbox">
            {reveal && question && (
              <>
                {/* The answer takes the place of the box to write in, the same card as every game's. */}
                <AnswerCard
                  label={tr("La respuesta")}
                  value={question.answer}
                  mine={
                    youWon
                      ? tr("¡Ahora eres el rey!")
                      : youAreRoundKing && rey.dethronedBy
                      ? tr("Te quitaron la corona")
                      : youAreRoundKing && rey.survived
                      ? tr("Sigues siendo el rey")
                      : !central && me?.lastAnswer?.text
                      ? tr("Escribiste “{text}”", { text: me.lastAnswer.text })
                      : null
                  }
                  mineOk={youWon || (youAreRoundKing && rey.survived) || Boolean(me?.lastAnswer?.correct)}
                />
              </>
            )}
            {playing && central && <PhoneHint room={room}>{tr("Escriban la respuesta en su teléfono")}</PhoneHint>}
            {playing && !central && !locked && (
              <form className="tv-mwrite" onSubmit={submit}>
                <label className="tv-mwrite-box">
                  <Icon name="keyboard" size={24} />
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder={tr("Escribe tu respuesta…")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="sentences"
                    spellCheck="false"
                    enterKeyHint="send"
                    maxLength={80}
                    aria-label={tr("Tu respuesta")}
                  />
                </label>
                <button type="submit" className="tv-btn tv-btn--primary tv-mwrite-send" disabled={!query.trim()}>
                  <Icon name="send" size={20} strokeWidth={2.4} />
                  <span className="tv-mwrite-send-label">{tr("Enviar")}</span>
                </button>
              </form>
            )}
            {playing && !central && locked && !spectator && (
              <p className="tv-mwrite-sent">
                <Icon name={isKing ? "crown" : "check"} size={18} strokeWidth={3} filled={isKing} />
                {isKing ? tr("Eres el rey. A ver si alguien te la quita…") : sent?.text || me?.lastAnswer?.text || tr("Respuesta enviada")}
              </p>
            )}
          </div>
          {err && <p className="tv-lobby-error" role="alert">{err}</p>}
        </section>
      </div>

      {/* The scoreboard is the central device's, when there is one. */}
      {!controller && (
        <PartyPanel
          room={room}
          scores
          display={central}
          onToast={setErr}
        />
      )}
      {!controller && !central && (
        <MatchBar
          room={room}
          viewerId={viewerId}
          tools={tools}
          // While the king picks, and for the king while the others answer: what happens now.
          line={picking || (playing && youAreRoundKing) ? hint : undefined}
        />
      )}
    </div>
  );
}

// How the round went for this player, on the card's first row (the same place as every game's result).
function ReyVerdict({ me, rey, youWon, youAreRoundKing }) {
  if (youWon) return <RoundVerdict tone="ok" icon="crown" label={tr("¡Ahora eres el rey!")} points={me?.lastPoints || null} />;
  if (youAreRoundKing && rey.survived) return <RoundVerdict tone="ok" icon="crown" label={tr("Sigues de rey")} points={rey.points || null} />;
  if (youAreRoundKing && rey.dethronedBy) return <RoundVerdict tone="bad" icon="crown" label={tr("Perdiste la corona")} />;
  if (me?.lastAnswer?.correct) return <RoundVerdict tone="ok" label={tr("¡Correcto!")} points={me?.lastPoints || null} />;
  if (me?.lastAnswer?.text) return <RoundVerdict tone="bad" label={tr("Incorrecto")} />;
  return <RoundVerdict tone="timeout" label={tr("Sin respuesta")} />;
}

export default function Game() {
  return (
    <TvShell mode="rey">
      <GameScreen />
    </TvShell>
  );
}
