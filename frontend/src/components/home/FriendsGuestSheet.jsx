import { useEffect, useState } from "react";
import { useFriends } from "../../lib/friends.jsx";
import GuestFriends from "./GuestFriends.jsx";
import Icon from "./Icon.jsx";
import "../../styles/friends.css";

// "Amigos" for someone playing without an account: the same panel as FriendsSheet's, but with an image (public/amigos.png;
// while it isn't there, the friends icon), what an account gives them and the two ways to get one.
export default function FriendsGuestSheet() {
  const f = useFriends();
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [noImage, setNoImage] = useState(false);

  useEffect(() => {
    if (f.open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 310);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [f.open]);

  useEffect(() => {
    if (!f.open) return undefined;
    const onKey = (e) => e.key === "Escape" && f.setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [f.open]);

  if (!mounted) return null;
  return (
    <div className="tv-app tv-fr-overlay">
      <div className={`tv-sheet-root ${closing ? "is-closing" : "is-open"}`}>
        <div className="tv-sheet-backdrop" onClick={() => f.setOpen(false)} />
        <div className="tv-sheet-pos">
          <div className="tv-sheet tv-fr-sheet" role="dialog" aria-modal="true" aria-labelledby="tv-fr-guest-title">
            <div className="tv-sheet-head tv-fr-head">
              <h2 id="tv-fr-guest-title" className="tv-sheet-title">
                Amigos
              </h2>
              <button type="button" className="tv-fr-close" onClick={() => f.setOpen(false)} aria-label="Cerrar">
                <Icon name="close" size={20} strokeWidth={3} />
              </button>
            </div>
            <div className="tv-sheet-body tv-fr-guest">
              <div className="tv-fr-guest-art">
                {noImage ? (
                  <Icon name="users" size={56} strokeWidth={2} />
                ) : (
                  <img src="/amigos.png" alt="" onError={() => setNoImage(true)} />
                )}
              </div>
              <GuestFriends onNavigate={() => f.setOpen(false)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
