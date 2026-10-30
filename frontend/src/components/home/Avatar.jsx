import Blob from "./Blob.jsx";

// A player's face: there are no profile photos, everyone is a Blob (white with a black line). `name` and `avatar` are
// kept so callers don't change; the name is only for screen readers, which the rows already read beside it.
export default function Avatar({ className = "" }) {
  return (
    <span className={`tv-avatar tv-avatar--blob ${className}`.trim()} aria-hidden="true">
      <Blob />
    </span>
  );
}
