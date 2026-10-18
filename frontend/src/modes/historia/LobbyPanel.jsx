import ModeStage from "../../components/home/ModeStage.jsx";
import ModeStart from "../../components/home/ModeStart.jsx";
import SettingsPanel from "../../components/home/SettingsPanel.jsx";
import { useApp } from "../../lib/store.jsx";
import { findMode } from "../index.js";
import HistorySettings from "./HistorySettings.jsx";
import "../../styles/history.css";

// Rango's waiting room, inside the room screen on Home: the game's big card (how it's played and the start button) and
// the match settings beside it.
export default function LobbyPanel({ room, onToast }) {
  const { user, updateConfig } = useApp();
  const me = room.players.find((p) => p.id === user?.id);
  const canEdit = room.hostId === user?.id || Boolean(me?.canEditConfig) || Boolean(room.coHosts?.includes(user?.id));

  const mode = findMode("historia");
  // A list with nothing ticked: what to tick.

  return (
    <>
      <ModeStage room={room} mode={mode}>
        <ModeStart room={room} />
      </ModeStage>

      <SettingsPanel room={room} readOnly={!canEdit}>
        <HistorySettings room={room} updateConfig={updateConfig} onToast={onToast} readOnly={!canEdit}>
        </HistorySettings>
      </SettingsPanel>
    </>
  );
}
