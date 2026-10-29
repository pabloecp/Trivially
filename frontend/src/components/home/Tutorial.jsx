import { useEffect, useRef, useState } from "react";

const SLIDE_MS = 4500;

// The little tutorial on a game's card: its steps (`slides`: `{ text, image }`) side by side, each an image with its
// text under it, sliding to the next one every few seconds, and a dot for each step under them, the one being shown lit
// (they jump to a step too). `image` null is an empty frame, until the pictures are made. It stops while the pointer or
// the keyboard is on it, and with reduced motion it only moves when a dot is tapped.
// `at` is the strip's place: one past the last step is the first again (a copy), so it keeps sliding the same way and
// the jump back goes unseen.
export default function Tutorial({ slides, name }) {
  const count = slides.length;
  const [at, setAt] = useState(0);
  const [jumping, setJumping] = useState(false);
  const [held, setHeld] = useState(false);
  const track = useRef(null);
  const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shown = at % count;

  useEffect(() => {
    if (held || calm || at >= count) return;
    const id = setTimeout(() => setAt(at + 1), SLIDE_MS);
    return () => clearTimeout(id);
  }, [at, held, calm, count]);

  // Back to the first step with no sliding: its place is settled (the read makes the browser apply it) before the
  // strip is allowed to slide again.
  useEffect(() => {
    if (!jumping) return;
    track.current?.getBoundingClientRect();
    setJumping(false);
  }, [jumping]);

  const back = () => {
    setJumping(true);
    setAt(0);
  };

  // On the copy of the first step, back to the first when the slide ends (or a little after it should have, if the
  // end never comes: a tab in the background doesn't run its transitions).
  useEffect(() => {
    if (at < count) return;
    const id = setTimeout(back, 1000);
    return () => clearTimeout(id);
  }, [at, count]);

  function onEnd(e) {
    if (e.target === e.currentTarget && at >= count) back();
  }

  return (
    <div
      className="tv-tut"
      role="group"
      aria-roledescription="carrusel"
      aria-label={`Cómo se juega ${name}`}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="tv-tut-view">
        <div
          ref={track}
          className={`tv-tut-track${jumping || calm ? " is-still" : ""}`}
          style={{ transform: `translateX(-${at * 100}%)` }}
          onTransitionEnd={onEnd}
          aria-live={held ? "polite" : "off"}
        >
          {[...slides, slides[0]].map((slide, i) => (
            <figure key={i} className="tv-tut-slide" aria-hidden={i % count !== shown || i === count}>
              <div className="tv-tut-img">{slide.image && <img src={slide.image} alt="" draggable="false" />}</div>
              <figcaption className="tv-tut-text">{slide.text}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="tv-tut-dots">
        {slides.map((slide, i) => (
          <button
            key={i}
            type="button"
            className={`tv-tut-dot${i === shown ? " is-on" : ""}`}
            aria-label={`Paso ${i + 1} de ${count}`}
            aria-current={i === shown ? "step" : undefined}
            onClick={() => {
              setJumping(false);
              setAt(i);
            }}
          />
        ))}
      </div>
    </div>
  );
}
