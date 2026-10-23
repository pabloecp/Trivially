import { useState } from "react";
import { RANDOM_VOTE } from "../../lib/matchVotes.js";
import { findMode } from "../../modes/index.js";
import Icon from "./Icon.jsx";
import { MATCH_VARIANTS, findVariant } from "./matchInfo.js";

/**
 * "Elegir juegos (opcional)" (Casual and Competitivo, PlayPage): the games a public match can draw, to vote for before
 * searching, folded away until asked for. `votes` is useMatchVotes (lib/matchVotes.js) for the format on screen: as many
 * votes as the match has games, all on "Al azar" until the player picks. Unfolded, a grid of one tile per way of playing a
 * game (its icon in the game's colour, its name and the way); a voted one takes the game's colour and says in which
 * order it was voted (the oldest moves when there's none left). The votes themselves show on the ticket (`VoteTokens`).
 */
export default function VoteBoard({ votes }) {
  const [open, setOpen] = useState(false);
  const { slots, picks, toggle } = votes;
  return (
    <section className={`tv-vote${open ? " is-open" : ""}`}>
      <button type="button" className="tv-vote-toggle" aria-expanded={open} aria-controls="tv-vote-fold" onClick={() => setOpen((o) => !o)}>
        <Icon name="shuffle" size={17} strokeWidth={2.4} />
        Elegir juegos (opcional)
        <Icon name="chevron" size={16} strokeWidth={3} className="tv-vote-chev" />
      </button>
      <div id="tv-vote-fold" className="tv-vote-fold" inert={open ? undefined : ""}>
        <div className="tv-vote-fold-inner">
          <p className="tv-lobby-sub">
            {slots === 1 ? "Elige el juego que quieres jugar" : `Elige hasta ${slots} juegos`}: la ruleta sortea entre los votos de todos. Sin elegir, es al azar.
          </p>
          <div className="tv-vote-grid">
            {MATCH_VARIANTS.map((v) => {
              const mode = findMode(v.game);
              const at = picks.indexOf(v.id);
              return (
                <button key={v.id} type="button" className={`tv-vote-tile tv-c-${mode.color}`} aria-pressed={at > -1} onClick={() => toggle(v.id)}>
                  <span className="tv-vote-tile-icon" aria-hidden="true">
                    <Icon name={mode.icon} size={22} strokeWidth={2.4} />
                  </span>
                  <span className="tv-vote-tile-text">
                    <strong>{mode.name}</strong>
                    <small>{v.way}</small>
                  </span>
                  {at > -1 && (
                    <span className="tv-vote-num" key={at} aria-label={`Voto ${at + 1}`}>
                      {at + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The votes on the ticket: each game's way in its colour, or "Al azar" (dashed) for the votes still free. */
export function VoteTokens({ votes }) {
  return (
    <ul className="tv-vote-tokens" aria-label="Tus votos">
      {votes.votes.map((id, i) => (
        <VoteToken key={`${i}-${id}`} id={id} />
      ))}
    </ul>
  );
}

// One vote: the game's icon and its way, in the game's colour, or "Al azar".
function VoteToken({ id }) {
  if (id === RANDOM_VOTE) {
    return (
      <li className="tv-vote-token is-random">
        <Icon name="shuffle" size={15} strokeWidth={2.6} />
        Al azar
      </li>
    );
  }
  const variant = findVariant(id);
  const mode = findMode(variant.game);
  return (
    <li className={`tv-vote-token tv-c-${mode.color}`} aria-label={`${mode.name} ${variant.way}`}>
      <Icon name={mode.icon} size={15} strokeWidth={2.6} />
      {mode.name} · {variant.way}
    </li>
  );
}
