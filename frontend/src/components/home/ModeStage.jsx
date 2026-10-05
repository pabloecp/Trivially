import { useApp } from "../../lib/store.jsx";
import Icon from "./Icon.jsx";

// The picked game's big card on the room screen, in the game's colour: its icon, name and description, a summary
// of the match (`chips`) and, at the bottom, `children` (the start button, or the guests' waiting line). `extra`
// goes next to the icon. A mode's Lobby panel renders it next to its settings.
export default function ModeStage({ room, mode, chips = [], extra = null, children }) {
  const { user } = useApp();
  const isHost = room.hostId === user?.id;

  return (
    <section className={`tv-mstage tv-c-${mode.color}`} aria-label={mode.name}>
      <div className="tv-mstage-top">
        <span className="tv-mstage-live">
          <span className="tv-mstage-live-dot" aria-hidden="true" />
          {isHost ? "Todos ven lo que eliges" : `Lo elige ${room.hostName || "el anfitrión"}`}
        </span>
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
        {mode.desc && <p className="tv-mstage-desc">{mode.desc}</p>}
      </div>
      <div className="tv-mstage-foot">
        <span className="tv-mono-label">Resumen</span>
        <div className="tv-mstage-chips">
          {chips.map((chip, i) => (
            <span key={chip} className="tv-mstage-chip" style={{ "--i": i }}>
              {chip}
            </span>
          ))}
        </div>
        {children}
      </div>
    </section>
  );
}
