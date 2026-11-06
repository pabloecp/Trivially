import Icon from "./Icon.jsx";

// "Saltar" in the games where you write the answer (not the owners' "Saltar" of the round, PauseControls): a grey button at the right end of the writing bar, after "Enviar" and as wide. The first tap turns it red and warns
// ("Sin puntos"), the second skips (`confirm` is that first tap, kept by the game). Both labels sit in
// the same place, so the button is always as wide as the longer one and nothing moves when it changes. `hidden` keeps
// its space while it can't be used (Adivina la canción hides it while you type).
export default function AnswerSkip({ confirm = false, onClick, hidden = false }) {
  return (
    <button
      type="button"
      className={`tv-btn tv-btn--sm tv-skipbtn ${confirm ? "tv-btn--bad is-on" : "tv-btn--neutral"}${hidden ? " is-hidden" : ""}`}
      onClick={onClick}
      aria-label={confirm ? "Saltar sin puntos: toca otra vez" : "Saltar"}
      aria-hidden={hidden ? "true" : undefined}
      tabIndex={hidden ? -1 : undefined}
    >
      <span className="tv-skipbtn-label" aria-hidden="true">
        <Icon name="close" size={14} strokeWidth={3} />
        Saltar
      </span>
      <span className="tv-skipbtn-label" aria-hidden="true">
        <Icon name="close" size={14} strokeWidth={3} />
        Sin puntos
      </span>
    </button>
  );
}
