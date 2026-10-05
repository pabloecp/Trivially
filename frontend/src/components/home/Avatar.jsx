// Light backgrounds need a dark letter; the darker ones keep the white one.
function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? "#0A0B0C" : undefined;
}

// Round avatar: the profile photo when there is one, otherwise the initial on the player's color.
export default function Avatar({ name, avatar, className = "" }) {
  const cls = `tv-avatar ${className}`.trim();
  if (avatar?.startsWith("http")) {
    return <img className={cls} src={avatar} alt="" referrerPolicy="no-referrer" />;
  }
  const bg = avatar || "#0A9BFF";
  return (
    <span className={cls} style={{ background: bg, color: inkFor(bg) }}>
      {(name || "U").slice(0, 1).toUpperCase()}
    </span>
  );
}
