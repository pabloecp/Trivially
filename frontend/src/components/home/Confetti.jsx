// Blue, indigo and purple shades, plus white.
const COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#60a5fa", "#ffffff"];

// Short one-shot confetti burst (pure CSS; hidden when reduced motion is on).
export default function Confetti({ pieces = 28 }) {
  return (
    <div className="tv-confetti" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => (
        <span
          key={i}
          style={{
            "--x": `${(i * 37) % 100}%`,
            "--d": `${(i % 7) * 90}ms`,
            "--r": `${(i * 53) % 360}deg`,
            "--dur": `${1.6 + (i % 5) * 0.25}s`,
            background: COLORS[i % COLORS.length],
          }}
        />
      ))}
    </div>
  );
}
