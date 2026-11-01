import { useEffect, useId, useRef } from "react";
import { blobShade } from "../../lib/blobColors.js";
import { useBlobStyle, useBlobsStill } from "../../lib/ownerView.js";

// How long a neutral Blob waits between one look around and the next (drawn again every time, for each Blob).
const LOOK_EVERY_MS = [5000, 10000];

const BODY = "M50 9 C80 9 96 28 96 52 C96 77 79 91 50 91 C21 91 4 77 4 52 C4 28 20 9 50 9 Z";

// Blob, the player's character and everyone's face: a soft round body, a little wider at the top, with a thick black
// line and two black oval eyes. `color` is the body's (lib/blobColors.js, white by default).
// Its skin is drawn in layers, all inside the line: the colour, a shadow inside (the body itself shifted up and to the
// left, cut away: what's left is a crescent low on the right, in the colour's darker tone), a light high on the left
// (the same, the other way) and an empty layer for what may come (shines, reflections). Which layers show is the skin
// (`useBlobStyle`: "sombra" for everyone; "plano" and "luz" only for an owner trying them).
// `mood` moves it (look.css, "The Blob's moods"): "victoria" (a jump now and then, looking up), "derrota" (it sinks a
// little and its eyes look down, to the sides, and half close), "neutral" (only its eyes look left and right now and
// then) or none, still. The neutral ones don't all look at once: each looks around at its own random moments, every
// 5 to 10 s, drawn again each time (`LOOK_EVERY_MS`). An owner's "Reducir
// movimiento" (the admin panel, `useBlobsStill`) keeps them all still.
export default function Blob({ className = "", color = "#fff", mood: asked = null, ring = null }) {
  const style = useBlobStyle();
  const mood = useBlobsStill() ? null : asked;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const shade = style !== "plano";
  const light = style === "luz";
  const eyes = useRef(null);
  useEffect(() => {
    if (mood !== "neutral") return undefined;
    let timer = 0;
    const wait = () => {
      const [min, max] = LOOK_EVERY_MS;
      timer = setTimeout(look, min + Math.random() * (max - min));
    };
    function look() {
      // Left then right, or right then left, and back to the middle.
      const side = Math.random() < 0.5 ? -7 : 7;
      eyes.current?.animate(
        [{ transform: "translateX(0)" }, { transform: `translateX(${side}px)`, offset: 0.25 }, { transform: `translateX(${side}px)`, offset: 0.4 }, { transform: `translateX(${-side}px)`, offset: 0.65 }, { transform: `translateX(${-side}px)`, offset: 0.8 }, { transform: "translateX(0)" }],
        { duration: 1600, easing: "ease-in-out" }
      );
      wait();
    }
    wait();
    return () => clearTimeout(timer);
  }, [mood]);
  return (
    <svg
      className={`tv-blob${mood ? ` is-${mood}` : ""}${ring ? " has-ring" : ""} ${className}`.trim()}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      {(shade || light) && (
        <defs>
          {shade && (
            <mask id={`${uid}s`}>
              <rect x="-10" y="-10" width="120" height="120" fill="#fff" />
              <path d={BODY} transform="translate(-7 -9)" fill="#000" />
            </mask>
          )}
          {light && (
            <mask id={`${uid}l`}>
              <rect x="-10" y="-10" width="120" height="120" fill="#fff" />
              <path d={BODY} transform="translate(6 7)" fill="#000" />
            </mask>
          )}
        </defs>
      )}
      {ring && <path d={BODY} fill="none" stroke={ring} strokeWidth="13" strokeLinejoin="round" />}
      <g className="tv-blob-skin">
        <path d={BODY} fill={color} />
        {shade && <path className="tv-blob-shade" d={BODY} fill={blobShade(color)} mask={`url(#${uid}s)`} />}
        {light && <path className="tv-blob-light" d={BODY} fill="#fff" mask={`url(#${uid}l)`} />}
        <g className="tv-blob-fx" />
      </g>
      <path d={BODY} fill="none" stroke="#0a0b0c" strokeWidth="4.5" strokeLinejoin="round" />
      <g ref={eyes} className="tv-blob-eyes">
        <ellipse cx="34" cy="45" rx="5" ry="7.5" fill="#0a0b0c" />
        <ellipse cx="66" cy="45" rx="5" ry="7.5" fill="#0a0b0c" />
      </g>
    </svg>
  );
}
