import Blob from "./Blob.jsx";
import { blobColor } from "../../lib/blobColors.js";

// A player's face: there are no profile photos, everyone is a Blob with a black line, in the colour of their `avatar`
// (lib/blobColors.js; white when it isn't one of the Blob's). `name` is only for screen readers, which the rows already
// read beside it. `mood` moves the Blob (Blob.jsx): only where it's asked for (the podium, the scoreboards, a group's
// list, the big one beside your elo); faces on buttons and in stacks stay still.
export default function Avatar({ className = "", avatar = null, mood = null }) {
  return (
    <span className={`tv-avatar tv-avatar--blob ${className}`.trim()} aria-hidden="true">
      <Blob color={blobColor(avatar)} mood={mood} />
    </span>
  );
}
