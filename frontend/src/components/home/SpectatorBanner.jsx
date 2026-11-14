import Icon from "./Icon.jsx";

import { translate as tr } from "../../lib/i18n.js";
// Shown to someone who joined while a match was already running: they watch it, and play from the next one.
export default function SpectatorBanner() {
  return (
    <p className="tv-spectator" role="status">
      <Icon name="info" size={18} strokeWidth={2.6} />
      <span>
        <strong>{tr("Estás viendo la partida.")}</strong> {tr("Entrarás a jugar cuando termine.")}
      </span>
    </p>
  );
}
