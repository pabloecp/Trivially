import { useEffect, useRef } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import LeaderboardPage from "./pages/LeaderboardPage.jsx";
import Profile from "./pages/Profile.jsx";
import MusicHome from "./modes/music/MusicHome.jsx";
import ModeSelect from "./modes/music/ModeSelect.jsx";
import Join from "./modes/music/Join.jsx";
import Setup from "./modes/music/Setup.jsx";
import Lobby from "./modes/music/Lobby.jsx";
import Game from "./modes/music/Game.jsx";
import { useApp } from "./lib/store.jsx";
import { roomPath } from "./modes/index.js";

// Screens tied to one room, e.g. /lobby/XO4K9M.
const ROOM_SCREEN = /^\/(?:lobby|game|sala)\/([^/]+)/;

function Guard({ children }) {
  const { user } = useApp();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Pages that still use the original navbar layout.
function LegacyShell() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

// Keeps every player on the screen of the game their room is in, which is how the host moves the whole party.
function RoomNavigator() {
  const { room } = useApp();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const target = room ? roomPath(room) : null;
  const lastTarget = useRef(null);

  useEffect(() => {
    const moved = target !== lastTarget.current;
    lastTarget.current = target;
    if (!target || pathname === target) return;

    const screenCode = pathname.match(ROOM_SCREEN)?.[1]?.toUpperCase();
    if (screenCode) {
      // An out-of-date screen of our own room gets swapped for the right one. Another room's link is left to
      // its page, which is busy joining it.
      if (screenCode === room.code) nav(target, { replace: true });
      return;
    }
    // Anywhere else (Home, profile...) follow the room only when it moves into a game.
    if (moved && target !== "/") nav(target);
  }, [target, pathname]);

  return null;
}

export default function App() {
  return (
    <>
      <RoomNavigator />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sala/:code" element={<Home />} />
        <Route element={<LegacyShell />}>
          <Route path="/login" element={<Login />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:userId" element={<Profile />} />

          {/* Modo "Adivina la canción" (the original interface) */}
          <Route path="/musica" element={<MusicHome />} />
          <Route path="/play" element={<ModeSelect />} />
          <Route path="/play/join" element={<Join />} />
          <Route path="/play/setup" element={<Setup />} />
          <Route path="/lobby/:code" element={<Lobby />} />
          <Route path="/game/:code" element={<Game />} />
        </Route>
      </Routes>
    </>
  );
}
