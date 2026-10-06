import { useId } from "react";

// The question mark, drawn as a line on a 100×100 grid.
const QUESTION = "M37 38a13 13 0 1 1 20 11c-5 3-7 6-7 11v3";

// Logo mark: a dark rounded tile with a frame of five coloured slices around a white question mark. The slices
// take the colour option's --logo-1…5 (palettes.css), so the logo follows the option that is on. `small` is the
// version for the top bar, still and without the floor shadow. `edge` adds the dark edge under the tile, only for
// the big logo on the home screen.
export default function AppIcon({ small = false, edge = false }) {
  const clip = `tv-icon-${useId().replace(/:/g, "")}`;
  return (
    <div className={`tv-appicon${small ? " tv-appicon--sm" : ""}${edge ? " has-edge" : ""}`} aria-hidden="true">
      {!small && <span className="tv-appicon-shadow" />}
      <svg className="tv-appicon-tile" viewBox={edge ? "0 0 100 106" : "0 0 100 100"}>
        <defs>
          <clipPath id={clip}>
            <rect width="100" height="100" rx="24" />
          </clipPath>
        </defs>
        {edge && <rect y="6" width="100" height="100" rx="24" className="tv-appicon-edge" />}
        <g clipPath={`url(#${clip})`}>
          <rect width="100" height="100" className="tv-appicon-bg" />
          <path d="M50 50 L50 -30 L126.1 25.3Z" fill="var(--logo-1)" />
          <path d="M50 50 L126.1 25.3 L97 114.7Z" fill="var(--logo-2)" />
          <path d="M50 50 L97 114.7 L3 114.7Z" fill="var(--logo-3)" />
          <path d="M50 50 L3 114.7 L-26.1 25.3Z" fill="var(--logo-4)" />
          <path d="M50 50 L-26.1 25.3 L50 -30Z" fill="var(--logo-5)" />
          <rect x="12" y="12" width="76" height="76" rx="16" className="tv-appicon-bg" />
        </g>
        <g transform="translate(19 19) scale(0.62)">
          <g transform="translate(0 3)" opacity="0.33">
            <path d={QUESTION} fill="none" stroke="#000" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="77" r="6.2" fill="#000" />
          </g>
          <path d={QUESTION} fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="50" cy="77" r="6.2" fill="#fff" />
        </g>
      </svg>
    </div>
  );
}
