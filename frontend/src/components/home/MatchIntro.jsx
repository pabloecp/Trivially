import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RANDOM_VOTE } from "../../lib/matchVotes.js";
import { play } from "../../lib/sounds.js";
import { useView } from "../../lib/store.jsx";
import { findMode } from "../../modes/index.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import { ReelMarker } from "./SlowReel.jsx";
import { MATCH_KINDS, TUTORIALS, VARIANT_TUTORIALS, findVariant, variantsFor } from "./matchInfo.js";
import "../../styles/match.css";

// The reel's cards: how wide each one is plus the gap after it (match.css: --mi-card and --mi-gap).
const CARD = 168;
const GAP = 14;
const STEP = CARD + GAP;
// About how many cards go past the marker before it stops: the cards still in the roulette go round as many times as
// that takes (at least twice).
const REEL_CARDS = 42;
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

// The roulette's cards and the one it lands on. A public match spins among its players' votes still left (`ballot`:
// a card per vote, with who gave it, in the order the server drew them); a Clásico (or an older server) among the games
// not played yet.
function rouletteCards(intro, kind) {
  if (intro.ballot?.length) {
    return { cards: intro.ballot.map((vote) => ({ variant: vote.variant, voter: vote })), pick: Math.max(0, intro.pick) };
  }
  const played = variantsOf(intro).slice(0, intro.index);
  const now = variantNow(intro);
  const all = intro.variants ? variantsFor(kind).map((v) => v.id) : intro.games;
  const left = all.filter((v) => !played.includes(v));
  const pool = left.includes(now) ? left : [now];
  return { cards: pool.map((variant) => ({ variant, voter: null })), pick: Math.max(0, pool.indexOf(now)) };
}

// Who gave the vote the roulette landed on: "Voto de Ana", "Tu voto al azar"...
function voteLine(vote, viewerId) {
  const random = vote.variant === RANDOM_VOTE ? " al azar" : "";
  return vote.userId === viewerId ? `Tu voto${random}` : `Voto${random} de ${vote.name}`;
}

// The roulette: its cards go past under the marker, slowing down until the server's pick is in the middle. It's drawn
// in JS (not a CSS transition) so each card that crosses the marker can tick.
function Roulette({ intro, startedAt, clockOffset, color, kind, viewerId }) {
  const { cards, pick } = rouletteCards(intro, kind);
  const laps = Math.max(2, Math.ceil(REEL_CARDS / cards.length));
  const reel = Array.from({ length: laps * cards.length }, (_, i) => cards[i % cards.length]);
  const target = (laps - 1) * cards.length + pick;
  const votes = Boolean(intro.ballot?.length);
  const picked = votes ? intro.ballot[pick] : null;
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
    <div className={`tv-mi-roulette${votes ? " is-votes" : ""}${color ? ` tv-reel-${color}` : ""}${landed ? " is-landed" : ""}`}>
      <div className="tv-mi-window">
        <ReelMarker />
        <div ref={trackRef} className="tv-mi-track">
          {reel.map((card, i) => (
            <ReelCard
              key={i}
              card={card}
              picked={landed && i === target}
              // "Al azar" shows the game it became once the roulette stops on it.
              variant={landed && i === target && card.variant === RANDOM_VOTE ? variantNow(intro) : card.variant}
              viewerId={viewerId}
              hidden={i !== target}
            />
          ))}
        </div>
      </div>
      <div className="tv-mi-captions" aria-live="polite">
        <p className="tv-mi-caption">{landed ? `¡${variantName(variantNow(intro))}!` : votes ? "Eligiendo entre los votos…" : "Eligiendo el juego…"}</p>
        {/* Under it, how many votes are in the roulette, and once it stops, whose vote it was. */}
        {votes && (
          <p key={landed ? "who" : "count"} className="tv-mi-votedby">
            {landed ? voteLine(picked, viewerId) : intro.ballot.length === 1 ? "1 voto" : `${intro.ballot.length} votos`}
          </p>
        )}
      </div>
    </div>
  );
}

// One card of the roulette: the game's icon, its name and way small under it ("Al azar" a die on the logo's colours),
// and, for a vote, who gave it (one card per player: two who voted the same game get a card each).
function ReelCard({ card, variant, picked, viewerId, hidden }) {
  const voter = card.voter && (
    <span className="tv-mi-voter">
      <Avatar name={card.voter.name} avatar={card.voter.avatar} />
      <span className="tv-mi-voter-name">{card.voter.userId === viewerId ? "Tú" : card.voter.name}</span>
    </span>
  );
  if (variant === RANDOM_VOTE) {
    return (
      <div className="tv-mi-card is-random" aria-hidden={hidden}>
        <span className="tv-mi-card-icon">
          <Icon name="shuffle" size={44} strokeWidth={2.4} />
        </span>
        <span className="tv-mi-card-name">Al azar</span>
        <span className="tv-mi-card-way">Cualquier juego</span>
        {voter}
      </div>
    );
  }
  const v = findVariant(variant);
  const m = findMode(v.game);
  return (
    <div className={`tv-mi-card tv-c-${m.color}${picked ? " is-picked" : ""}`} aria-hidden={hidden}>
      <span className="tv-mi-card-icon">
        <Icon name={m.icon} size={50} strokeWidth={2.2} />
      </span>
      <span className="tv-mi-card-name">{m.name}</span>
      {v.way && <span className="tv-mi-card-way">{v.way}</span>}
      {voter}
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
 * Before each game of a public match (the room's "intro" phase): a roulette picks the game among the players' votes
 * still left (in a Clásico, among the games still to play), then a short tutorial of it for 5 s. It takes the room screen's main card (Home), beside the room's column,
 * so the top bar, the players and the chat stay in sight.
 */
export default function MatchIntro({ room }) {
  const intro = room?.phase === "intro" ? room.intro : null;
  const now = useServerNow(room, 200);
  // Whose votes are "Tú" (nobody's on the central device).
  const { viewerId } = useView(room);

  if (!intro) return null;
  const elapsed = now - room.phaseStartedAt;
  const spinning = elapsed < intro.spinMs;
  const leftMs = intro.spinMs + intro.tutorialMs - elapsed;
  const kind = MATCH_KINDS[room.matchmaking?.kind];
  // A Clásico of a private room (Normal or Extendido): its name and colour instead of the public match's.
  const classic = findMode(room.run?.classic);
  const label = kind ? `Partida ${kind.name.toLowerCase()}` : classic?.fullName;
  const total = variantsOf(intro).length;

  return (
    <section className="tv-mcard tv-mi" aria-label="Siguiente juego">
      <div className="tv-mi-frame">
        <header className="tv-mi-head">
          <p className="tv-mono-label">
            {label ? `${label} · ` : ""}Juego {intro.index + 1} de {total}
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
          <Roulette
            key={`r${intro.index}`}
            intro={intro}
            startedAt={room.phaseStartedAt}
            clockOffset={room.clockOffset || 0}
            color={kind?.color || classic?.color}
            kind={room.matchmaking?.kind || "casual"}
            viewerId={viewerId}
          />
        ) : (
          <Tutorial key={`t${intro.index}`} intro={intro} leftMs={leftMs} />
        )}
      </div>
    </section>
  );
}
