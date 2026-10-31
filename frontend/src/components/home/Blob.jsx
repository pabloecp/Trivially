import { useId } from "react";
import { BLOB_GOLD } from "../../lib/blobColors.js";

const BODY = "M50 9 C80 9 96 28 96 52 C96 77 79 91 50 91 C21 91 4 77 4 52 C4 28 20 9 50 9 Z";

// Blob, the player's character and everyone's face: a soft round body, a little wider at the top, white with a thick
// black line, and two black oval eyes. Nothing else (no arms, feet or shine), as in the design. `color` is the body's
// (lib/blobColors.js, white by default). The owners' gold is metal: a gradient like polished gold and, inside the body
// only, a line of light that crosses it every 5 s (look.css, `.tv-blob-shine`; still with reduced motion).
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
            <stop offset="0" stopColor="#FFFBE6" stopOpacity="0" />
            <stop offset="0.35" stopColor="#FFFBE6" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="0.65" stopColor="#FFFBE6" stopOpacity="0.55" />
            <stop offset="1" stopColor="#FFFBE6" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}c`}>
            <path d={BODY} />
          </clipPath>
        </defs>
      )}
      <path d={BODY} fill={gold ? `url(#${uid}m)` : color} />
      {gold && (
        <g clipPath={`url(#${uid}c)`}>
          {/* A soft highlight at the top left, like light on metal, and the line of light that crosses it. */}
          <ellipse cx="34" cy="24" rx="20" ry="9" fill="#FFFBE0" opacity="0.55" />
          <g transform="skewX(-20)">
            <rect className="tv-blob-shine" x="-30" y="-10" width="16" height="120" fill={`url(#${uid}s)`} />
          </g>
        </g>
      )}
      <path d={BODY} fill="none" stroke="#0a0b0c" strokeWidth="4.5" strokeLinejoin="round" />
      <ellipse cx="34" cy="45" rx="5" ry="7.5" fill="#0a0b0c" />
      <ellipse cx="66" cy="45" rx="5" ry="7.5" fill="#0a0b0c" />
    </svg>
  );
}
