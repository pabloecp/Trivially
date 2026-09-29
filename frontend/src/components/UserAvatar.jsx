import { useState } from "react";

/**
 * Robust UserAvatar component that supports:
 * - Google OAuth profile pictures (with referrerpolicy="no-referrer")
 * - URL images with automatic error fallback to initials
 * - Hex colors / CSS gradients as background
 * - Consistent circular avatar styling
 */
export default function UserAvatar({
  avatar,
  name = "?",
  size = 36,
  style = {},
  className = "",
  title,
}) {
  const [imgError, setImgError] = useState(false);

  const isImageUrl = Boolean(
    avatar &&
    (avatar.startsWith("http://") || avatar.startsWith("https://") || avatar.startsWith("/")) &&
    !imgError
  );

  const initial = (name || "?").slice(0, 1).toUpperCase();
  const fontSize = Math.max(11, Math.round(size * 0.42));

  return (
    <div
      className={`avatar ${className}`}
      title={title || name}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: isImageUrl ? "transparent" : (avatar || "var(--brand)"),
        fontSize,
        fontWeight: 700,
        color: "#ffffff",
        border: "1.5px solid var(--border)",
        flexShrink: 0,
        boxSizing: "border-box",
        position: "relative",
        userSelect: "none",
        ...style,
      }}
    >
      {isImageUrl ? (
        <img
          src={avatar}
          alt={name}
          onError={() => setImgError(true)}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
            display: "block",
          }}
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
