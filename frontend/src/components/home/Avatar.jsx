// Round avatar: the profile photo when there is one, otherwise the initial on the player's color.
export default function Avatar({ name, avatar, className = "" }) {
  const cls = `tv-avatar ${className}`.trim();
  if (avatar?.startsWith("http")) {
    return <img className={cls} src={avatar} alt="" referrerPolicy="no-referrer" />;
  }
  return (
    <span className={cls} style={{ background: avatar || "#F050AE" }}>
      {(name || "U").slice(0, 1).toUpperCase()}
    </span>
  );
}
