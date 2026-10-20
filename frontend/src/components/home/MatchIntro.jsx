import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { play } from "../../lib/sounds.js";
import { findMode } from "../../modes/index.js";
import Icon from "./Icon.jsx";
import { ReelMarker } from "./SlowReel.jsx";
import { MATCH_KINDS, TUTORIALS, VARIANT_TUTORIALS, findVariant, variantsFor } from "./matchInfo.js";
import "../../styles/match.css";

// The reel's cards: how wide each one is plus the gap after it (match.css: --mi-card and --mi-gap).
const CARD = 168;
const GAP = 14;
const STEP = CARD + GAP;
// How many times the games still to play go round the reel before it stops.
const LAPS = 7;
// The reel stops this long before the roulette's time is over, so the picked game is seen still for a moment.
const SETTLE_MS = 900;

const easeOut = (t) => 1 - (1 - t) ** 4;

function useServerNow(room, every = 100) {
  const [now, setNow] = useState(() => Date.now() + (room?.clockOffset || 0));
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + (room?.clockOffset || 0)), every);
    return () => clearInterval(id);
  }, [room?.clockOffset, every]);
  return now;
}

// "Trivia Cerradas": a variant's game and way.
function variantName(id) {
  const v = findVariant(id);
  const name = findMode(v.game)?.name || "";
  return v.way ? `${name} ${v.way}` : name;
}

// The match's games in play order and the one now: each game with its one way ("trivia-cerradas"); an older server only
// sends the games.
const variantsOf = (intro) => intro.variants || intro.games;
const variantNow = (intro) => intro.variant || intro.game;

// The roulette: the games not played yet (each with its way) go past under the marker, slowing down until the server's
// pick is in the middle. It's drawn in JS (not a CSS transition) so each card that crosses the marker can tick.
function Roulette({ intro, startedAt, clockOffset, color, kind }) {
  const played = variantsOf(intro).slice(0, intro.index);
  const now = variantNow(intro);
  const all = intro.variants ? variantsFor(kind).map((v) => v.id) : intro.games;
  const left = all.filter((v) => !played.includes(v));
  const pool = left.includes(now) ? left : [now];
  const reel = Array.from({ length: LAPS * pool.length }, (_, i) => pool[i % pool.length]);
  const target = (LAPS - 1) * pool.length + Math.max(0, pool.indexOf(now));
  const trackRef = useRef(null);
  const [landed, setLanded] = useState(false);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const end = target * STEP;
    const duration = Math.max(1, intro.spinMs - SETTLE_MS);
    const place = (x) => {
      track.style.transform = `translateX(${-x - CARD / 2}px)`;
    };
    let frame = 0;
    let lastCell = -1;
    const tick = () => {
      const t = Math.min(1, (Date.now() + clockOffset - startedAt) / duration);
      const x = end * easeOut(t);
      place(x);
      const cell = Math.round(x / STEP);
      if (cell !== lastCell) {
        if (lastCell !== -1 && t < 1) play("tap");
        lastCell = cell;
      }
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setLanded(true);
        play("next");
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [target, startedAt]);

  return (
    <div className={`tv-mi-roulette${color ? ` tv-reel-${color}` : ""}${landed ? " is-landed" : ""}`}>
      <div className="tv-mi-window">
        <ReelMarker />
        <div ref={trackRef} className="tv-mi-track">
          {reel.map((id, i) => {
            const v = findVariant(id);
            const m = findMode(v.game);
            return (
              <div key={i} className={`tv-mi-card tv-c-${m.color}${landed && i === target ? " is-picked" : ""}`} aria-hidden={i !== target}>
                {/* The game's icon, and its name and way small under it. */}
                <span className="tv-mi-card-icon">
                  <Icon name={m.icon} size={50} strokeWidth={2.2} />
                </span>
                <span className="tv-mi-card-name">{m.name}</span>
                {v.way && <span className="tv-mi-card-way">{v.way}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <p className="tv-mi-caption" aria-live="polite">
        {landed ? `¡${variantName(variantNow(intro))}!` : "Eligiendo el juego…"}
      </p>
    </div>
  );
}

// Length of the clock's ring (2πr, r = 19 in a 44 × 44 box): the same round clock as a game's (.tv-clock).
const RING = 119.4;

// The game the roulette picked, with what to do in it, for exactly `tutorialMs` (5 s): a game's round clock counts the
// seconds down meanwhile, its ring emptying smoothly, and a line beside it empties in the same time, like the ring.
function Tutorial({ intro, leftMs }) {
  const m = findMode(intro.game);
  const steps = VARIANT_TUTORIALS[intro.variant] || TUTORIALS[intro.game] || m.steps || [];
  const ringRef = useRef(null);
  const barRef = useRef(null);
  useLayoutEffect(() => {
    const ring = ringRef.current;
    const bar = barRef.current;
    if (!ring || !bar) return;
    const done = 1 - Math.min(1, leftMs / intro.tutorialMs);
    const run = `${Math.max(0, leftMs)}ms linear`;
    ring.style.transition = "none";
    ring.style.strokeDashoffset = `${RING * done}`;
    bar.style.transition = "none";
    bar.style.transform = `scaleX(${1 - done})`;
    // The browser takes that as where they start (reading a size makes it apply it now); then they run to the end in the
    // time left. Without the read they would jump straight to the end.
    ring.getBoundingClientRect();
    ring.style.transition = `stroke-dashoffset ${run}`;
    ring.style.strokeDashoffset = `${RING}`;
    bar.style.transition = `transform ${run}`;
    bar.style.transform = "scaleX(0)";
  }, []);
  const seconds = Math.max(1, Math.ceil(leftMs / 1000));
  return (
    <div className={`tv-mi-tutorial tv-c-${m.color}`}>
      <div className="tv-mi-tut-head">
        <span className={`tv-badge tv-c-${m.color} tv-mi-tut-badge`}>
          <Icon name={m.icon} size={34} strokeWidth={2.2} />
        </span>
        <div>
          <p className="tv-mono-label">Cómo se juega</p>
          <h2 className="tv-mi-tut-name">{variantName(variantNow(intro))}</h2>
        </div>
      </div>
      <ol className="tv-mi-steps">
        {steps.map((s, i) => (
          <li key={s.text} className="tv-mi-step" style={{ "--i": i }}>
            <span className={`tv-mi-step-icon tv-c-${m.color}`}>
              <Icon name={s.icon} size={20} strokeWidth={2.4} />
            </span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      <div className="tv-mi-progress">
        <div className="tv-clock tv-mi-clock" role="timer" aria-label={`Empieza en ${seconds} segundos`}>
          <svg viewBox="0 0 44 44" aria-hidden="true">
            <circle className="tv-clock-track" cx="22" cy="22" r="19" />
            <circle ref={ringRef} className="tv-clock-fill" cx="22" cy="22" r="19" />
          </svg>
          <span key={seconds} className="tv-clock-num">
            {seconds}
          </span>
        </div>
        <div className="tv-mi-bar" aria-hidden="true">
          <span ref={barRef} />
        </div>
      </div>
    </div>
  );
}

/**
 * Before each game of a public match (the room's "intro" phase): a roulette picks the game among the ones still to
 * play, then a short tutorial of it for 5 s. It takes the room screen's main card (Home), beside the room's column,
 * so the top bar, the players and the chat stay in sight.
 */
export default function MatchIntro({ room }) {
  const intro = room?.phase === "intro" ? room.intro : null;
  const now = useServerNow(room, 200);

  if (!intro) return null;
  const elapsed = now - room.phaseStartedAt;
  const spinning = elapsed < intro.spinMs;
  const leftMs = intro.spinMs + intro.tutorialMs - elapsed;
  const kind = MATCH_KINDS[room.matchmaking?.kind];
  const total = variantsOf(intro).length;

  return (
    <section className="tv-mcard tv-mi" aria-label="Siguiente juego">
      <div className="tv-mi-frame">
        <header className="tv-mi-head">
          <p className="tv-mono-label">
            {kind ? `Partida ${kind.name.toLowerCase()} · ` : ""}Juego {intro.index + 1} de {total}
          </p>
          {total > 1 && (
            <ol className="tv-mi-dots" aria-hidden="true">
              {variantsOf(intro).map((g, i) => {
                const m = findMode(findVariant(g).game);
                const state = i < intro.index ? "done" : i === intro.index ? "now" : "next";
                // The game on now only shows its colour once the roulette stopped: it would give the pick away.
                const shown = state === "done" || (state === "now" && !spinning);
                return (
                  <li key={i} className={`tv-mi-dot is-${state}${shown ? ` tv-c-${m.color}` : ""}`}>
                    {state === "done" || (state === "now" && !spinning) ? (
                      <Icon name={state === "done" ? "check" : m.icon} size={14} strokeWidth={2.8} />
                    ) : (
                      "?"
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </header>
        {spinning ? (
          <Roulette key={`r${intro.index}`} intro={intro} startedAt={room.phaseStartedAt} clockOffset={room.clockOffset || 0} color={kind?.color} kind={room.matchmaking?.kind} />
        ) : (
          <Tutorial key={`t${intro.index}`} intro={intro} leftMs={leftMs} />
        )}
      </div>
    </section>
  );
}
