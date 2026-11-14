import { useEffect, useState } from "react";
import Blob from "./Blob.jsx";
import CountUp from "./CountUp.jsx";
import Icon from "./Icon.jsx";
import { findVariant } from "./matchInfo.js";
import { blobColor } from "../../lib/blobColors.js";
import { formatElo } from "../../lib/gameStats.js";
import { rankInfo } from "../../lib/rank.js";
import { findMode } from "../../modes/index.js";
import "../../styles/ratings.css";

import { translate as tr } from "../../lib/i18n.js";
// What a match moved (the server's `room.ratings`: every game's elo, and a Clásico's rank), for the results screens: the
// change beside each player, and how it went for you in a box of Inicio's under the cards. It all waits for the cards to
// come in (ROW_DELAY) and goes by itself: the numbers roll, the change pops in, and the rank's bar fills.
const ROW_DELAY = 900;
const ROW_STEP = 110;
const ROLL_MS = 1000;
const BOX_DELAY = 1100;

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A change as it reads on screen: "+24", "−12", "0". */
export const deltaText = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/** The change as a label, like a round's verdict: white with green letters going up, red going down, dark when it stays. */
export function RatingDelta({ delta, unit = "", className = "", style }) {
  const tone = delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-same";
  return (
    <span className={`tv-delta ${tone} ${className}`} style={style}>
      {delta !== 0 && <Icon name="chevron" size={11} strokeWidth={4} />}
      {deltaText(delta)}
      {unit && ` ${unit}`}
    </span>
  );
}

/** What moved for each player in a row of the results, or null: a Clásico's rank, or the elo of a match of one game. */
export function rowChanges(ratings) {
  if (!ratings) return null;
  const source = ratings.rank ? { kind: "rank", list: ratings.rank } : ratings.games.length === 1 ? { kind: "elo", list: ratings.games[0].changes } : null;
  if (!source) return null;
  return new Map(source.list.map((c) => [c.id, { ...c, kind: source.kind }]));
}

/** A player's change, at the end of their row in the ranking: their new elo rolling up to it (or their rank), and how much. */
export function RowChange({ change, index = 0 }) {
  const delay = ROW_DELAY + index * ROW_STEP;
  const style = { "--pop": `${delay + ROLL_MS - 150}ms` };
  const after = change.kind === "rank" ? rankInfo({ points: change.after }) : null;
  return (
    <span className="tv-rowchange">
      {after ? (
        <span className="tv-rowchange-top">
          <RankMark info={after} size={12} />
          {after.label}
        </span>
      ) : (
        <span className="tv-rowchange-top">
          <Icon name="star" size={12} filled strokeWidth={1.5} />
          <CountUp value={change.after} start={change.before} delay={delay} duration={ROLL_MS} format={formatElo} />
        </span>
      )}
      <RatingDelta delta={change.delta} style={style} />
    </span>
  );
}

/** A rank's mark: a shield of the tier's colour. */
export function RankMark({ info, size = 20 }) {
  return (
    <span className="tv-rankmark" style={{ "--tier": info.tier.color, "--tier-edge": info.tier.edge, width: size, height: size }} aria-hidden="true">
      <Icon name={info.index >= 4 ? "crown" : "star"} size={Math.round(size * 0.62)} filled strokeWidth={1.5} />
    </span>
  );
}

// The rank's box, with its bar: where it was, then filling up to where it is. Crossing into another division, the bar
// reaches its end, the name changes with a pop and it fills again from the other side.
function RankProgress({ change }) {
  const before = rankInfo({ points: change.before });
  const after = rankInfo({ points: change.after });
  const moved = before.label !== after.label;
  const up = change.delta > 0;
  const [phase, setPhase] = useState(reduceMotion() ? "done" : "start");

  useEffect(() => {
    if (reduceMotion()) return undefined;
    const timers = [setTimeout(() => setPhase("move"), BOX_DELAY)];
    if (moved) {
      timers.push(setTimeout(() => setPhase("wrap"), BOX_DELAY + 800));
      timers.push(setTimeout(() => setPhase("done"), BOX_DELAY + 860));
    } else {
      timers.push(setTimeout(() => setPhase("done"), BOX_DELAY + 800));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  const crossed = phase === "wrap" || phase === "done";
  const shown = crossed ? after : before;
  const width =
    phase === "start"
      ? before.progress
      : phase === "move"
      ? moved
        ? up
          ? 1
          : 0
        : after.progress
      : phase === "wrap"
      ? up
        ? 0
        : 1
      : after.progress;
  const note = moved && crossed ? (up ? tr("¡Subiste a {label}!", { label: after.label }) : `Bajaste a ${after.label}`) : after.toNext != null ? tr("Faltan {v0} para {nextLabel}", { v0: formatElo(after.toNext), nextLabel: after.nextLabel }) : `${formatElo(after.points)} puntos`;

  return (
    <div className="tv-ratingbox-rank">
      <div className="tv-ratingbox-tier">
        <RankMark key={shown.label} info={shown} size={34} />
        <strong key={`n${shown.label}`} className={`tv-ratingbox-tiername${moved && crossed ? " is-new" : ""}`} style={{ color: shown.tier.color }}>
          {shown.label}
        </strong>
        <RatingDelta delta={change.delta} className="tv-ratingbox-delta" style={{ "--pop": `${BOX_DELAY + 500}ms` }} />
      </div>
      <span className="tv-ratingbox-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(after.progress * 100)} aria-label={tr("Avance del rango")} style={{ "--tier": shown.tier.color }}>
        <i className={phase === "wrap" ? "is-jump" : ""} style={{ width: `${Math.round(width * 100)}%` }} />
      </span>
      <span className={`tv-ratingbox-note${moved && crossed ? " is-new" : ""}`}>{note}</span>
    </div>
  );
}

/** Each game of a Clásico with what it did to your elo in that game, whoever won the match. */
function GameChips({ games }) {
  return (
    <ul className="tv-ratingbox-games" aria-label={tr("Elo en cada juego")}>
      {games.map((g, i) => {
        const mode = findMode(findVariant(g.variant)?.game || g.game);
        return (
          <li key={i} style={{ "--pop": `${BOX_DELAY + 700 + i * 120}ms` }} title={mode?.name}>
            <span className={`tv-ratingbox-gameicon tv-c-${mode?.color || "neutral"}`} aria-hidden="true">
              <Icon name={mode?.icon || "play"} size={16} strokeWidth={2.6} />
            </span>
            <RatingDelta delta={g.change.delta} />
            <span className="tv-sr-only">
              {mode?.name}: {deltaText(g.change.delta)} {tr("de elo")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// The elo of a match of one game: the number rolling up to the new one, and how much in words.
function EloProgress({ change, gameName }) {
  const line = change.delta > 0 ? tr("Subiste {delta} de elo", { delta: change.delta }) : change.delta < 0 ? tr("Bajaste {v0} de elo", { v0: Math.abs(change.delta) }) : tr("Tu elo sigue igual");
  return (
    <div className="tv-ratingbox-elo">
      <div className="tv-ratingbox-tier">
        <Icon name="star" size={28} filled strokeWidth={1.5} />
        <strong className="tv-ratingbox-num">
          <CountUp value={change.after} start={change.before} delay={BOX_DELAY} duration={ROLL_MS + 200} format={formatElo} />
        </strong>
        <RatingDelta delta={change.delta} className="tv-ratingbox-delta" style={{ "--pop": `${BOX_DELAY + ROLL_MS}ms` }} />
      </div>
      <span className="tv-ratingbox-note">{gameName ? tr("{line} en {gameName}", { line: line, gameName: gameName }) : line}</span>
    </div>
  );
}

/**
 * How the match went for you, in one of Inicio's dark boxes under the cards: your Blob and your elo in the game, or in a
 * Clásico your rank and, beside it, each game's elo. Nothing for whoever has nothing here (a guest, the central device).
 */
export function RatingBox({ ratings, me, gameName = "" }) {
  if (!ratings || !me) return null;
  const rank = ratings.rank?.find((c) => c.id === me.id) || null;
  const games = ratings.games.map((g) => ({ ...g, change: g.changes.find((c) => c.id === me.id) })).filter((g) => g.change);
  const only = !rank && games.length === 1 ? games[0].change : null;
  if (!rank && !only) return null;
  const main = rank || only;
  const mood = main.delta > 0 ? "victoria" : main.delta < 0 ? "derrota" : "neutral";
  const limited = main.delta === 0 && main.limited;
  return (
    <section className="tv-stage-box tv-ratingbox" aria-label={rank ? tr("Tu rango") : tr("Tu elo")}>
      <Blob className="tv-ratingbox-blob" color={blobColor(me.avatar)} mood={mood} />
      <div className="tv-ratingbox-main">
        <span className="tv-stage-label">{rank ? tr("Rango en Clásico") : gameName ? tr("Elo en {gameName}", { gameName: gameName }) : tr("Tu elo")}</span>
        {rank ? <RankProgress change={rank} /> : <EloProgress change={only} gameName={gameName} />}
      </div>
      {limited ? (
        <p className="tv-ratingbox-limit">
          <Icon name="info" size={16} strokeWidth={2.6} />
          {tr("Ya jugaron muchas veces entre ustedes en las últimas 24 horas: esta partida no cuenta.")}
        </p>
      ) : (
        rank && games.length > 0 && <GameChips games={games} />
      )}
    </section>
  );
}
