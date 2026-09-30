// Logo mark: the pink app-icon tile with a question mark and a star (same art as public/logo.svg).
export function YoavllySymbol({ size = 32, className = "", style = {} }) {
  return (
    <svg
      role="img"
      aria-label="Logo de Trivially"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`yoavlly-symbol ${className}`}
      style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle", ...style }}
    >
      <defs>
        <linearGradient id="tv-logo-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F46CBD" />
          <stop offset="1" stopColor="#F050AE" />
        </linearGradient>
        <clipPath id="tv-logo-clip">
          <rect x="4" y="2" width="92" height="88" rx="28" />
        </clipPath>
      </defs>
      <rect x="4" y="8" width="92" height="88" rx="28" fill="#C93A90" />
      <rect x="4" y="2" width="92" height="88" rx="28" fill="url(#tv-logo-tile)" />
      <ellipse cx="26" cy="10" rx="36" ry="20" fill="#fff" fillOpacity=".25" transform="rotate(-24 26 10)" clipPath="url(#tv-logo-clip)" />
      <g fontFamily="'Fredoka','Arial Rounded MT Bold','Arial Black',sans-serif" fontWeight="800" fontSize="66" textAnchor="middle">
        <text x="50" y="76" fill="#A02C78">?</text>
        <text x="50" y="72" fill="#fff">?</text>
      </g>
      <g transform="rotate(12 78 22)">
        <rect x="66" y="12" width="24" height="24" rx="8" fill="#C93A90" />
        <rect x="66" y="10" width="24" height="24" rx="8" fill="#F78BCB" />
        <polygon
          points="78,15 79.8,19.6 84.7,19.8 80.9,22.9 82.1,27.7 78,25 73.9,27.7 75.1,22.9 71.3,19.8 76.2,19.6"
          fill="#fff"
          stroke="#fff"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export function YoavllyLogo({ size = 32, withText = true, className = "", subtitle = "" }) {
  return (
    <div className={`yoavlly-brand-mark ${className}`} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <YoavllySymbol size={size} />
      {withText && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span
            style={{
              fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              fontSize: Math.max(16, Math.round(size * 0.72)),
              letterSpacing: "-0.03em",
              color: "var(--text)",
            }}
          >
            YOAV<span style={{ color: "var(--brand, #7B73F6)" }}>LLY</span>
          </span>
          {subtitle && (
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default YoavllySymbol;
