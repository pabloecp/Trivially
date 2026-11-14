import { useEffect, useId, useMemo, useRef, useState } from "react";
import { blobShade } from "../../lib/blobColors.js";
import { isBlobSkin, skinMarkup } from "../../lib/blobSkins.js";
import { useBlobsStill } from "../../lib/ownerView.js";

// How long a neutral Blob waits between one look around and the next (drawn again every time, for each Blob).
const LOOK_EVERY_MS = [5000, 10000];
// Under this width (in px) a skin draws less: its fine details go (lib/blobSkins.js).
const SMALL_PX = 40;

const BODY = "M50 9 C80 9 96 28 96 52 C96 77 79 91 50 91 C21 91 4 77 4 52 C4 28 20 9 50 9 Z";

// A place for a Blob still to come (a free seat in the search for a match, SearchBoard): its shape, dashed, with a "?".
// It takes the colour around it; look.css moves the line and the "?".
export function BlobGhost() {
  return (
    <svg className="tv-blob-ghost" viewBox="0 0 100 100" aria-hidden="true">
      <path className="tv-blob-ghost-line" d={BODY} />
      <text className="tv-blob-ghost-mark" x="50" y="67" textAnchor="middle">
        ?
      </text>
    </svg>
  );
}

// Blob, the player's character and everyone's face: a soft round body, a little wider at the top, with a thick black
// line and two black oval eyes. `color` is the body's (lib/blobColors.js, white by default).
// Its skin is drawn in layers, all inside the line: the colour, a shadow inside (the body itself shifted up and to the
// left, cut away: what's left is a crescent low on the right, in the colour's darker tone), and an empty layer for what
// may come (shines, reflections).
// `color` can also be a skin's id ("oro", "galaxia"…, lib/blobSkins.js): its drawing then takes the place of the colour
// and the shadow, cut to the body, under the line and the eyes. A skin draws less when the Blob is small (under
// SMALL_PX, measured as it changes) and stops moving with the rest when the Blobs are kept still.
// `mood` moves it (look.css, "The Blob's moods"): "victoria" (a jump now and then, looking up), "derrota" (it sinks a
// little and its eyes look down, to the sides, and half close), "neutral" (only its eyes look left and right now and
// then) or none, still. The neutral ones don't all look at once: each looks around at its own random moments, every
// 5 to 10 s, drawn again each time (`LOOK_EVERY_MS`). "Animaciones: Quietos" in Ajustes (`useBlobsStill`) keeps them
// all still.
export default function Blob({ className = "", color = "#fff", mood: asked = null, ring = null }) {
  const still = useBlobsStill();
  const mood = still ? null : asked;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const eyes = useRef(null);
  const svg = useRef(null);
  const skin = isBlobSkin(color);
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const el = svg.current;
    if (!skin || !el) return undefined;
    const check = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setSmall(w < SMALL_PX);
    };
    check();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [skin]);
  const drawn = useMemo(() => (skin ? skinMarkup(color, uid, { small, still }) : null), [skin, color, uid, small, still]);
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
      ref={svg}
      className={`tv-blob${mood ? ` is-${mood}` : ""}${ring ? " has-ring" : ""} ${className}`.trim()}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      {drawn ? (
        <defs>
          <clipPath id={`${uid}c`}>
            <path d={BODY} />
          </clipPath>
          {/* The skin's own gradients, masks and filters (our markup, lib/blobSkins.js). */}
          <g dangerouslySetInnerHTML={{ __html: drawn.defs }} />
        </defs>
      ) : (
        <defs>
          <mask id={`${uid}s`}>
            <rect x="-10" y="-10" width="120" height="120" fill="#fff" />
            <path d={BODY} transform="translate(-7 -9)" fill="#000" />
          </mask>
        </defs>
      )}
      {ring && <path d={BODY} fill="none" stroke={ring} strokeWidth="13" strokeLinejoin="round" />}
      {drawn ? (
        <g className="tv-blob-skin" clipPath={`url(#${uid}c)`} dangerouslySetInnerHTML={{ __html: drawn.layers }} />
      ) : (
        <g className="tv-blob-skin">
          <path d={BODY} fill={color} />
          <path className="tv-blob-shade" d={BODY} fill={blobShade(color)} mask={`url(#${uid}s)`} />
          <g className="tv-blob-fx" />
        </g>
      )}
      <path d={BODY} fill="none" stroke="#0a0b0c" strokeWidth="4.5" strokeLinejoin="round" />
      <g ref={eyes} className="tv-blob-eyes">
        <ellipse cx="34" cy="45" rx="5" ry="7.5" fill="#0a0b0c" />
        <ellipse cx="66" cy="45" rx="5" ry="7.5" fill="#0a0b0c" />
      </g>
    </svg>
  );
}
