import { useId } from "react";
import { blobShade } from "../../lib/blobColors.js";
import { useBlobStyle } from "../../lib/ownerView.js";

const BODY = "M50 9 C80 9 96 28 96 52 C96 77 79 91 50 91 C21 91 4 77 4 52 C4 28 20 9 50 9 Z";

// Blob, the player's character and everyone's face: a soft round body, a little wider at the top, with a thick black
// line and two black oval eyes. `color` is the body's (lib/blobColors.js, white by default).
// Its skin is drawn in layers, all inside the line: the colour, a shadow inside (the body itself shifted up and to the
// left, cut away: what's left is a crescent low on the right, in the colour's darker tone), a light high on the left
// (the same, the other way) and an empty layer for what may come (shines, reflections). Which layers show is the skin
// (`useBlobStyle`: "sombra" for everyone; "plano" and "luz" only for an owner trying them).
// `mood` moves it (look.css, "The Blob's moods"): "victoria" (a jump now and then, looking up), "derrota" (it sinks a
// little and its eyes look down, to the sides, and half close), "neutral" (only its eyes look left and right now and
// then) or none, still. The neutral ones don't all look at once: each starts at its own moment.
export default function Blob({ className = "", color = "#fff", mood = null }) {
  const style = useBlobStyle();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const shade = style !== "plano";
  const light = style === "luz";
  // Its own moment to look around (0–5.9 s), from its id.
  const delay = mood === "neutral" ? -([...uid].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 60) / 10 : 0;
  return (
    <svg
      className={`tv-blob${mood ? ` is-${mood}` : ""} ${className}`.trim()}
      viewBox="0 0 100 100"
      style={delay ? { "--blob-delay": `${delay}s` } : undefined}
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
      <g className="tv-blob-skin">
        <path d={BODY} fill={color} />
        {shade && <path className="tv-blob-shade" d={BODY} fill={blobShade(color)} mask={`url(#${uid}s)`} />}
        {light && <path className="tv-blob-light" d={BODY} fill="#fff" mask={`url(#${uid}l)`} />}
        <g className="tv-blob-fx" />
      </g>
      <path d={BODY} fill="none" stroke="#0a0b0c" strokeWidth="4.5" strokeLinejoin="round" />
      <g className="tv-blob-eyes">
        <ellipse cx="34" cy="45" rx="5" ry="7.5" fill="#0a0b0c" />
        <ellipse cx="66" cy="45" rx="5" ry="7.5" fill="#0a0b0c" />
      </g>
    </svg>
  );
}
