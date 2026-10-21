import AppIcon from "./AppIcon.jsx";
import Icon from "./Icon.jsx";

// The picked game's big card on the room screen, in the game's colour: its icon and name, how it's played (the
// game's three `steps`) and, at the bottom, `children` (the start button, or the guests' waiting line). `extra` goes
// next to the icon. The host's way back to "Elige el juego" is in the top bar (TvTopbar).
// A Clásico (Normal or Extendido) looks like its tile on the menu, like the site's logo: dark with the logo's rainbow
// frame, the logo itself in place of the game's icon, and its name with its length ("3 juegos") at the top.
export default function ModeStage({ mode, extra = null, children }) {
  const classic = mode.kind === "classic";
  return (
    <section className={`tv-mstage ${classic ? "is-classic" : `tv-c-${mode.color}`}`} aria-label={mode.name}>
      {classic ? (
        <span className="tv-mstage-logo" aria-hidden="true">
          <AppIcon small />
        </span>
      ) : (
        <Icon name={mode.icon} size={360} strokeWidth={1.2} className="tv-mstage-watermark" />
      )}
      <div className="tv-mstage-head">
        {!classic && (
          <div className="tv-mstage-badges">
            <span className="tv-mstage-badge">
              <Icon name={mode.icon} size={32} strokeWidth={2.2} />
            </span>
            {extra}
          </div>
        )}
        <h2 className="tv-mstage-name">{mode.name}</h2>
        {classic && <p className="tv-mstage-sub">{mode.subtitle}</p>}
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
