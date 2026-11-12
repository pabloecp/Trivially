import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { blobColor } from "../../lib/blobColors.js";
import { eloIn, formatElo } from "../../lib/gameStats.js";
import { useBlobsStill, useResultsLook } from "../../lib/ownerView.js";
import { play } from "../../lib/sounds.js";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../../modes/index.js";
import AppIcon from "./AppIcon.jsx";
import Avatar from "./Avatar.jsx";
import Blob from "./Blob.jsx";
import Confetti from "./Confetti.jsx";
import CountUp from "./CountUp.jsx";
import Icon from "./Icon.jsx";
import { TUTORIALS, VARIANT_TUTORIALS, findVariant, variantsFor } from "./matchInfo.js";
import { isTiebreak, variantsOf } from "./MatchFrame.jsx";
import RankBox from "./RankBox.jsx";
import { RatingDelta } from "./Ratings.jsx";
import { GamesWon } from "./ResultsLooks.jsx";
import "../../styles/match.css";

// Rows the reel goes through at the least before it stops, however many games it has: more games, fewer laps.
const REEL_ROWS = 28;
// Rows drawn before where the reel starts and after where it stops, so it never shows an end.
const PAD = 4;
// The reel stops this long before the roulette's time is over, so the picked game is seen still for a moment.
const SETTLE_MS = 900;

const easeOut = (t) => 1 - (1 - t) ** 4;
const firstName = (name = "") => name.split(" ")[0];
const modeOf = (variant) => findMode(findVariant(variant).game);

// "Trivia Cerradas": a variant's game and way.
function variantName(id) {
  const v = findVariant(id);
  const name = findMode(v.game)?.name || "";
  return v.way ? `${name} ${v.way}` : name;
}

// The game now, with its way (an older server only sends the game).
const variantNow = (intro) => intro.variant || intro.game;
// The game before, with its way.
const variantBefore = (intro) => intro.previous?.variant || variantsOf(intro)[intro.index - 1];

// Which part of the intro it is by the server's clock: the game before ("result", from the second game on), the roulette
// ("spin", then still on the pick: "landed") and how it's played ("tutorial"), with how long each one has left.
function useIntroStage(room) {
  const [now, setNow] = useState(() => Date.now() + (room.clockOffset || 0));
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + (room.clockOffset || 0)), 200);
    return () => clearInterval(id);
  }, [room.clockOffset]);
  const intro = room.intro;
  const elapsed = now - room.phaseStartedAt - (intro.previous ? intro.resultMs || 0 : 0);
  // Only with a game before to show (a clock a little behind the server's would otherwise ask for one in the first game).
  const stage = elapsed < 0 && intro.previous ? "result" : elapsed < intro.spinMs - SETTLE_MS ? "spin" : elapsed < intro.spinMs ? "landed" : "tutorial";
  return { stage, resultLeftMs: -elapsed, tutorialLeftMs: intro.spinMs + intro.tutorialMs - elapsed };
}

/** The bar at the card's foot, as when the search is full: it runs out with the time left. */
function TimeBar({ leftMs, totalMs }) {
  // Told only once, when it appears: the clock's ticks must not restart it.
  const [delay] = useState(() => Math.min(0, leftMs - totalMs));
  return (
    <span className="tv-finding-bar" aria-hidden="true">
      <i style={{ animationDuration: `${totalMs}ms`, animationDelay: `${delay}ms` }} />
    </span>
  );
}

/** The card's head, the same as on Inicio and in the search: the game's icon (or the logo), a small label over the name. */
function CardHead({ badge, icon, label, name }) {
  return (
    <div className="tv-stage-head">
      {badge}
      <div className="tv-stage-heading">
        <p className="tv-stage-aud" aria-live="polite">
          <Icon name={icon} size={16} strokeWidth={2.6} />
          {label}
        </p>
        <h2 className="tv-stage-name">{name}</h2>
      </div>
    </div>
  );
}

// The game's icon on its white square, in its own colour (also on the Clásico's dark card, the moment the roulette stops).
const gameBadge = (mode) => (
  <span className={`tv-stage-badge tv-c-${mode.color}`}>
    <Icon name={mode.icon} size={34} strokeWidth={2.2} />
  </span>
);

/** A game's icon on a white square and its name, on the reel. */
function ReelRow({ variant }) {
  const v = findVariant(variant);
  const m = findMode(v.game);
  return (
    <span className={`tv-mi-title tv-c-${m.color}`}>
      <span className="tv-mi-badge">
        <Icon name={m.icon} size={40} strokeWidth={2.2} />
      </span>
      <span className="tv-mi-name">
        <b>{m.name}</b>
        {v.way && <small>{v.way}</small>}
      </span>
    </span>
  );
}

// The roulette, on the Clásico's own card (dark in the logo's coloured frame, as on Inicio and in its search): one reel going
// up behind a window, however many games there are, showing the one in the window and a bit of those beside it. They are the
// games not played yet (each with its way; once every one has been, the draw starts over, never with the one just played).
// The window takes the colour of the game in it and, when it stops (`onLand`), the card is at once the picked game's: no
// more rainbow frame, its head the game's icon and name (as in the tutorial after it, which keeps it where it is) and its
// colour spreading from the window over the whole card. It's drawn in JS (not a CSS transition) so each game that goes by can tick.
function Roulette({ room, startedAt, kind, onLand }) {
  const intro = room.intro;
  const clockOffset = room.clockOffset || 0;
  const played = variantsOf(intro).slice(0, intro.index);
  const now = variantNow(intro);
  const all = intro.variants ? variantsFor(kind).map((v) => v.id) : intro.games;
  const pass = played.slice(played.length - (played.length % all.length));
  const left = all.filter((v) => !pass.includes(v) && (pass.length > 0 || v !== played.at(-1)));
  const pool = left.includes(now) ? left : [now];
  const start = Math.ceil(PAD / pool.length) * pool.length;
  const laps = Math.max(1, Math.ceil(REEL_ROWS / pool.length));
  const target = start + laps * pool.length + Math.max(0, pool.indexOf(now));
  const stripRef = useRef(null);
  const [cell, setCell] = useState(start);
  const [landed, setLanded] = useState(false);

  useLayoutEffect(() => {
    const duration = Math.max(1, intro.spinMs - SETTLE_MS);
    let frame = 0;
    let lastCell = -1;
    const tick = () => {
      const t = Math.min(1, (Date.now() + clockOffset - startedAt) / duration);
      const x = start + (target - start) * easeOut(t);
      // How tall a row is, it's the page's: --mi-row in match.css.
      stripRef.current?.style.setProperty("--x", x);
      const c = Math.round(x);
      if (c !== lastCell) {
        if (lastCell !== -1 && t < 1) play("tap");
        lastCell = c;
        setCell(c);
      }
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setLanded(true);
        onLand();
        play("next");
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [target, startedAt]);

  // Drawn once: the reel only moves as a whole, however often the screen updates.
  const rows = useMemo(
    () =>
      Array.from({ length: target + PAD + 1 }, (_, i) => (
        <div key={i} className="tv-mi-row" aria-hidden={i !== target}>
          <ReelRow variant={pool[i % pool.length]} />
        </div>
      )),
    [target, pool.join()]
  );

  const color = modeOf(pool[cell % pool.length] || now).color;
  const tiebreak = isTiebreak(room);
  return (
    <>
      {landed && <span className={`tv-mi-flood tv-c-${modeOf(now).color}`} aria-hidden="true" />}
      {landed && <span className="tv-mstage-flash" aria-hidden="true" />}
      <div className="tv-mi-part">
        {landed ? (
          <CardHead badge={gameBadge(modeOf(now))} icon="check" label="¡Este es!" name={variantName(now)} />
        ) : (
          <CardHead
            badge={
              <span className="tv-stage-logo" aria-hidden="true">
                <AppIcon small />
              </span>
            }
            icon="shuffle"
            label="Eligiendo el juego…"
            name={tiebreak ? "Juego de desempate" : `Juego ${intro.index + 1}`}
          />
        )}
        <div className="tv-mi-reel-place">
          <div className={`tv-mi-reel tv-c-${color}${landed ? " is-landed" : ""}`}>
            <span className="tv-mi-window" />
            <div className="tv-mi-reel-rows">
              <div ref={stripRef} className="tv-mi-strip">
                {rows}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// The picked game on its own card, as on Inicio, with what to do in it for exactly `tutorialMs` (5 s): the head where the
// roulette left it, the three steps where the search has its seats, and its clock and bar running out.
function Tutorial({ intro, leftMs }) {
  const m = findMode(intro.game);
  const steps = VARIANT_TUTORIALS[intro.variant] || TUTORIALS[intro.game] || m.steps || [];
  const seconds = Math.max(1, Math.ceil(leftMs / 1000));
  return (
    <>
      <div className="tv-mi-part tv-mi-tutorial">
        <div className="tv-mi-top">
          <CardHead badge={gameBadge(m)} icon="info" label="Cómo se juega" name={variantName(variantNow(intro))} />
          <div className="tv-finding-clock" role="timer" aria-label={`Empieza en ${seconds} segundos`}>
            <span>Empieza en</span>
            <strong key={seconds} className="is-count">
              {seconds}
            </strong>
          </div>
        </div>
        <ol className="tv-mi-steps">
          {steps.map((s) => (
            <li key={s.text} className="tv-mi-step">
              <span className="tv-stage-line-icon">
                <Icon name={s.icon} size={24} strokeWidth={2.4} />
              </span>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      </div>
      <TimeBar leftMs={leftMs} totalMs={intro.tutorialMs} />
    </>
  );
}

// Who won the game before (from the second game on), on that game's card: the line, what it takes to win the match (the first
// to win 2 games, or that the next game breaks a tie), and each player in the search's seats, in the order it ended, with
// their points in it. The winners' seats are white, their Blobs jumping.
function PreviousGame({ intro, players, leftMs, viewerId }) {
  const prev = intro.previous;
  const variant = variantBefore(intro);
  const mode = modeOf(variant);
  const topWins = Math.max(0, ...players.map((p) => p.wins || 0));
  // Nobody scored: the server gives the game to nobody, and it doesn't count towards winning the match.
  const winners = prev.ranking.filter((r) => prev.winners.includes(r.id));
  const line = !winners.length
    ? `Nadie ganó el juego ${intro.index}`
    : winners.length === 1
    ? `${firstName(winners[0].name)} ganó el juego ${intro.index}`
    : winners.length === 2
    ? `${winners.map((w) => firstName(w.name)).join(" y ")} empataron el juego ${intro.index}`
    : `Empate en el juego ${intro.index}`;
  const note = intro.winsToWin
    ? topWins >= intro.winsToWin
      ? `Empate a ${topWins} juegos ganados: otro juego desempata`
      : `Gana la partida el primero en ganar ${intro.winsToWin} juegos`
    : null;
  const seats = prev.ranking.length;
  return (
    <>
      <span className="tv-mstage-flash" aria-hidden="true" />
      {winners.some((w) => w.id === viewerId) && <Confetti pieces={28} />}
      <div className="tv-mi-part tv-mi-result">
        <CardHead badge={gameBadge(mode)} icon={mode.icon} label={`Juego ${intro.index} · ${variantName(variant)}`} name={line} />
        {note && <p className="tv-mi-note">{note}</p>}
        <ul className={`tv-finding-seats${seats > 6 ? " is-many" : ""}`} data-seats={seats} style={{ "--seats": seats }} aria-label="Puntos de cada jugador en ese juego">
          {prev.ranking.map((r, i) => {
            const me = r.id === viewerId;
            return (
              <li key={r.id} className={`tv-seat is-taken${prev.winners.includes(r.id) ? " is-win" : ""}`} style={{ "--i": i }}>
                <div className="tv-seat-who">
                  <span className="tv-seat-face">
                    <Blob color={blobColor(r.avatar)} mood="neutral" ring={me ? "var(--p-accent-2, #ffd60a)" : null} />
                  </span>
                  <span className="tv-seat-text">
                    <b className="tv-seat-name">{r.name}</b>
                    <span className="tv-seat-tag">{formatElo(r.points)} pts</span>
                    {r.elo && (
                      <span className="tv-seat-delta">
                        <span className="tv-seat-elo">
                          <Icon name="star" size={11} filled strokeWidth={1.5} />
                          <CountUp value={r.elo.after} start={r.elo.before} delay={500 + i * 110} duration={900} format={formatElo} />
                        </span>
                        <RatingDelta delta={r.elo.delta} unit="elo" style={{ "--pop": `${500 + i * 110}ms` }} />
                      </span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <TimeBar leftMs={leftMs} totalMs={intro.resultMs} />
    </>
  );
}

/** A player's games won as dots, as many as it takes to win the match, the one just won with a small pop. */
function GamesDots({ n, of, lit }) {
  return (
    <span className="tv-mi-dots" role="img" aria-label={n === 1 ? "1 juego ganado" : `${n} juegos ganados`}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={i < n ? `is-on${lit && i === n - 1 ? " is-new" : ""}` : ""} />
      ))}
    </span>
  );
}

// Beside the card, the boxes of Inicio and of the search: your elo with your Blob (not on the central device), and one box
// with everyone and the games they have won so far (dots, in a match decided by them), with the games played under them.
function IntroBoxes({ room, viewerId, showResult }) {
  const { user } = useApp();
  const intro = room.intro;
  const classic = Boolean(intro.winsToWin || findMode(room.run?.classic));
  const ranking = intro.previous?.ranking || [];
  const place = (id) => {
    const i = ranking.findIndex((r) => r.id === id);
    return i < 0 ? ranking.length : i;
  };
  const players = room.players.filter((p) => !p.spectator).sort((a, b) => (b.wins || 0) - (a.wins || 0) || place(a.id) - place(b.id));
  const goal = intro.winsToWin ? Math.max(intro.winsToWin, ...players.map((p) => p.wins || 0)) : 0;
  const played = (room.run?.results || []).map((g) => {
    const m = modeOf(g.variant);
    return { icon: m.icon, color: m.color, winners: room.players.filter((p) => g.winners?.includes(p.id)) };
  });
  return (
    <div className="tv-stage-aside tv-mi-aside">
      {viewerId &&
        (classic ? (
          <RankBox user={user} />
        ) : (
          <div className="tv-stage-box tv-stage-elo">
            <div className="tv-stage-elo-text">
              <span className="tv-stage-label">
                Elo en
                <br />
                {findMode(room.game)?.name}
              </span>
              <strong className="tv-stage-elo-num">{formatElo(eloIn(user, room.game))}</strong>
            </div>
            <Blob className="tv-stage-blob" color={blobColor(user?.avatar)} mood="neutral" />
          </div>
        ))}
      <div className="tv-stage-box tv-stage-friends tv-stage-social">
        <span className="tv-stage-label">{goal ? "Juegos ganados" : "Jugadores"}</span>
        <ul className="tv-party-players" aria-label="Jugadores de la partida">
          {players.map((p) => (
            <li key={p.id} className={`tv-player${p.id === viewerId ? " is-me" : ""}${p.connected ? "" : " is-away"}`}>
              <div className="tv-player-btn">
                <Avatar avatar={p.avatar} mood="neutral" />
                <span className="tv-player-text">
                  <span className="tv-player-name">{p.name}</span>
                  <span className="tv-player-tag">{p.connected ? "Listo" : "Reconectando…"}</span>
                </span>
                {goal > 0 && <GamesDots n={p.wins || 0} of={goal} lit={showResult && Boolean(intro.previous?.winners.includes(p.id))} />}
              </div>
            </li>
          ))}
        </ul>
        {played.length > 0 && (
          <div className="tv-stage-social-friends">
            <span className="tv-stage-label">Juegos jugados</span>
            <GamesWon items={played} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Before each game of a public match or a Clásico (the room's "intro" phase): the game before, a roulette that picks the
 * game among the ones still to play, then a short tutorial of it for 5 s. A private match of one game, or one searched
 * for by name, has only the tutorial. On purpose it isn't the rounds' frame but the one of Inicio and of the search, with
 * the same pieces: the game's big card in its colour (the Clásico's while the roulette spins) and the dark boxes beside it.
 */
export default function MatchIntro({ room }) {
  const { user, isCentral } = useApp();
  const { stage, resultLeftMs, tutorialLeftMs } = useIntroStage(room);
  // The card in the game's colour, or dark ("neutro", an owner's choice).
  const { tone } = useResultsLook();
  const still = useBlobsStill();
  const intro = room.intro;
  const viewerId = isCentral ? null : user?.id;
  // The roulette's own moment of stopping (to the frame, not to the clock's 200 ms): which intro it already stopped in.
  const [landedIn, setLandedIn] = useState(null);
  const spinning = stage === "spin" || stage === "landed";
  const landed = spinning && landedIn === intro.index;
  const mode = stage === "result" ? modeOf(variantBefore(intro)) : findMode(intro.game);

  return (
    <section className={`tv-stage has-aside tv-mi is-${tone}${still ? " is-still" : ""}`} aria-label="Siguiente juego">
      <div className={`tv-stage-card tv-mi-card ${spinning && !landed ? "is-classic" : `tv-c-${mode.color}`}${landed ? " is-landing" : ""}`}>
        {(!spinning || landed) && (
          <span className="tv-stage-mark" aria-hidden="true">
            <Icon name={mode.icon} size={300} strokeWidth={2} />
          </span>
        )}
        {stage === "result" ? (
          <PreviousGame intro={intro} players={room.players} leftMs={resultLeftMs} viewerId={viewerId} />
        ) : stage === "tutorial" ? (
          <Tutorial key={`t${intro.index}`} intro={intro} leftMs={tutorialLeftMs} />
        ) : (
          <Roulette key={`r${intro.index}`} room={room} startedAt={room.phaseStartedAt + (intro.previous ? intro.resultMs || 0 : 0)} kind={room.matchmaking?.kind || "casual"} onLand={() => setLandedIn(intro.index)} />
        )}
      </div>
      <IntroBoxes room={room} viewerId={viewerId} showResult={stage === "result"} />
    </section>
  );
}
