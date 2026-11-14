import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import { PhoneHint, RoomVerdict, roundPlayers } from "../../components/home/CentralBits.jsx";
import { useApp, useRemainingMs, useView } from "../../lib/store.jsx";
import { BACKEND_URL } from "../../lib/config.js";
import WorldMap from "./WorldMap.jsx";
import { useWorld } from "./worldData.js";
import { geoConfig, styleOf } from "./geoInfo.js";
import "../../styles/home.css";
import "../../styles/geo.css";
import { PauseButton, ReportButton, SkipButton, PauseVeil } from "../../components/home/PauseControls.jsx";
import { resolveCode } from "../../lib/hiddenCode.js";
import { AnswerCard, MatchBar, MatchCard, MatchQuestion, RoundCountdown, RoundVerdict } from "../../components/home/MatchFrame.jsx";

import { locale, translate as tr } from "../../lib/i18n.js";
const COUNTDOWN_MS = 3000;
// One colour per player for the pins on the reveal map (never the green and red of right and wrong).
const PIN_COLORS = ["#ffb52e", "#a58bff", "#ff6a55", "#2ea8ff", "#f2456b", "#14b8a6", "#ff9f1c", "#e879f9"];

const km = (n) => `${Math.round(n).toLocaleString(locale())} km`;

// "Ana", "Ana y Luis", "Ana, Luis y Eva".
function joinNames(names) {
  if (names.length < 2) return names[0] || "";
  return tr("{list} y {last}", { list: names.slice(0, -1).join(", "), last: names[names.length - 1] });
}

function GameScreen() {
  const { code: codeParam } = useParams();
  const { user, room, joinRoom, placePin, restartGame } = useApp();
  // The address's code ("oculta" while it's hidden: this tab's room, lib/hiddenCode.js).
  const code = resolveCode(codeParam, room);
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
    if (code && (!room || room.code !== code)) joinRoom(code).catch(() => nav("/", { replace: true }));
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
  // On a phone that frame is every match's (look.css), with the map taking all it can.
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
      if (phaseRef.current === "playing") setErr(e.message || tr("No se pudo poner tu pin"));
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
      setErr(e.message || tr("No se pudo confirmar tu pin"));
    }
  }

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

  const phase = room.phase;
  const isHost = !central && room.hostId === user?.id;
  // How this round gives the country: its name, or only its silhouette or its flag (shown over the map, Clue).
  const style = styleOf(question?.style);
  const byName = style.id === "nombre";
  const seconds = Math.max(0, Math.ceil(left / 1000));
  // The round's length, from the phase itself (the setting's, or a playlist game's).
  const roundSeconds = Math.round(geoConfig(room).roundMs / 1000);
  const totalMs = room.phaseEndsAt && room.phaseStartedAt && phase === "playing" ? room.phaseEndsAt - room.phaseStartedAt : roundSeconds * 1000;
  const pct =
    phase === "playing"
      ? Math.max(0, Math.min(100, (left / totalMs) * 100))
      : phase === "countdown"
      ? Math.max(0, Math.min(100, (left / COUNTDOWN_MS) * 100))
      : 100;
  const urgent = phase === "playing" && left <= 3000;
  const tiedNames = tiebreak ? tiebreak.playerIds.map((id) => room.players.find((p) => p.id === id)?.name || tr("Jugador")) : [];
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

  const roundLabel = tiebreak ? (tiebreak.round > 1 ? tr("Desempate {n}", { n: tiebreak.round }) : tr("Desempate")) : tr("Ronda {v0} de {totalRounds}", { v0: round + 1, totalRounds: room.totalRounds });
  const nextText = tiebreak
    ? tiebreak.winnerId
      ? tr("Calculando resultados…")
      : tiebreak.round >= 3
      ? tr("Sigue el empate: calculando resultados…")
      : tr("Nadie ganó: otro desempate en breve…")
    : round + 1 >= room.totalRounds
    ? tr("Calculando resultados…")
    : tr("Siguiente pregunta en breve…");

  // The top card: the same three lines (kicker, title, hint) in every phase, so nothing below it moves.
  let kicker = `${roundLabel} · ${style.label}`;
  let title;
  let hint;
  if (phase === "countdown") {
    title = tiebreak ? tr("Desempate entre {names}", { names: joinNames(tiedNames) }) : tr("Prepárate…");
    if (tiebreak) {
      hint = iPlay
        ? tr("Pon tu pin y confírmalo: gana el primero que confirme dentro del país. Si nadie lo encuentra, el más cercano.")
        : tr("Solo juegan los empatados. Tú miras cómo lo resuelven.");
    } else if (byName) hint = tr("Tendrás {roundSeconds} segundos para poner tu pin en el mapa.", { roundSeconds: roundSeconds });
    else hint = tr("Verás {v0} de un país: tendrás {roundSeconds} segundos para poner tu pin en él.", { v0: style.id === "sombra" ? tr("la forma") : tr("la bandera"), roundSeconds: roundSeconds });
  } else {
    kicker = byName ? tr("{roundLabel} · ¿Dónde está…?", { roundLabel: roundLabel }) : `${roundLabel} · ${style.label}`;
    title = question?.name || room.reveal?.name || tr("¿Qué país es?");
    if (phase === "reveal") hint = nextText;
    else if (!iPlay) hint = tr("Solo juegan {v0}: gana el primero que confirme su pin dentro del país.", { v0: joinNames(tiedNames) });
    else if (pinLocked) hint = tiebreak ? tr("Pin confirmado. Si cayó dentro y fuiste el primero, ganas.") : tr("Pin confirmado.");
    else if (myPin) hint = tr("Arrástralo o {v0} otro sitio para moverlo, y confirma.", { v0: touch ? tr("toca") : tr("haz clic en") });
    else hint = touch ? tr("Toca para poner tu pin. Doble toque o pellizca para acercar.") : tr("Haz clic para poner tu pin. Rueda, doble clic o arrastra para moverte.");
  }

  // Someone who joined mid-match only watches: the same lines, without the instructions to answer.
  if (spectator && phase !== "reveal") hint = tr("Estás viendo la partida. Entrarás a jugar cuando termine.");
  // The central device talks to the whole room: they put their pins from their phones.
  if (central && phase === "countdown" && !tiebreak) {
    hint = byName
      ? tr("Tendrán {roundSeconds} segundos para poner su pin desde su teléfono.", { roundSeconds: roundSeconds })
      : tr("Verán {v0} de un país: tendrán {roundSeconds} segundos para ponerle su pin desde su teléfono.", { v0: style.id === "sombra" ? tr("la forma") : tr("la bandera"), roundSeconds: roundSeconds });
  }
  else if (central && phase === "countdown") hint = tr("Desempate entre {v0}: gana el primero que confirme su pin dentro del país.", { v0: joinNames(tiedNames) });
  else if (central && phase === "playing") hint = tiebreak ? tr("Solo juegan {names}.", { names: joinNames(tiedNames) }) : tr("Pongan su pin en el mapa desde su teléfono.");

  // Under the map, always the same height: what to do now, or how the round went.
  let action;
  if (central && phase === "playing") {
    action = <PhoneHint room={room}>{tr("Pongan su pin desde su teléfono")}</PhoneHint>;
  } else if (central && phase === "reveal" && room.reveal && !tiebreak) {
    action = <RoomVerdict room={room} right={(p) => Boolean(p.lastAnswer?.inside)} detail={closestPin(room)} />;
  } else if (central) {
    action = <p className="tv-hint tv-geo-watch">{phase === "reveal" ? nextText : tr("Prepárense…")}</p>;
  } else if (spectator && phase !== "reveal") {
    action = <p className="tv-hint tv-geo-watch">{tr("Mira cómo responden los demás")}</p>;
  } else if (spectator && phase === "reveal") {
    action = <p className="tv-hint tv-geo-watch">{nextText}</p>;
  } else if (phase === "reveal" && room.reveal) {
    // How the round went shows over the map (Verdict); this row only says what comes next.
    action = <p className="tv-hint tv-geo-watch">{nextText}</p>;
  } else if (!iPlay) {
    action = <p className="tv-hint tv-geo-watch">{tr("Mira el desempate entre")} {joinNames(tiedNames)}</p>;
  } else {
    action = (
      <button type="button" className="tv-btn tv-btn--primary tv-geo-confirm" onClick={confirmPin} disabled={phase !== "playing" || !myPin || pinLocked} aria-live="polite">
        <Icon name={pinLocked ? "check" : "send"} size={20} strokeWidth={2.6} />
        {pinLocked ? tr("Enviado") : tr("Enviar")}
      </button>
    );
  }

  return (
    <div className={`tv-room tv-game tv-match tv-geo-game${central ? " is-central" : ""}${controller ? " is-controller" : ""}`} ref={gameRef}>
      <div className="tv-room-main tv-game-main tv-geo-stage">
        <MatchCard
          room={room}
          tag={tiebreak ? tr("Desempate") : null}
          seconds={seconds}
          pct={pct}
          urgent={urgent}
          small
          pills={phase === "reveal" && room.reveal && !spectator && !central && !tiebreak ? <PinVerdict me={me} /> : null}
          /* The silhouette or the flag of the country to find, while it's searched and at the reveal. */
          media={!byName && (phase === "playing" || phase === "reveal") ? <Clue question={question} /> : null}
        >
          {/* The question says which mode it is, and stays the same at the reveal: the answer shows on the map. */}
          <MatchQuestion>
            {phase === "countdown"
              ? title
              : byName
              ? tr("¿Dónde está {title}?", { title: title })
              : style.id === "sombra"
              ? tr("¿De qué país es esta silueta?")
              : tr("¿De qué país es esta bandera?")}
          </MatchQuestion>
        </MatchCard>

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
                  ? tr("Mapamundi. Pon tu pin en {v0}. Flechas para moverte, más y menos para acercar, Enter para poner el pin en el centro.", { v0: question?.name || (style.id === "sombra" ? tr("el país de la silueta") : tr("el país de la bandera")) })
                  : phase === "reveal"
                  ? tr("Mapamundi con {v0} marcado", { v0: room.reveal?.name || tr("el país") })
                  : tr("Mapamundi")
              }
            >
              <RoundCountdown room={room} seconds={seconds} />


              {/* How the round went, in a card over the map: this player's, or on the central device who won a
                  tiebreak (how the whole room did is in the row under the map). */}
              {phase === "reveal" && room.reveal && !spectator && (!central || tiebreak) && (
                <Verdict room={room} me={me} user={central ? null : user} tiebreak={tiebreak} tiedNames={tiedNames} iPlay={iPlay} />
              )}

              {err && (
                <p className="tv-geo-error" role="alert">
                  {err}
                </p>
              )}
            </WorldMap>
          ) : (
            <div className="tv-geo-map tv-geo-map--loading" role="status">
              {mapError || tr("Cargando el mapa…")}
            </div>
          )}

          <div className="tv-geo-action">{action}</div>
        </section>
      </div>

      {/* The scoreboard is the central device's, when there is one. */}
      {!controller && <PartyPanel room={room} scores display={central} className="tv-geo-side" />}
      {!controller && !central && (
        <MatchBar
          room={room}
          viewerId={viewerId}
          // A tiebreak's rules (who plays it, how it's won) or an error, in place of who is missing.
          line={err || (tiebreak && phase !== "reveal" ? hint : undefined)}
          tools={
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
          }
        />
      )}
    </div>
  );
}


// The country to find in a "Sombra" or "Bandera" round: its silhouette or its flag, in a card at the bottom left of the
// map (over the Pacific in the world view, where there is nothing to look for). Both come from an address that never
// names the country; the silhouette is a path the server drew from the same map (geo/shapes.js).
function Clue({ question }) {
  const isFlag = question?.style === "bandera";
  const src = isFlag ? question?.flag : question?.shape;
  const [shape, setShape] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setShape(null);
    if (isFlag || !src) return undefined;
    let live = true;
    fetch(`${BACKEND_URL}${src}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(tr("Sin silueta")))))
      .then((data) => live && setShape(data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [src]);

  if (!src) return null;
  let content;
  if (failed) {
    content = (
      <span className="tv-geo-clue-missing">
        <Icon name={isFlag ? "flag" : "shape"} size={26} />
        {isFlag ? tr("No se pudo cargar la bandera") : tr("No se pudo cargar la silueta")}
      </span>
    );
  } else if (isFlag) {
    content = <img key={src} src={`${BACKEND_URL}${src}`} alt={tr("Bandera del país que buscas")} onError={() => setFailed(true)} />;
  } else if (shape) {
    const [, , w, h] = shape.viewBox.split(" ").map(Number);
    content = (
      <svg viewBox={shape.viewBox} style={{ aspectRatio: `${w} / ${h}` }} role="img" aria-label={tr("Silueta del país que buscas")}>
        <path d={shape.d} fillRule="evenodd" />
      </svg>
    );
  } else {
    content = <span className="tv-geo-clue-wait" aria-label={tr("Cargando la silueta")} />;
  }
  return (
    <div className="tv-geo-clue-area">
      <figure className={`tv-geo-clue is-${question.style}`}>{content}</figure>
    </div>
  );
}

// At the reveal on the central device, when nobody's pin fell inside: whose came closest ("Más cerca: Ana, a 120 km").
function closestPin(room) {
  const pins = roundPlayers(room).filter((p) => p.lastAnswer?.distanceKm != null);
  if (pins.some((p) => p.lastAnswer.inside)) return "";
  if (!pins.length) return tr("Nadie puso su pin a tiempo");
  const best = pins.reduce((a, b) => (b.lastAnswer.distanceKm < a.lastAnswer.distanceKm ? b : a));
  return tr("Más cerca: {name}, a {v1}", { name: best.name, v1: km(best.lastAnswer.distanceKm) });
}

// How this player's pin did, on the card's first row (the same place as every game's result).
function PinVerdict({ me }) {
  const answer = me?.lastAnswer;
  const inside = Boolean(answer?.inside);
  const placed = Boolean(answer?.pin);
  return (
    <RoundVerdict
      tone={inside ? "ok" : placed ? "near" : "timeout"}
      label={inside ? tr("¡Dentro!") : placed ? `A ${km(answer.distanceKm)}` : tr("Se acabó el tiempo")}
      points={placed ? me?.lastPoints || 0 : null}
    />
  );
}

// The end of a round, in the answer's card over the middle of the map (the country stays in sight around it): which
// country it was and where this player's pin landed, or who won the tiebreak.
function Verdict({ room, me, user, tiebreak, tiedNames, iPlay }) {
  const answer = me?.lastAnswer;
  const name = room.reveal.name;
  if (tiebreak) {
    const winner = room.players.find((p) => p.id === tiebreak.winnerId);
    const won = Boolean(winner) && winner.id === user?.id;
    return (
      <AnswerCard
        floating
        icon={winner ? "crown" : "hash"}
        label={tr("Desempate")}
        value={winner ? (won ? tr("¡Ganaste!") : tr("¡Gana {name}!", { name: winner.name })) : tr("Nadie lo resolvió")}
        detail={
          winner
            ? tiebreak.reason === "dentro"
              ? won ? tr("Confirmaste {name} primero", { name }) : tr("Confirmó {name} primero", { name })
              : tr("Nadie cayó dentro: {v0} pin quedó más cerca de {name}", { v0: won ? tr("tu") : tr("su"), name: name })
            : tr("{names} siguen empatados", { names: joinNames(tiedNames) })
        }
        mine={iPlay && winner ? (won ? tr("Ganaste el desempate") : tr("Esta vez no")) : null}
        mineOk={won}
      />
    );
  }
  const inside = Boolean(answer?.inside);
  const placed = Boolean(answer?.pin);
  return (
    <AnswerCard
      floating
      icon="pin"
      label={tr("La respuesta")}
      value={name}
      mine={inside ? tr("Tu pin cayó dentro") : placed ? tr("Tu pin quedó a {v0}", { v0: km(answer.distanceKm) }) : tr("No pusiste tu pin a tiempo")}
      mineOk={inside}
    />
  );
}

export default function Game() {
  return (
    <TvShell mode="mundo">
      <GameScreen />
    </TvShell>
  );
}
