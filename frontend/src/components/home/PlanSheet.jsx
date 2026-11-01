import { GAME_MODES, findMode, isGameTile } from "../../modes/index.js";
import { AUDIENCES, CLASSIC, isPublicGame } from "../../lib/plan.js";
import AppIcon from "./AppIcon.jsx";
import GameCard from "./GameCard.jsx";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";

// "¿Qué quieren jugar?" ("¿Qué quieres jugar?" alone), from the "Vas a jugar" box: who it's for ("Partida pública": a
// public match of the game, or "Partida privada": yours alone or your group's) and the game, as cards. "Clásico" goes
// first, above "Juego libre" (the games), on both sides: games drawn by the roulette until someone has won two, a
// public match of them or your own. With people from anywhere, Rey de la colina and Farsante are locked (they need
// people who know each other). Picking one closes it. `readOnly` (a player who isn't the leader or the host) only shows
// the choice, `hostName` says who makes it.
export default function PlanSheet({ open, onClose, plan, onAudience, onGame, inGroup = false, readOnly = false, hostName = "" }) {
  const games = GAME_MODES.filter(isGameTile);
  const publicSide = plan.audience === "publica";

  function pick(mode, el) {
    if (readOnly) return;
    if (publicSide && !isPublicGame(mode.id)) {
      el?.animate?.([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }], {
        duration: 280,
        easing: "ease-out",
      });
      return;
    }
    onGame(mode.id);
  }

  return (
    <Modal open={open} onClose={onClose} title={inGroup ? "¿Qué quieren jugar?" : "¿Qué quieres jugar?"} size="lg" className="tv-plan">
      <div className="tv-pills" role="radiogroup" aria-label="Con quién juegan">
        {AUDIENCES.map((a) => (
          <button
            key={a.value}
            type="button"
            role="radio"
            className="tv-pill"
            aria-checked={plan.audience === a.value}
            disabled={readOnly}
            onClick={() => plan.audience !== a.value && onAudience(a.value)}
          >
            <Icon name={a.icon} size={18} strokeWidth={2.6} />
            {a.label}
          </button>
        ))}
      </div>
      {readOnly && (
        <p className="tv-plan-note">
          <Icon name="crown" size={15} strokeWidth={2.4} filled />
          Lo elige {hostName || "el anfitrión"}
        </p>
      )}
      <button
        type="button"
        className={`tv-ccard${plan.game === CLASSIC ? " is-selected" : ""}`}
        aria-pressed={plan.game === CLASSIC}
        disabled={readOnly}
        onClick={(e) => pick(findMode(CLASSIC), e.currentTarget)}
      >
        <span className="tv-ccard-logo" aria-hidden="true">
          <AppIcon small />
        </span>
        <span className="tv-ccard-text">
          <span className="tv-ccard-name">Clásico</span>
          <span className="tv-ccard-sub">Primero en ganar dos juegos</span>
        </span>
      </button>
      <h3 className="tv-section-label">Juego libre</h3>
      <div className="tv-gcard-grid">
        {games.map((mode, i) => (
          <GameCard
            key={mode.id}
            mode={mode}
            index={i}
            selected={plan.game === mode.id}
            locked={publicSide && !isPublicGame(mode.id)}
            lockedText="Partida privada"
            disabled={readOnly}
            onPick={pick}
          />
        ))}
      </div>
    </Modal>
  );
}
