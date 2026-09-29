export function YoavllySymbol({ size = 32, className = "", style = {} }) {
  return (
    <span
      role="img"
      aria-label="YOAVLLY Logo"
      className={`yoavlly-symbol ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: `${size}px`,
        lineHeight: 1,
        width: `${size}px`,
        height: `${size}px`,
        userSelect: "none",
        flexShrink: 0,
        ...style,
      }}
    >
      😭
    </span>
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

// Backward-compatible aliases
export const YoallySymbol = YoavllySymbol;
export const YoallyLogo = YoavllyLogo;
export const BySongSymbol = YoavllySymbol;
export const BySongLogo = YoavllyLogo;

export default YoavllySymbol;
