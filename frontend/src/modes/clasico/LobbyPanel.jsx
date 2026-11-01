import ModeStage from "../../components/home/ModeStage.jsx";
import { findMode } from "../index.js";

// A Clásico's waiting room, inside the room screen on Home: the same card as on Inicio, with how it goes. There is
// nothing to set: it's played like the public one, with the room's players, until someone has won `mode.wins` games
// (RoomManager.startClassic).
export default function LobbyPanel({ room }) {
  return <ModeStage room={room} mode={findMode(room.game)} />;
}
