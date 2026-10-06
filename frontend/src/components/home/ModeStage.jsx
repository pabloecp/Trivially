import Icon from "./Icon.jsx";

// The picked game's big card on the room screen, in the game's colour: its icon and name, how it's played (the
// mode's three `steps`) and, at the bottom, `children` (the start button, or the guests' waiting line). `extra` goes
// next to the icon. The host's way back to "Elige el modo de juego" is in the top bar (TvTopbar).
export default function ModeStage({ mode, extra = null, children }) {
  return (
    <section className={`tv-mstage tv-c-${mode.color}`} aria-label={mode.name}>
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
        {children}
      </div>
    </section>
  );
}
