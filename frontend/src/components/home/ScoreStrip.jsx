import Icon from "./Icon.jsx";

// The scoreboard of a match as one strip of chips (position, name, score, and this round's points at the reveal), for
// screens where the room's column (PartyPanel) doesn't fit. Styles in home.css (.tv-scores); each game hides it from
// the width where its column shows, through `className`.
export default function ScoreStrip({ players, meId, phase, className = "" }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  return (
    <ol className={`tv-scores ${className}`.trim()} aria-label="Marcador">
      {ranked.map((p, i) => (
        <li key={p.id} className={`${p.id === meId ? "is-me" : ""}${p.connected === false ? " is-away" : ""}`}>
          <span className="tv-scores-pos">{i + 1}</span>
          <span className="tv-scores-name">{p.id === meId ? "Tú" : p.name}</span>
          <strong key={p.score}>{p.score}</strong>
          {phase === "reveal" && p.lastPoints > 0 && <em>+{p.lastPoints}</em>}
          {phase === "playing" && p.answered && <Icon name="check" size={13} strokeWidth={3.2} />}
        </li>
      ))}
    </ol>
  );
}
