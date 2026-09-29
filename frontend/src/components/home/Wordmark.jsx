// "trivially" with the two i-dots replaced by colored, bouncing dots.
const LETTERS = [
  { ch: "t" },
  { ch: "r" },
  { ch: "ı", dot: "yellow" },
  { ch: "v" },
  { ch: "ı", dot: "pink" },
  { ch: "a" },
  { ch: "l" },
  { ch: "l" },
  { ch: "y" },
];

export default function Wordmark() {
  return (
    <h1 className="tv-wordmark">
      <span className="tv-sr-only">Trivially</span>
      {LETTERS.map(({ ch, dot }, i) => (
        <span key={i} className="tv-letter" style={{ "--i": i }} aria-hidden="true">
          {ch}
          {dot && <span className={`tv-dot tv-dot--${dot}`} />}
        </span>
      ))}
    </h1>
  );
}
