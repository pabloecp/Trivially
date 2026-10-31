import { useId } from "react";
import { BLOB_GOLD } from "../../lib/blobColors.js";

const BODY = "M50 9 C80 9 96 28 96 52 C96 77 79 91 50 91 C21 91 4 77 4 52 C4 28 20 9 50 9 Z";

// Blob, the player's character and everyone's face: a soft round body, a little wider at the top, white with a thick
// black line, and two black oval eyes. Nothing else (no arms, feet or shine), as in the design. `color` is the body's
// (lib/blobColors.js, white by default). The owners' gold is metal: a gradient like polished gold, a light that sweeps
// across it, a soft aura that breathes and two sparkles (look.css, `.tv-blob.is-gold`; still with reduced motion).
export default function Blob({ className = "", color = "#fff" }) {
  const gold = String(color).toUpperCase() === BLOB_GOLD;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg className={`tv-blob${gold ? " is-gold" : ""} ${className}`.trim()} viewBox="0 0 100 100" aria-hidden="true">
      {gold && (
        <defs>
          <linearGradient id={`${uid}m`} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor="#FFF4B8" />
            <stop offset="0.28" stopColor="#FFD54A" />
            <stop offset="0.55" stopColor="#E3A21A" />
            <stop offset="0.78" stopColor="#A9700E" />
            <stop offset="1" stopColor="#F6C845" />
          </linearGradient>
          <linearGradient id={`${uid}s`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}c`}>
            <path d={BODY} />
          </clipPath>
        </defs>
      )}
      <path d={BODY} fill={gold ? `url(#${uid}m)` : color} />
      {gold && (
        <g clipPath={`url(#${uid}c)`}>
          {/* A soft highlight at the top left, like light on metal, and the light that sweeps across. */}
          <ellipse cx="34" cy="24" rx="20" ry="9" fill="#FFFBE0" opacity="0.55" />
          <g transform="skewX(-20)">
            <rect className="tv-blob-shine" x="-40" y="0" width="26" height="100" fill={`url(#${uid}s)`} />
          </g>
        </g>
      )}
      <path d={BODY} fill="none" stroke="#0a0b0c" strokeWidth="4.5" strokeLinejoin="round" />
      <ellipse cx="34" cy="45" rx="5" ry="7.5" fill="#0a0b0c" />
      <ellipse cx="66" cy="45" rx="5" ry="7.5" fill="#0a0b0c" />
      {gold && (
        <g fill="#FFF8D6">
          <path className="tv-blob-spark" d="M84 8 L86 14 L92 16 L86 18 L84 24 L82 18 L76 16 L82 14 Z" />
          <path className="tv-blob-spark is-late" d="M14 70 L15.4 74.6 L20 76 L15.4 77.4 L14 82 L12.6 77.4 L8 76 L12.6 74.6 Z" />
        </g>
      )}
    </svg>
  );
}
