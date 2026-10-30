// Blob, the player's character and everyone's face: a soft round body, a little wider at the top, white with a thick
// black line, and two black oval eyes. Nothing else (no arms, feet or shine), as in the design. `color` is the body's
// (lib/blobColors.js, white by default).
export default function Blob({ className = "", color = "#fff" }) {
  return (
    <svg className={`tv-blob ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M50 9 C80 9 96 28 96 52 C96 77 79 91 50 91 C21 91 4 77 4 52 C4 28 20 9 50 9 Z"
        fill={color}
        stroke="#0a0b0c"
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
      <ellipse cx="34" cy="45" rx="5" ry="7.5" fill="#0a0b0c" />
      <ellipse cx="66" cy="45" rx="5" ry="7.5" fill="#0a0b0c" />
    </svg>
  );
}
