import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { play } from "../../lib/sounds.js";
import { findMode } from "../../modes/index.js";
import Icon from "./Icon.jsx";
import { ReelMarker } from "./SlowReel.jsx";
import { MATCH_GAMES, MATCH_KINDS, TUTORIALS } from "./matchInfo.js";
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

// The roulette: the games not played yet go past under the marker, slowing down until the server's pick is in the
// middle. It's drawn in JS (not a CSS transition) so each card that crosses the marker can tick.
function Roulette({ intro, startedAt, clockOffset, color }) {
  const played = intro.games.slice(0, intro.index);
  const left = MATCH_GAMES.filter((g) => !played.includes(g));
  const pool = left.length ? left : [intro.game];
  const reel = Array.from({ length: LAPS * pool.length }, (_, i) => pool[i % pool.length]);
  const target = (LAPS - 1) * pool.length + Math.max(0, pool.indexOf(intro.game));
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
            const m = findMode(id);
            return (
              <div key={i} className={`tv-mi-card tv-c-${m.color}${landed && i === target ? " is-picked" : ""}`} aria-hidden={i !== target}>
                {/* The game's icon, and its name small under it. */}
                <span className="tv-mi-card-icon">
                  <Icon name={m.icon} size={50} strokeWidth={2.2} />
                </span>
                <span className="tv-mi-card-name">{m.name}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="tv-mi-caption" aria-live="polite">
        {landed ? `¡${findMode(intro.game).name}!` : "Eligiendo el juego…"}
      </p>
    </div>
  );
}

// The game the roulette picked, with what to do in it, for exactly `tutorialMs` (5 s): the bar fills meanwhile.
function Tutorial({ intro, leftMs }) {
  const m = findMode(intro.game);
  const steps = TUTORIALS[intro.game] || m.steps || [];
  const barRef = useRef(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const done = 1 - Math.min(1, leftMs / intro.tutorialMs);
    bar.style.transition = "none";
    bar.style.transform = `scaleX(${done})`;
    // Next frame: run to the end in the time left.
    requestAnimationFrame(() => {
      bar.style.transition = `transform ${Math.max(0, leftMs)}ms linear`;
      bar.style.transform = "scaleX(1)";
    });
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
          <h2 className="tv-mi-tut-name">{m.name}</h2>
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
        <div className="tv-mi-bar">
          <span ref={barRef} />
        </div>
        <span className="tv-mi-count" key={seconds}>
          Empieza en {seconds}
        </span>
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
  const total = intro.games.length;

  return (
    <section className="tv-mcard tv-mi" aria-label="Siguiente juego">
      <div className="tv-mi-frame">
        <header className="tv-mi-head">
          <p className="tv-mono-label">
            {kind ? `Partida ${kind.name.toLowerCase()} · ` : ""}Juego {intro.index + 1} de {total}
          </p>
          {total > 1 && (
            <ol className="tv-mi-dots" aria-hidden="true">
              {intro.games.map((g, i) => {
                const m = findMode(g);
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
          <Roulette key={`r${intro.index}`} intro={intro} startedAt={room.phaseStartedAt} clockOffset={room.clockOffset || 0} color={kind?.color} />
        ) : (
          <Tutorial key={`t${intro.index}`} intro={intro} leftMs={leftMs} />
        )}
      </div>
    </section>
  );
}
