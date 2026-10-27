import Icon from "./Icon.jsx";

// A game's card in "¿Qué quieren jugar?": filled with the game's colour and its darker edge under it (it's tapped), its
// icon on a white square in the top left, its name big and its tagline under it, and the icon again, huge and faint, cut
// by the bottom right corner. The chosen one has a white ring. `locked` (Rey de la colina or Farsante with "Gente de
// todas partes") greys it and says why instead of the tagline.
export default function GameCard({ mode, selected = false, locked = false, lockedText = "", disabled = false, onPick, index = 0 }) {
  return (
    <button
      type="button"
      className={`tv-gcard tv-c-${mode.color}${selected ? " is-selected" : ""}${locked ? " is-locked" : ""}`}
      aria-pressed={selected}
      aria-disabled={locked || undefined}
      disabled={disabled}
      style={{ "--i": index }}
      onClick={(e) => onPick?.(mode, e.currentTarget)}
    >
      <Icon name={mode.icon} size={132} strokeWidth={1.6} className="tv-gcard-mark" />
      <span className="tv-gcard-badge" aria-hidden="true">
        <Icon name={locked ? "lock" : mode.icon} size={22} strokeWidth={2.4} />
      </span>
      <span className="tv-gcard-text">
        <span className="tv-gcard-name">{mode.name}</span>
        <span className="tv-gcard-sub">{locked ? lockedText : mode.tagline || mode.subtitle}</span>
      </span>
    </button>
  );
}
