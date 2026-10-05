// Decoration over the page, behind everything else. Only some colour options show it (home.css, "Page
// decoration"): Lima has a few faint shapes floating, Medianoche a sky of twinkling stars.
const SHAPES = ["circle", "square", "ring", "diamond"];
const STARS = [
  [6, 10, 2, 0], [18, 34, 3, 0.5], [32, 8, 2, 1], [48, 22, 2, 0.2], [63, 12, 3, 0.8], [78, 30, 2, 1.2],
  [90, 9, 3, 0.4], [12, 70, 2, 0.9], [85, 74, 2, 0.1], [55, 88, 3, 1.4], [38, 64, 2, 0.7],
];

export default function PageDecor() {
  return (
    <div className="tv-decor" aria-hidden="true">
      <div className="tv-decor-shapes">
        {SHAPES.map((s) => (
          <span key={s} className={`tv-decor-shape is-${s}`} />
        ))}
      </div>
      <div className="tv-decor-stars">
        {STARS.map(([x, y, size, delay], i) => (
          <span key={i} style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, animationDelay: `${delay}s` }} />
        ))}
      </div>
    </div>
  );
}
