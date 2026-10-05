import Icon from "./Icon.jsx";

// The question mark drawn as a line, for the options whose logo uses it instead of the letter (home.css).
function QuestionGlyph({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V14" />
      <circle cx="12" cy="18" r="0.75" />
    </svg>
  );
}

// Logo mark: a rounded app-icon tile with a big question mark and a star. Each colour option shows its own version
// of it (home.css, "App icon"): the letter on a coloured tile, the drawn mark on a lime tile, or four coloured
// squares around a dark disc. `small` is the version for the top bar, without the floor shadow.
export default function AppIcon({ small = false }) {
  return (
    <div className={`tv-appicon${small ? " tv-appicon--sm" : ""}`} aria-hidden="true">
      {!small && <span className="tv-appicon-shadow" />}
      <span className="tv-appicon-tile">
        <span className="tv-appicon-shine" />
        <span className="tv-appicon-quads">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span className="tv-appicon-mark">?</span>
        <span className="tv-appicon-disc">
          <QuestionGlyph className="tv-appicon-glyph" />
        </span>
        <span className="tv-appicon-star">
          <Icon name="star" size={20} strokeWidth={2} filled />
        </span>
      </span>
    </div>
  );
}
