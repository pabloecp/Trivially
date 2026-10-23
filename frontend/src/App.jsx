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
import RainGame from "./modes/lluvia/Game.jsx";
import ReyGame from "./modes/rey/Game.jsx";
import FarsanteGame from "./modes/farsante/Game.jsx";
import PlaylistResults from "./modes/playlist/Results.jsx";
import { useApp } from "./lib/store.jsx";
import RoomSounds from "./lib/RoomSounds.jsx";
import VolumeMenu from "./components/home/VolumeMenu.jsx";
import CentralOffer from "./components/home/CentralOffer.jsx";
import CentralRequests from "./components/home/CentralRequests.jsx";
import StillThere from "./components/home/StillThere.jsx";
import { useRoomExit } from "./components/home/TvTopbar.jsx";
import { isInlineMatch, roomPath } from "./modes/index.js";
import { HIDDEN_SLUG, useHiddenCode } from "./lib/hiddenCode.js";

// Screens tied to one room, e.g. /game/XOTRIV.
const ROOM_SCREEN = /^\/(?:lobby|game|quiz|mundo|historia|minas|lluvia|rey|farsante|playlist|sala)\/([^/]+)/;

// Old /lobby/CODE links: the waiting room now lives on the room screen, which /sala/CODE opens and joins.
function LobbyRedirect() {
  const { code } = useParams();
  return <Navigate to={`/sala/${code}`} replace />;
}

const GAME_SCREENS = {
  opciones: QuizGame,
  musica: Game,
  mundo: GeoGame,
  historia: HistoryGame,
  minas: MinesGame,
  lluvia: RainGame,
  rey: ReyGame,
  farsante: FarsanteGame,
};

// The room's address: Home (the room screen) while it waits or spins its roulette, and, in a public match or a Clásico,
// the game being played, on the same address. Inicio, /jugar and the room all use it, so Home stays mounted
// between them (its seam animations depend on it).
function RoomScreen() {
  const { room } = useApp();
  const Screen = isInlineMatch(room) && room.phase !== "lobby" && room.phase !== "intro" ? GAME_SCREENS[room.game] : null;
  return Screen ? <Screen /> : <Home />;
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
// a press of "Volver" (back to the game menu, or the modal "¿Seguro que quieres salir?"), and the room's screen is
// pushed again, so the next Back asks again. Arriving by an invite link has no Home below it, so one is put there.
function RoomNavigator() {
  const { room, kickedNotice } = useApp();
  const nav = useNavigate();
  const navType = useNavigationType();
  const { pathname } = useLocation();
  const { step } = useRoomExit();
  // Hiding or showing the code changes the room's addresses (lib/hiddenCode.js): the screen moves to the new one.
  const [codeHidden] = useHiddenCode();

  // Every game: as a match starts and each round counts down, the page goes back to the top, so on a phone (where the
  // scoreboard is under the game, and the settings left the page scrolled down) the question and the clock show.
  const counting = room?.phase === "countdown";
  useEffect(() => {
    if (counting && window.scrollY > 4) window.scrollTo({ top: 0 });
  }, [counting, room?.currentRound, pathname]);

  // Taken out of the room by the host: leave its screens (Home shows why).
  useEffect(() => {
    if (kickedNotice && !room) nav("/", { replace: true });
  }, [kickedNotice]);
  const target = room ? roomPath(room, codeHidden) : null;
  const lastTarget = useRef(null);
  const lastPath = useRef(pathname);
  const lastPhase = useRef(null);

  // A public match's intro (roulette and tutorial) and its games share the room's address, but each is a screen that
  // mounts anew (RoomScreen). The room's column stays as it is (its entrance is cut, `html.tv-seamless-side`) and only
  // the left side changes: the game's screen fades in over the intro (`html.tv-seamless`, which also cuts what's
  // inside it from flying in on its own).
  useLayoutEffect(() => {
    const phase = room?.phase ?? null;
    const before = lastPhase.current;
    lastPhase.current = phase;
    if (!room?.matchmaking && !room?.run?.classic) return;
    const cls = before === "intro" && phase !== "intro" ? "tv-seamless" : phase === "intro" && before !== "intro" ? "tv-seamless-side" : null;
    if (!cls) return;
    const root = document.documentElement;
    root.classList.add(cls);
    setTimeout(() => root.classList.remove(cls), 1400);
  }, [room?.phase]);

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
      if (screenCode === room.code || screenCode === HIDDEN_SLUG.toUpperCase()) nav(target, { replace: true });
      return;
    }
    // From "¿Cómo quieres jugar?" (/jugar...) the room's address takes its place. The browser's Back landing there from
    // the waiting room does what "Volver" does (out of the room, after asking, back to that option).
    if (pathname.startsWith("/jugar")) {
      if (waiting && pathChanged && navType === "POP") {
        if (!step({ fromBack: true })) nav(target);
        return;
      }
      nav(target, { replace: true });
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
      {/* Opening a room this account already plays in from another device: it can be the room's central device. */}
      <CentralOffer />
      {/* The host, on every screen: players asking to use another device of theirs as the central one. */}
      <CentralRequests />
      {/* A public match asks an idle player if they are still there. */}
      <StillThere />
      <Routes>
        <Route path="/" element={<RoomScreen />} />
        <Route path="/sala/:code" element={<RoomScreen />} />
        {/* Inicio is "¿Cómo quieres jugar?" (Pública and Privada: components/home/PlayPage.jsx); each option has its address
            (Pública's two tabs, /jugar/casual and /jugar/competitivo, and /jugar/privada). */}
        <Route path="/jugar" element={<Navigate to="/" replace />} />
        <Route path="/jugar/:option" element={<RoomScreen />} />
        <Route path="/lobby/:code" element={<LobbyRedirect />} />
        <Route path="/game/:code" element={<Game />} />
        <Route path="/quiz/:code" element={<QuizGame />} />
        <Route path="/mundo/:code" element={<GeoGame />} />
        <Route path="/historia/:code" element={<HistoryGame />} />
        <Route path="/minas/:code" element={<MinesGame />} />
        <Route path="/lluvia/:code" element={<RainGame />} />
        <Route path="/rey/:code" element={<ReyGame />} />
        <Route path="/farsante/:code" element={<FarsanteGame />} />
        {/* The end of a playlist: who won the most games. Its games are played on their own screens. */}
        <Route path="/playlist/:code" element={<PlaylistResults />} />
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
