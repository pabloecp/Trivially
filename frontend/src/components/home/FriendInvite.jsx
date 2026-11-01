import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { play } from "../../lib/sounds.js";
import { findMode } from "../../modes/index.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import "../../styles/central.css";

// How long an invitation stays on screen if it isn't answered.
const SHOW_MS = 20000;

/**
 * A friend invited this account to their group (friend:invited, lib/friends.jsx): a card pinned under the top bar, on
 * every screen, "Ana te invita a su sala · Trivia" with "Unirme" (joins with the group's code) and an X. It sounds once
 * and goes away on its own after SHOW_MS. Same look as the central device's requests (CentralRequests.jsx).
 */
export default function FriendInvite({ invite, onJoin, onClose }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!invite) return undefined;
    play("next");
    setBusy(false);
    const t = setTimeout(onClose, SHOW_MS);
    return () => clearTimeout(t);
  }, [invite?.id]);

  if (!invite) return null;
  const mode = findMode(invite.game);

  async function join() {
    setBusy(true);
    try {
      await onJoin(invite);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="tv-central-requests" role="region" aria-label="Invitación de un amigo">
      <div className="tv-central-request" role="group" aria-label={`Invitación de ${invite.fromName}`}>
        <span className="tv-central-request-face">
          <Avatar name={invite.fromName} avatar={invite.fromAvatar} />
        </span>
        <p>
          <strong>{invite.fromName}</strong> te invita a su sala{mode ? ` · ${mode.name}` : ""}
        </p>
        <span className="tv-central-request-actions">
          <button type="button" className="tv-btn tv-btn--sm tv-c-green" onClick={join} disabled={busy} data-sound="none">
            Unirme
          </button>
          <button type="button" className="tv-central-request-no" data-sound="back" onClick={onClose} aria-label="Ignorar la invitación">
            <Icon name="close" size={16} strokeWidth={3} />
          </button>
        </span>
      </div>
    </div>,
    document.body
  );
}
