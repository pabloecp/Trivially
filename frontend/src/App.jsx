import { useEffect, useLayoutEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Profile from "./pages/Profile.jsx";
import Game from "./modes/music/Game.jsx";
import QuizGame from "./modes/quiz/Game.jsx";
import GeoGame from "./modes/mundo/Game.jsx";
import HistoryGame from "./modes/historia/Game.jsx";
import MinesGame from "./modes/minas/Game.jsx";
import { useApp } from "./lib/store.jsx";
import RoomSounds from "./lib/RoomSounds.jsx";
import VolumeMenu from "./components/home/VolumeMenu.jsx";
import { useRoomExit } from "./components/home/TvTopbar.jsx";
import { roomPath } from "./modes/index.js";

// Screens tied to one room, e.g. /game/XOTRIV.
const ROOM_SCREEN = /^\/(?:lobby|game|quiz|mundo|historia|minas|sala)\/([^/]+)/;

// Old /lobby/CODE links: the waiting room now lives on the room screen, which /sala/CODE opens and joins.
function LobbyRedirect() {
  const { code } = useParams();
  return <Navigate to={`/sala/${code}`} replace />;
}

function Guard({ children }) {
  const { user } = useApp();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Keeps every player on the screen of the game their room is in, which is how the host moves the whole party.
//
// It also makes the browser's Back button work as the "Volver" button while the room waits. The room's screen
// (/sala/CODE) is always pushed on top of Home (/), so Back lands on Home with the room still open: that is read as
// a press of "Volver" (back to the game menu, or "¿Salir de la sala?" and then out), and the room's screen is
// pushed again, so the next Back asks again. Arriving by an invite link has no Home below it, so one is put there.
function RoomNavigator() {
  const { room, kickedNotice } = useApp();
  const nav = useNavigate();
  const navType = useNavigationType();
  const { pathname } = useLocation();
  const { step } = useRoomExit();

  // Taken out of the room by the host: leave its screens (Home shows why).
  useEffect(() => {
    if (kickedNotice && !room) nav("/", { replace: true });
  }, [kickedNotice]);
  const target = room ? roomPath(room) : null;
  const lastTarget = useRef(null);
  const lastPath = useRef(pathname);

  // A layout effect, so a Back that lands on Home is turned around before anything is painted.
  useLayoutEffect(() => {
    const moved = target !== lastTarget.current;
    lastTarget.current = target;
    const pathChanged = pathname !== lastPath.current;
    lastPath.current = pathname;
    if (!target) return;
    const waiting = target.startsWith("/sala/");
    // Opened straight on the room's address: it is the first entry, so Back would leave the app. Put Home under it
    // (the next run pushes the room's screen back on top).
    if (waiting && pathname === target && window.history.state?.idx === 0) {
      nav("/", { replace: true });
      return;
    }
    if (pathname === target) return;

    // The Back button, from the waiting room to Home: it does what "Volver" does.
    if (waiting && pathname === "/" && pathChanged && navType === "POP") {
      if (!step({ fromBack: true })) nav(target);
      return;
    }

    const screenCode = pathname.match(ROOM_SCREEN)?.[1]?.toUpperCase();
    if (screenCode) {
      // An out-of-date screen of our own room gets swapped for the right one. Another room's link is left to
      // its page, which is busy joining it.
      if (screenCode === room.code) nav(target, { replace: true });
      return;
    }
    // On Home the address becomes the room's own (/sala/CODE) as soon as you create or join one, pushed on top of
    // Home so that Back has somewhere to go. Other pages (profile...) are only left when a match starts.
    if (pathname === "/") nav(target, { replace: pathChanged && navType === "POP" });
    else if (moved && !waiting) nav(target);
  }, [target, pathname]);

  return null;
}

export default function App() {
  return (
    <>
      <RoomNavigator />
      <RoomSounds />
      {/* The volume where no bar shows it (a Geografía match on a phone). */}
      <VolumeMenu floating />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sala/:code" element={<Home />} />
        <Route path="/lobby/:code" element={<LobbyRedirect />} />
        <Route path="/game/:code" element={<Game />} />
        <Route path="/quiz/:code" element={<QuizGame />} />
        <Route path="/mundo/:code" element={<GeoGame />} />
        <Route path="/historia/:code" element={<HistoryGame />} />
        <Route path="/minas/:code" element={<MinesGame />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:userId" element={<Profile />} />
        {/* The old /play screens are gone: everything starts from Home. */}
        <Route path="/play/*" element={<Navigate to="/" replace />} />
        <Route path="/musica" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<Login />} />
        {/* The leaderboard is hidden for now; its page is still in pages/LeaderboardPage.jsx. */}
        <Route path="/leaderboard" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
