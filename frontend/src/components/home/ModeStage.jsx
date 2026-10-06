import { useState } from "react";
import { useApp } from "../../lib/store.jsx";
import Icon from "./Icon.jsx";

// The picked game's big card on the room screen, in the game's colour: its icon and name, how it's played (the
// mode's three `steps`) and, at the bottom, `children` (the start button, or the guests' waiting line). `extra` goes
// next to the icon. The host's back button takes the whole room back to "Elige el modo de juego".
export default function ModeStage({ room, mode, extra = null, children }) {
  const { user, setGame } = useApp();
  const isHost = room.hostId === user?.id;
  const [backErr, setBackErr] = useState("");

  return (
    <section className={`tv-mstage tv-c-${mode.color}`} aria-label={mode.name}>
      <div className="tv-mstage-top">
        {isHost && (
          <button
            type="button"
            className="tv-mstage-pill"
            onClick={() => setGame(null).catch((e) => setBackErr(e.message || "No se pudo volver a elegir modo de juego"))}
          >
            <Icon name="back" size={18} strokeWidth={2.6} />
            Otro modo de juego
          </button>
        )}
      </div>
      <Icon name={mode.icon} size={360} strokeWidth={1.2} className="tv-mstage-watermark" />
      <div className="tv-mstage-head">
        <div className="tv-mstage-badges">
          <span className="tv-mstage-badge">
            <Icon name={mode.icon} size={32} strokeWidth={2.2} />
          </span>
          {extra}
        </div>
        <h2 className="tv-mstage-name">{mode.name}</h2>
      </div>
      <div className="tv-mstage-foot">
        <ol className="tv-mstage-steps" aria-label="Cómo se juega">
          {(mode.steps || []).map((step, i) => (
            <li key={step.text} className="tv-mstage-step" style={{ "--i": i }}>
              <span className="tv-mstage-step-icon">
                <Icon name={step.icon} size={20} strokeWidth={2.4} />
              </span>
              {step.text}
            </li>
          ))}
        </ol>
        {backErr && <p className="tv-lobby-error">{backErr}</p>}
        {children}
      </div>
    </section>
  );
}
