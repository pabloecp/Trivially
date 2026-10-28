import { GAME_MODES, isGameTile } from "../../modes/index.js";
import { AUDIENCES, isPublicGame } from "../../lib/plan.js";
import GameCard from "./GameCard.jsx";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";

// "¿Qué quieren jugar?" ("¿Qué quieres jugar?" alone), from the "Vas a jugar" box: who it's for ("Partida pública": a
// public match of the game, or "Partida privada": yours alone or your group's) and the game, as cards. With people from
// anywhere, Rey de la colina and Farsante are locked (they need people who know each other). In a private match, "Más
// formas de jugar" adds the Clásicos and the playlist (several games in a row). Picking a game closes it. `readOnly` (a
// player who isn't the leader or the host) only shows the choice, `hostName` says who makes it.
export default function PlanSheet({ open, onClose, plan, onAudience, onGame, inGroup = false, readOnly = false, hostName = "" }) {
  const games = GAME_MODES.filter(isGameTile);
  const extras = GAME_MODES.filter((m) => m.kind === "classic" || m.kind === "playlist");
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
      <h3 className="tv-section-label">Elige el juego</h3>
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
      {!publicSide && (
        <>
          <h3 className="tv-section-label">Más formas de jugar</h3>
          <div className="tv-plan-extras">
            {extras.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`tv-plan-extra tv-c-${mode.color}`}
                aria-pressed={plan.game === mode.id}
                disabled={readOnly}
                onClick={() => onGame(mode.id)}
              >
                <span className="tv-plan-extra-icon" aria-hidden="true">
                  <Icon name={mode.icon} size={18} strokeWidth={2.4} />
                </span>
                <span className="tv-plan-extra-text">
                  <strong>{mode.fullName || mode.name}</strong>
                  <small>{mode.kind === "playlist" ? "Varios juegos seguidos" : mode.subtitle}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
