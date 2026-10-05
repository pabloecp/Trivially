// Logo mark: the same art as the favicon and the app icons (public/logo.svg), so there is only one logo.
export function TriviallySymbol({ size = 32, className = "", style = {} }) {
  return (
    <img
      src="/logo.svg"
      alt="Logo de Trivially"
      width={size}
      height={size}
      className={`trivially-symbol ${className}`}
      style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle", ...style }}
    />
  );
}

export function TriviallyLogo({ size = 32, withText = true, className = "", subtitle = "" }) {
  return (
    <div className={`trivially-brand-mark ${className}`} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <TriviallySymbol size={size} />
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
            TRIVI<span style={{ color: "var(--brand, #2f6bff)" }}>ALLY</span>
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

export default TriviallySymbol;
