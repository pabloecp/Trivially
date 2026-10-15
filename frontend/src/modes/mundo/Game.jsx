import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import { PhoneHint, RoomVerdict, roundPlayers } from "../../components/home/CentralBits.jsx";
import { useApp, useRemainingMs, useView } from "../../lib/store.jsx";
import WorldMap from "./WorldMap.jsx";
import { useWorld } from "./worldData.js";
import { LOCATION_SECONDS, STYLES } from "./geoInfo.js";
import "../../styles/home.css";
import "../../styles/geo.css";
import { PauseButton, PauseVeil } from "../../components/home/PauseControls.jsx";

const COUNTDOWN_MS = 3000;
// One colour per player for the pins on the reveal map (never the green and red of right and wrong).
const PIN_COLORS = ["#ffb52e", "#a58bff", "#ff6a55", "#2ea8ff", "#f2456b", "#14b8a6", "#ff9f1c", "#e879f9"];

const km = (n) => `${Math.round(n).toLocaleString("es-ES")} km`;

// "Ana", "Ana y Luis", "Ana, Luis y Eva".
function joinNames(names) {
  if (names.length < 2) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function GameScreen() {
  const { code } = useParams();
  const { user, room, joinRoom, placePin, setGame } = useApp();
  const nav = useNavigate();
  const { world, error: mapError } = useWorld();
  // The players keep their map to put the pin (beside a central device they only lose the clock and the scoreboard,
  // which are on the big screen); the room's central device shows the country to find and, when the round ends, flies
  // to where it was with everyone's pins.
  const { central, controller, viewerId } = useView(room);
  const gameRef = useRef(null);
  // Phones and tablets get "toca" in the hints; a mouse gets "haz clic".
  const [touch] = useState(() => Boolean(window.matchMedia?.("(pointer: coarse)").matches));
  const sending = useRef(false);
  // The phase right now, for replies that arrive after the round closed (their errors no longer matter).
  const phaseRef = useRef(room?.phase);
  phaseRef.current = room?.phase;

  const left = useRemainingMs(room);
  const [err, setErr] = useState("");
  // This player's pin on the round being played: { round, lngLat, locked }.
  const [pin, setPin] = useState(null);
  const [confirmHub, setConfirmHub] = useState(false);

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
  const myPin = pin?.round === round ? pin : null;
  const locked = room?.phase !== "playing" || Boolean(me?.answered) || Boolean(myPin?.locked) || !iPlay;

  // A new round: clean slate.
  useEffect(() => {
    sending.current = false;
  }, [round]);
  useEffect(() => setErr(""), [round, room?.phase]);

  // The game is one frame that fills the screen under the top bar (see .tv-geo-stage); --geo-top is where it starts.
  // On a phone the frame takes the whole screen (html.tv-geo-playing hides the top bar); the scoreboard is under it.
  // Nor does the page zoom: a pinch is for the map (WorldMap takes the ones that start on it), and a zoomed page
  // would push the frame off the screen. maximum-scale also undoes a zoom from before the match.
  const hasGame = Boolean(room) && room.phase !== "finished";
  useLayoutEffect(() => {
    const el = gameRef.current;
    if (!hasGame || !el) return undefined;
    const root = document.documentElement;
    root.classList.add("tv-geo-playing");
    const measure = () => el.style.setProperty("--geo-top", `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    measure();
    window.addEventListener("resize", measure);
    const viewport = document.querySelector('meta[name="viewport"]');
    const pageViewport = viewport?.getAttribute("content");
    viewport?.setAttribute("content", `${pageViewport}, maximum-scale=1, user-scalable=no`);
    const noPinch = (e) => {
      if (e.cancelable && (e.type !== "touchmove" || e.touches.length > 1)) e.preventDefault();
    };
    const pinchEvents = ["touchmove", "gesturestart", "gesturechange"];
    for (const type of pinchEvents) document.addEventListener(type, noPinch, { passive: false });
    return () => {
      root.classList.remove("tv-geo-playing");
      window.removeEventListener("resize", measure);
      if (pageViewport) viewport.setAttribute("content", pageViewport);
      for (const type of pinchEvents) document.removeEventListener(type, noPinch);
    };
  }, [hasGame]);

  // Whoever scrolled away (a computer, where the page can scroll) is brought back to the game as a round counts down.
  useEffect(() => {
    if (room?.phase === "countdown" && window.scrollY > 4) window.scrollTo({ top: 0 });
  }, [room?.phase, round]);

  // After a reload mid-round, the pin this player had placed comes back with the room.
  useEffect(() => {
    if (room?.me?.pin && !myPin) setPin({ round, lngLat: room.me.pin, locked: Boolean(room.me.lastAnswer) });
  }, [room?.me?.pin, round]);

  // A tap on the map (or the pin let go after dragging it): the pin can move until "Confirmar".
  function onPick([lng, lat]) {
    if (locked) return;
    setPin({ round, lngLat: [lng, lat], locked: false });
    setErr("");
    placePin({ lng, lat }).catch((e) => {
      if (phaseRef.current === "playing") setErr(e.message || "No se pudo poner tu pin");
    });
  }

  async function confirmPin() {
    if (locked || !myPin || sending.current) return;
    sending.current = true;
    setPin({ ...myPin, locked: true });
    try {
      await placePin({ lng: myPin.lngLat[0], lat: myPin.lngLat[1], lock: true });
    } catch (e) {
      sending.current = false;
      if (phaseRef.current !== "playing") return;
      setPin({ ...myPin, locked: false });
      setErr(e.message || "No se pudo confirmar tu pin");
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

  if (room.phase === "finished" && room.results) return <MatchResults room={room} color="world" />;

  const phase = room.phase;
  const isHost = !central && room.hostId === user?.id;
  const style = STYLES[0];
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const totalMs = LOCATION_SECONDS * 1000;
  const pct =
    phase === "playing"
      ? Math.max(0, Math.min(100, (left / totalMs) * 100))
      : phase === "countdown"
      ? Math.max(0, Math.min(100, (left / COUNTDOWN_MS) * 100))
      : 100;
  const urgent = phase === "playing" && left <= 3000;
  const tiedNames = tiebreak ? tiebreak.playerIds.map((id) => room.players.find((p) => p.id === id)?.name || "Jugador") : [];
  const colorOf = (id) => PIN_COLORS[Math.max(0, room.players.findIndex((p) => p.id === id)) % PIN_COLORS.length];
  const pinLocked = Boolean(myPin?.locked) || Boolean(me?.answered);

  // Everyone's pins at the reveal (only the tied players' in a tiebreak).
  const revealPins =
    phase === "reveal"
      ? room.players
          .filter((p) => p.lastAnswer?.pin && (!tiebreak || tiebreak.playerIds.includes(p.id)))
          .map((p) => ({
            id: p.id,
            lngLat: p.lastAnswer.pin,
            nearest: p.lastAnswer.nearest,
            inside: p.lastAnswer.inside,
            color: colorOf(p.id),
            label: p.name.slice(0, 12),
            isMe: p.id === viewerId,
          }))
      : [];

  const roundLabel = tiebreak ? `Desempate${tiebreak.round > 1 ? ` ${tiebreak.round}` : ""}` : `Ronda ${round + 1} de ${room.totalRounds}`;
  const nextText = tiebreak
    ? tiebreak.winnerId
      ? "Calculando resultados…"
      : tiebreak.round >= 3
      ? "Sigue el empate: calculando resultados…"
      : "Nadie ganó: otro desempate en breve…"
    : round + 1 >= room.totalRounds
    ? "Calculando resultados…"
    : "Siguiente pregunta en breve…";

  // The top card: the same three lines (kicker, title, hint) in every phase, so nothing below it moves.
  let kicker = `${roundLabel} · ${style.label}`;
  let title;
  let hint;
  if (phase === "countdown") {
    title = tiebreak ? `Desempate entre ${joinNames(tiedNames)}` : "Prepárate…";
    if (tiebreak) {
      hint = iPlay
        ? "Pon tu pin y confírmalo: gana el primero que confirme dentro del país. Si nadie lo encuentra, el más cercano."
        : "Solo juegan los empatados. Tú miras cómo lo resuelven.";
    } else hint = `Tendrás ${LOCATION_SECONDS} segundos para poner tu pin en el mapa.`;
  } else {
    kicker = `${roundLabel} · ¿Dónde está…?`;
    title = question?.name || room.reveal?.name || "";
    if (phase === "reveal") hint = nextText;
    else if (!iPlay) hint = `Solo juegan ${joinNames(tiedNames)}: gana el primero que confirme su pin dentro del país.`;
    else if (pinLocked) hint = tiebreak ? "Pin confirmado. Si cayó dentro y fuiste el primero, ganas." : "Pin confirmado. Esperando al resto…";
    else if (myPin) hint = `Arrástralo o ${touch ? "toca" : "haz clic en"} otro sitio para moverlo, y confirma.`;
    else hint = touch ? "Toca para poner tu pin. Doble toque o pellizca para acercar." : "Haz clic para poner tu pin. Rueda, doble clic o arrastra para moverte.";
  }

  // Someone who joined mid-match only watches: the same lines, without the instructions to answer.
  if (spectator && phase !== "reveal") hint = "Estás viendo la partida. Entrarás a la sala cuando termine.";
  // The central device talks to the whole room: they put their pins from their phones.
  if (central && phase === "countdown" && !tiebreak) hint = `Tendrán ${LOCATION_SECONDS} segundos para poner su pin desde su teléfono.`;
  else if (central && phase === "countdown") hint = `Desempate entre ${joinNames(tiedNames)}: gana el primero que confirme su pin dentro del país.`;
  else if (central && phase === "playing") hint = tiebreak ? `Solo juegan ${joinNames(tiedNames)}.` : "Pongan su pin en el mapa desde su teléfono.";

  // Under the map, always the same height: what to do now, or how the round went.
  let action;
  if (central && phase === "playing") {
    action = <PhoneHint room={room}>Pongan su pin desde su teléfono</PhoneHint>;
  } else if (central && phase === "reveal" && room.reveal && !tiebreak) {
    action = <RoomVerdict room={room} right={(p) => Boolean(p.lastAnswer?.inside)} detail={closestPin(room)} />;
  } else if (central && phase === "reveal" && room.reveal) {
    action = <Verdict room={room} me={null} user={null} tiebreak={tiebreak} tiedNames={tiedNames} iPlay={false} />;
  } else if (central) {
    action = <p className="tv-hint tv-geo-watch">{phase === "reveal" ? nextText : "Prepárense…"}</p>;
  } else if (spectator && phase !== "reveal") {
    action = <p className="tv-hint tv-geo-watch">Mira cómo responden los demás</p>;
  } else if (spectator && phase === "reveal") {
    action = <p className="tv-hint tv-geo-watch">{nextText}</p>;
  } else if (phase === "reveal" && room.reveal) {
    action = <Verdict room={room} me={me} user={user} tiebreak={tiebreak} tiedNames={tiedNames} iPlay={iPlay} />;
  } else if (!iPlay) {
    action = <p className="tv-hint tv-geo-watch">Mira el desempate entre {joinNames(tiedNames)}</p>;
  } else {
    action = (
      <button type="button" className="tv-btn tv-btn--block tv-c-world" onClick={confirmPin} disabled={phase !== "playing" || !myPin || pinLocked} aria-live="polite">
        <Icon name={pinLocked ? "check" : "pin"} size={20} strokeWidth={2.6} />
        {pinLocked ? "Pin confirmado" : myPin ? "Confirmar pin" : "Pon tu pin en el mapa"}
      </button>
    );
  }

  return (
    <div className={`tv-room tv-game tv-geo-game${central ? " is-central" : ""}${controller ? " is-controller" : ""}`} ref={gameRef}>
      <div className="tv-room-main tv-game-main tv-geo-stage">
        <section className="tv-game-top">
          <div className="tv-game-round tv-geo-find">
            <p className="tv-mono-label">{kicker}</p>
            <h1 key={title} className="tv-card-title tv-geo-country">
              {title}
            </h1>
            <p className="tv-hint" aria-live="polite">
              {hint}
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

        {/* The same map for the whole match. Only what's on it changes, never its size. */}
        <section className={`tv-card tv-geo-map-card is-${phase}`}>
          <PauseVeil room={room} isHost={isHost} />
          {world ? (
            <WorldMap
              world={world}
              resetKey={round}
              frozen={phase === "countdown"}
              interactive={phase === "playing" && !locked}
              onPick={onPick}
              myPin={phase === "playing" ? myPin?.lngLat || null : null}
              pins={revealPins}
              target={phase === "reveal" ? room.reveal?.map : null}
              regions={phase === "playing" && !central}
              label={
                phase === "playing"
                  ? `Mapamundi. Pon tu pin en ${question?.name}. Flechas para moverte, más y menos para acercar, Enter para poner el pin en el centro.`
                  : phase === "reveal"
                  ? `Mapamundi con ${room.reveal?.name || "el país"} marcado`
                  : "Mapamundi"
              }
            >
              {phase === "countdown" && (
                <div className="tv-geo-countdown" aria-hidden="true">
                  <p className="tv-mono-label tv-geo-kind-kicker">
                    <Icon name={style.icon} size={16} strokeWidth={2.6} />
                    {tiebreak ? "Desempate" : style.label}
                  </p>
                  <span key={Math.max(1, seconds)} className="tv-countdown-num">{Math.max(1, seconds)}</span>
                </div>
              )}

              {err && (
                <p className="tv-geo-error" role="alert">
                  {err}
                </p>
              )}
            </WorldMap>
          ) : (
            <div className="tv-geo-map tv-geo-map--loading" role="status">
              {mapError || "Cargando el mapa…"}
            </div>
          )}

          <div className="tv-geo-action">{action}</div>
        </section>
      </div>

      {/* The scoreboard is the central device's, when there is one. */}
      {!controller && <PartyPanel room={room} scores display={central} className="tv-geo-side" />}
    </div>
  );
}

// At the reveal on the central device, when nobody's pin fell inside: whose came closest ("Más cerca: Ana, a 120 km").
function closestPin(room) {
  const pins = roundPlayers(room).filter((p) => p.lastAnswer?.distanceKm != null);
  if (pins.some((p) => p.lastAnswer.inside)) return "";
  if (!pins.length) return "Nadie puso su pin a tiempo";
  const best = pins.reduce((a, b) => (b.lastAnswer.distanceKm < a.lastAnswer.distanceKm ? b : a));
  return `Más cerca: ${best.name}, a ${km(best.lastAnswer.distanceKm)}`;
}

// The end of a round, in the row under the map: how this player did (how far their pin landed), or who won the
// tiebreak.
function Verdict({ room, me, user, tiebreak, tiedNames, iPlay }) {
  const answer = me?.lastAnswer;
  const name = room.reveal.name;
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
      ? tiebreak.reason === "dentro"
        ? `${won ? "Confirmaste" : "Confirmó"} ${name} primero.`
        : `Nadie cayó dentro: ${won ? "tu" : "su"} pin quedó más cerca.`
      : `${joinNames(tiedNames)} siguen empatados.`;
  } else {
    const inside = Boolean(answer?.inside);
    const placed = Boolean(answer?.pin);
    won = inside;
    points = placed;
    tone = inside ? "ok" : placed ? "bad" : "timeout";
    icon = inside ? "check" : placed ? "pin" : "hash";
    title = inside ? "¡Dentro!" : placed ? `A ${km(answer.distanceKm)}` : "¡Se acabó el tiempo!";
    detail = inside ? `Tu pin cayó en ${name}.` : placed ? `de ${name}` : "No pusiste tu pin a tiempo.";
  }
  return (
    <div className={`tv-geo-verdict tv-geo-verdict--${tone}`} role="status">
      {won && <Confetti pieces={18} />}
      <span className="tv-geo-verdict-icon">
        <Icon name={icon} size={22} strokeWidth={tiebreak ? 2.6 : 3} />
      </span>
      <span className="tv-geo-verdict-text">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {points && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0}</span>}
    </div>
  );
}

export default function Game() {
  return (
    <TvShell mode="mundo">
      <GameScreen />
    </TvShell>
  );
}
