import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Profile from "./pages/Profile.jsx";
import Game from "./modes/music/Game.jsx";
import { useApp } from "./lib/store.jsx";
import { roomPath } from "./modes/index.js";

// Screens tied to one room, e.g. /game/XOYOAV.
const ROOM_SCREEN = /^\/(?:lobby|game|sala)\/([^/]+)/;

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
    // On Home the address becomes the room's own (/sala/CODE) as soon as you create or join one. Other pages
    // (profile...) are only left when a match starts.
    if (pathname === "/") nav(target, { replace: true });
    else if (moved && !target.startsWith("/sala/")) nav(target);
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
        <Route path="/lobby/:code" element={<LobbyRedirect />} />
        <Route path="/game/:code" element={<Game />} />
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
