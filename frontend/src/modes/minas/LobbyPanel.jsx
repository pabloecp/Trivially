import ModeStage from "../../components/home/ModeStage.jsx";
import ModeStart from "../../components/home/ModeStart.jsx";
import SettingsPanel from "../../components/home/SettingsPanel.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../index.js";
import MinesSettings from "./MinesSettings.jsx";
import "../../styles/mines.css";

// Campo de minas' waiting room, inside the room screen on Home: the mode's big card (how it's played, as a race, and
// the start button) and the match settings beside it.
export default function LobbyPanel({ room, onToast }) {
  const { user, updateConfig } = useApp();
  const me = room.players.find((p) => p.id === user?.id);
  const canEdit = room.hostId === user?.id || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));

  const mode = findMode("minas");

  return (
    <>
      <ModeStage room={room} mode={mode}>
        <ModeStart room={room} />
      </ModeStage>

      <SettingsPanel room={room} readOnly={!canEdit}>
        <MinesSettings room={room} updateConfig={updateConfig} onToast={onToast} readOnly={!canEdit}>
        </MinesSettings>
      </SettingsPanel>
    </>
  );
}
