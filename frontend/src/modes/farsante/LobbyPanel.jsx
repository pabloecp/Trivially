import ModeStage from "../../components/home/ModeStage.jsx";
import SettingsPanel from "../../components/home/SettingsPanel.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../index.js";
import FarsanteSettings from "./FarsanteSettings.jsx";
import "../../styles/farsante.css";

// Farsante's waiting room, inside the room screen on Home: the mode's big card (how it's played and the start button,
// just locked while the match can't start) and the match settings beside it (the tab with the problem has a red dot).
export default function LobbyPanel({ room, onToast }) {
  const { user, updateConfig } = useApp();
  const me = room.players.find((p) => p.id === user?.id);
  const canEdit = room.hostId === user?.id || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));
  const mode = findMode("farsante");

  return (
    <>
      <ModeStage room={room} mode={mode} />

      <SettingsPanel room={room} readOnly={!canEdit}>
        <FarsanteSettings room={room} updateConfig={updateConfig} onToast={onToast} readOnly={!canEdit} />
      </SettingsPanel>
    </>
  );
}
