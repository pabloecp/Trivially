// Blue, indigo and purple shades, plus white.
const COLORS = ["#ff2d55", "#ff8a00", "#ffd60a", "#2bd94f", "#0a9bff", "#a63dff"];

// Short one-shot confetti burst (pure CSS; hidden when reduced motion is on).
export default function Confetti({ pieces = 28, className = "" }) {
  return (
    <div className={`tv-confetti${className ? ` ${className}` : ""}`} aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => (
        <span
          key={i}
          style={{
            "--x": `${(i * 37) % 100}%`,
            "--d": `${(i % 7) * 90}ms`,
            "--r": `${(i * 53) % 360}deg`,
            // How far it drifts sideways while it falls (a length: the angle above can't be used for it).
            "--dx": `${((i * 53) % 360) / 12 - 15}px`,
            "--dur": `${1.6 + (i % 5) * 0.25}s`,
            background: COLORS[i % COLORS.length],
          }}
        />
      ))}
    </div>
  );
}
