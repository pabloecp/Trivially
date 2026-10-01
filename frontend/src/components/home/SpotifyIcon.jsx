// Spotify logo: three sound waves on a green circle (or on `color` when given).
export default function SpotifyIcon({ size = 20, color = "#1DB954", waves = "#000" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill={color} />
      <path
        fill="none"
        stroke={waves}
        strokeLinecap="round"
        d="M6.2 9.1c3.9-1.2 8.3-.8 11.6 1.1M6.8 12.4c3.2-.9 6.8-.6 9.6 1M7.4 15.4c2.6-.7 5.3-.5 7.6.8"
        strokeWidth="1.7"
      />
    </svg>
  );
}
