import { RANDOM_VOTE } from "../../lib/matchVotes.js";
import { findMode } from "../../modes/index.js";
import Icon from "./Icon.jsx";
import { MATCH_GAMES, MATCH_VARIANTS, findVariant } from "./matchInfo.js";

/**
 * "Vota los juegos" (Casual and Competitivo, PlayPage): the games a public match can draw, to vote for before searching.
 * `votes` is useMatchVotes (lib/matchVotes.js) for the format on screen: as many votes as the match has games, all on
 * "Al azar" until the player picks. "Tus votos" shows them in order (a game's pill in its colour, "Al azar" dashed);
 * under it a row of cards, "Al azar" and then one per game with its ways of playing, each a button that takes or
 * gives a vote (the oldest moves when there's none left). A game with a vote takes its colour; "Al azar" with any
 * turns black framed in the logo's colours, and says how many it has.
 */
export default function VoteBoard({ votes }) {
  const { slots, picks, random, toggle, toRandom } = votes;
  return (
    <section className="tv-vote" aria-labelledby="tv-vote-title">
      <div className="tv-vote-head">
        <span className="tv-vote-headtext">
          <h2 id="tv-vote-title" className="tv-lobby-title">
            Vota los juegos
          </h2>
          <p className="tv-lobby-sub">
            {slots === 1 ? "Elige el juego que quieres jugar" : `Elige hasta ${slots} juegos`}: la ruleta sortea entre los votos de todos
          </p>
        </span>
        <span className="tv-vote-mine">
          <span className="tv-lobby-label" id="tv-vote-mine">
            {slots === 1 ? "Tu voto" : "Tus votos"}
          </span>
          <ol className="tv-vote-tokens" aria-labelledby="tv-vote-mine">
            {votes.votes.map((id, i) => (
              <VoteToken key={`${i}-${id}`} id={id} />
            ))}
          </ol>
        </span>
      </div>

      <div className="tv-vote-games">
        {/* "Al azar" is one more card among the games, its one button as tall as their two. */}
        <div className="tv-vote-game is-random" role="group" aria-label="Al azar">
          <span className="tv-vote-game-head">
            <span className="tv-vote-game-icon tv-vote-dice" aria-hidden="true">
              <Icon name="shuffle" size={20} strokeWidth={2.4} />
            </span>
            Al azar
          </span>
          <button type="button" className="tv-vote-opt is-random" aria-pressed={random > 0} onClick={toRandom}>
            <span className="tv-vote-text">
              <strong>Cualquiera</strong>
              <small>Uno de los {MATCH_VARIANTS.length} juegos</small>
            </span>
            <span className="tv-vote-check" aria-hidden="true" key={random}>
              {random > 0 && (slots === 1 ? <Icon name="check" size={17} strokeWidth={3.4} /> : `×${random}`)}
            </span>
          </button>
        </div>
        {MATCH_GAMES.map((game) => {
          const mode = findMode(game);
          return (
            <div key={game} className={`tv-vote-game tv-c-${mode.color}`} role="group" aria-label={mode.name}>
              <span className="tv-vote-game-head">
                <span className="tv-vote-game-icon" aria-hidden="true">
                  <Icon name={mode.icon} size={20} strokeWidth={2.4} />
                </span>
                {mode.name}
              </span>
              {MATCH_VARIANTS.filter((v) => v.game === game).map((v) => {
                const on = picks.includes(v.id);
                return (
                  <button key={v.id} type="button" className="tv-vote-opt" aria-pressed={on} onClick={() => toggle(v.id)}>
                    <span className="tv-vote-text">
                      <strong>{v.way}</strong>
                      <small>{v.hint}</small>
                    </span>
                    <span className="tv-vote-check" aria-hidden="true">
                      {on && <Icon name="check" size={17} strokeWidth={3.4} />}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// One vote in "Tus votos": the game's icon and its way, in the game's colour, or "Al azar".
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
      {variant.way}
    </li>
  );
}
