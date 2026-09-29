import Icon from "./Icon.jsx";

// Logo mark: a rounded app-icon tile with a big question mark and a star.
export default function AppIcon() {
  return (
    <div className="tv-appicon" aria-hidden="true">
      <span className="tv-appicon-shadow" />
      <span className="tv-appicon-tile">
        <span className="tv-appicon-shine" />
        <span className="tv-appicon-mark">?</span>
        <span className="tv-appicon-star">
          <Icon name="star" size={20} strokeWidth={2} filled />
        </span>
      </span>
    </div>
  );
}
