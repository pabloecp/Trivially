import { useState } from "react";
import { useFriends } from "../../lib/friends.jsx";
import GuestFriends from "./GuestFriends.jsx";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import "../../styles/friends.css";

import { translate as tr } from "../../lib/i18n.js";
// "Amigos" for someone playing without an account: the same window as FriendsSheet's (Modal), but with an image
// (public/amigos.png; while it isn't there, the friends icon), what an account gives them and the two ways to get one.
export default function FriendsGuestSheet() {
  const f = useFriends();
  const [noImage, setNoImage] = useState(false);
  return (
    <Modal open={f.open} onClose={() => f.setOpen(false)} title={tr("Amigos")} size="md" className="tv-friends">
      <div className="tv-fr-guest">
        <div className="tv-fr-guest-art">
          {noImage ? <Icon name="users" size={56} strokeWidth={2} /> : <img src="/amigos.png" alt="" onError={() => setNoImage(true)} />}
        </div>
        <GuestFriends onNavigate={() => f.setOpen(false)} />
      </div>
    </Modal>
  );
}
