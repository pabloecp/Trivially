import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { play } from "../../lib/sounds.js";
import { findMode } from "../../modes/index.js";
import Icon from "./Icon.jsx";
import { MATCH_KINDS, TUTORIALS, VARIANT_TUTORIALS, findVariant, variantsFor } from "./matchInfo.js";
import { useResultsLook } from "../../lib/ownerView.js";
import { RetouchBetween } from "./ResultsLooks.jsx";
import "../../styles/match.css";

// The reel's cards: how wide each one is plus the gap after it (match.css: --mi-card and --mi-gap).
const CARD = 168;
const GAP = 14;
const STEP = CARD + GAP;
// How many times the games still to play go round the reel before it stops.
const LAPS = 7;
// Cards drawn before where the reel starts and after where it stops, so the window is always full on both sides,
// however wide: the reel looks endless (6 cards cover 1092 px on each side of the marker).
const PAD = 6;
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

// The roulette: the games not played yet (each with its way) roll up in one panel that takes the colour of the game in
// the middle as it goes, until the server's pick is there and it pulses. It's drawn in JS (not a CSS transition) so each
// game that goes by can tick. In the "neutro" tone the panel stays dark and only the icon's tile takes the game's colour.
const ROW = 92;
function PanelRoulette({ intro, startedAt, clockOffset, kind, tone }) {
  const played = variantsOf(intro).slice(0, intro.index);
  const now = variantNow(intro);
  const all = intro.variants ? variantsFor(kind).map((v) => v.id) : intro.games;
  const left = all.filter((v) => !played.includes(v));
  const pool = left.includes(now) ? left : [now];
  const start = Math.ceil(PAD / pool.length) * pool.length;
  const target = start + (LAPS - 1) * pool.length + Math.max(0, pool.indexOf(now));
  const reel = Array.from({ length: target + PAD + 1 }, (_, i) => pool[i % pool.length]);
  const iconsRef = useRef(null);
  const namesRef = useRef(null);
  const [cell, setCell] = useState(start);
  const [landed, setLanded] = useState(false);

  useLayoutEffect(() => {
    const duration = Math.max(1, intro.spinMs - SETTLE_MS);
    let frame = 0;
    let lastCell = -1;
    const tick = () => {
      const t = Math.min(1, (Date.now() + clockOffset - startedAt) / duration);
      const x = start + (target - start) * easeOut(t);
      for (const el of [iconsRef.current, namesRef.current]) if (el) el.style.transform = `translateY(${-x * ROW}px)`;
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
        play("next");
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [target, startedAt]);

  const color = findMode(findVariant(reel[cell] || now).game).color;
  const strip = (ref, render) => (
    <div ref={ref} className="rl-spin-strip">
      {reel.map((id, i) => {
        const v = findVariant(id);
        const m = findMode(v.game);
        return (
          <div key={i} className={`rl-spin-row tv-c-${m.color}`} aria-hidden={i !== target}>
            {render(v, m)}
          </div>
        );
      })}
    </div>
  );
  return (
    <div className={`rl-spin is-${tone}${landed ? " is-landed" : ""}`}>
      <div className={`rl-spin-panel tv-c-${color}`}>
        <div className="rl-spin-icons">
          {strip(iconsRef, (v, m) => (
            <span className="rl-spin-icon">
              <Icon name={m.icon} size={46} strokeWidth={2.2} />
            </span>
          ))}
        </div>
        <div className="rl-spin-names">
          {strip(namesRef, (v, m) => (
            <span>
              <b>{m.name}</b>
              {v.way && <small>{v.way}</small>}
            </span>
          ))}
        </div>
      </div>
      <p className="tv-mi-caption" aria-live="polite">
        {landed ? `¡${variantName(now)}!` : "Eligiendo el juego…"}
      </p>
    </div>
  );
}

// Length of the clock's ring (2πr, r = 19 in a 44 × 44 box): the same round clock as a game's (.tv-clock).
const RING = 119.4;

// The game the roulette picked, with what to do in it, for exactly `tutorialMs` (5 s): a game's round clock counts the
// seconds down meanwhile, its ring emptying smoothly, and a line beside it empties in the same time, like the ring.
function Tutorial({ intro, leftMs, tone = "color" }) {
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
    <div className={`tv-mi-tutorial tv-c-${m.color} rl-tut is-${tone}`}>
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

// Who won the game before (from the second game on): a quiet line with who won it, every player's points in it and,
// on the right, the games won so far in the match (they start again from zero in the next game's scoreboard), the
// winners ringed in the match's `color`.
function PreviousGame({ intro, players, color = "site" }) {
  const prev = intro.previous;
  const { style, tone } = useResultsLook();
  const winsOf = (id) => players.find((p) => p.id === id)?.wins || 0;
  // Nobody scored (the server gives the game to nobody): it's shown as a tie between everyone.
  const winners = prev.winners.length ? prev.ranking.filter((r) => prev.winners.includes(r.id)) : prev.ranking;
  const total = variantsOf(intro).length;
  const left = total - intro.index;
  const line =
    winners.length === 1
      ? `${winners[0].name.split(" ")[0]} ganó el juego ${intro.index}`
      : winners.length === 2
      ? `${winners.map((w) => w.name.split(" ")[0]).join(" y ")} empataron el juego ${intro.index}`
      : `Empate en el juego ${intro.index}`;
  return (
    <div className="tv-mi-prev">
      <RetouchBetween
        kicker={`Juego ${intro.index} de ${total}${prev.variant ? ` · ${variantName(prev.variant)}` : ""}`}
        line={line}
        note={left > 0 ? `${left === 1 ? "Queda 1 juego" : `Quedan ${left} juegos`} · gana la partida quien gane más juegos` : null}
        players={prev.ranking}
        winners={winners.map((w) => w.id)}
        points={(r) => r.points}
        wins={(r) => winsOf(r.id)}
        retouch={style}
        tone={tone}
        color={color}
      />
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
  // From the second game on, the intro starts with the result of the game before (`resultMs`), then the roulette.
  const resultMs = intro.previous ? intro.resultMs || 0 : 0;
  const showingResult = now - room.phaseStartedAt < resultMs;
  const elapsed = now - room.phaseStartedAt - resultMs;
  const spinning = elapsed < intro.spinMs;
  const leftMs = intro.spinMs + intro.tutorialMs - elapsed;
  const kind = MATCH_KINDS[room.matchmaking?.kind];
  // A Clásico of a private room (Normal or Extendido): its name and colour instead of the public match's.
  const classic = findMode(room.run?.classic);
  const label = kind ? `Partida ${kind.name.toLowerCase()}` : classic?.fullName;
  const total = variantsOf(intro).length;
  // The roulette and the tutorial in the game's colour, or dark ("neutro", an owner's choice).
  const { tone } = useResultsLook();

  return (
    <section className="tv-mcard tv-mi" aria-label="Siguiente juego">
      <div className="tv-mi-frame">
        <header className="tv-mi-head">
          <p className="tv-mono-label">
            {label ? `${label} · ` : ""}
            {intro.decider ? "Juego de desempate" : `Juego ${intro.index + 1} de ${total}`}
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
        {showingResult ? (
          <PreviousGame intro={intro} players={room.players} color={kind?.color || classic?.color} />
        ) : spinning ? (
          <PanelRoulette key={`r${intro.index}`} intro={intro} startedAt={room.phaseStartedAt + resultMs} clockOffset={room.clockOffset || 0} kind={room.matchmaking?.kind || "casual"} tone={tone} />
        ) : (
          <Tutorial key={`t${intro.index}`} intro={intro} leftMs={leftMs} tone={tone} />
        )}
      </div>
    </section>
  );
}
