import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import { NotFound } from "./pages/ErrorPages.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import { useApp } from "./lib/store.jsx";
import RoomSounds from "./lib/RoomSounds.jsx";
import CentralOffer from "./components/home/CentralOffer.jsx";
import CentralRequests from "./components/home/CentralRequests.jsx";
import StillThere from "./components/home/StillThere.jsx";
import { isInlineMatch, roomPath } from "./modes/index.js";
import { HIDDEN_SLUG, useHiddenCode } from "./lib/hiddenCode.js";

// Each game's screen, and the pages few people open, are downloaded only when needed: Inicio and "Entra a Trivially"
// come in the first download, a game when its match starts (preloaded as soon as the room is on that game, see
// RoomScreen), so the first visit doesn't carry the eight games.
const GAME_LOADERS = {
  opciones: () => import("./modes/quiz/Game.jsx"),
  musica: () => import("./modes/music/Game.jsx"),
  mundo: () => import("./modes/mundo/Game.jsx"),
  historia: () => import("./modes/historia/Game.jsx"),
  minas: () => import("./modes/minas/Game.jsx"),
  lluvia: () => import("./modes/lluvia/Game.jsx"),
  rey: () => import("./modes/rey/Game.jsx"),
  farsante: () => import("./modes/farsante/Game.jsx"),
};
const QuizGame = lazy(GAME_LOADERS.opciones);
const Game = lazy(GAME_LOADERS.musica);
const GeoGame = lazy(GAME_LOADERS.mundo);
const HistoryGame = lazy(GAME_LOADERS.historia);
const MinesGame = lazy(GAME_LOADERS.minas);
const RainGame = lazy(GAME_LOADERS.lluvia);
const ReyGame = lazy(GAME_LOADERS.rey);
const FarsanteGame = lazy(GAME_LOADERS.farsante);
const PlaylistResults = lazy(() => import("./modes/playlist/Results.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.jsx"));
const Terms = lazy(() => import("./pages/Legal.jsx").then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import("./pages/Legal.jsx").then((m) => ({ default: m.Privacy })));

// The tab's title for each page, always "<página> - Trivially"; Inicio's is just "Trivially".
const HOME_TITLE = "Trivially";
const PAGE_TITLES = [
  [/^\/login/, "Entrar"],
  [/^\/restablecer/, "Cambiar contraseña"],
  [/^\/terminos/, "Términos de uso"],
  [/^\/privacidad/, "Aviso de privacidad"],
  [/^\/profile/, "Perfil"],
  [/^\/playlist\//, "Resultados"],
  [/^\/(?:game|quiz|mundo|historia|minas|lluvia|rey|farsante|partida)\//, "Partida"],
];
const KNOWN_PAGE = /^\/(?:$|grupo\/|sala\/|jugar|lobby\/)/;

function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const match = PAGE_TITLES.find(([re]) => re.test(pathname));
    document.title = match ? `${match[1]} - Trivially` : KNOWN_PAGE.test(pathname) ? HOME_TITLE : "Página no encontrada - Trivially";
  }, [pathname]);
  return null;
}

// While a screen downloads (a moment, once): the page's own background, nothing that jumps.
function ScreenWait() {
  return <div className="tv-app" aria-busy="true" />;
}

// Screens tied to one room, e.g. /game/XOTRIV.
const ROOM_SCREEN = /^\/(?:lobby|game|quiz|mundo|historia|minas|lluvia|rey|farsante|playlist|partida)\/([^/]+)/;

// Old /lobby/CODE links: the waiting room now lives on the room screen, which /partida/CODE opens and joins.
function LobbyRedirect() {
  const { code } = useParams();
  return <Navigate to={`/partida/${code}`} replace />;
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
  // The room's game is downloaded as soon as the room is on it, so the match doesn't wait for it when it starts.
  useEffect(() => {
    GAME_LOADERS[room?.game]?.().catch(() => {});
  }, [room?.game]);
  const Screen = isInlineMatch(room) && room.phase !== "lobby" && room.phase !== "intro" ? GAME_SCREENS[room.game] : null;
  return Screen ? <Screen /> : <Home />;
}

function Guard({ children }) {
  const { user } = useApp();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Keeps every player on the screen of the game their room is in, which is how the host moves the whole party. While
// the room waits that's Inicio (/, `roomPath`); a match's screens are pushed on top of it, and the browser's Back
// from one lands on Inicio and is turned around (the match's "X" is the way out). Inicio is "/" with a group or
// without one: the group's code is never in the address.
function RoomNavigator() {
  const { room, kickedNotice } = useApp();
  const nav = useNavigate();
  const navType = useNavigationType();
  const { pathname } = useLocation();
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

  // Out of the room by the server (the group's leader took it back to Inicio): off its screens, so their address
  // doesn't join it again.
  const hadRoom = useRef(Boolean(room));
  useEffect(() => {
    const had = hadRoom.current;
    hadRoom.current = Boolean(room);
    if (had && !room && ROOM_SCREEN.test(pathname)) nav("/", { replace: true });
  }, [room?.code]);
  const target = room ? roomPath(room, codeHidden) : null;
  const lastTarget = useRef(null);
  const lastPath = useRef(pathname);
  const lastPhase = useRef(null);

  // A match's intro (MatchIntro) and its games share the room's address. On a computer a round's panels have
  // their own entrance; on a phone they don't, so the round fades in over the intro (`html.tv-seamless`, look.css).
  useLayoutEffect(() => {
    const phase = room?.phase ?? null;
    const before = lastPhase.current;
    lastPhase.current = phase;
    if (before !== "intro" || phase === "intro") return;
    const root = document.documentElement;
    root.classList.add("tv-seamless");
    setTimeout(() => root.classList.remove("tv-seamless"), 400);
  }, [room?.phase]);

  // A layout effect, so a Back that lands on Home is turned around before anything is painted.
  useLayoutEffect(() => {
    const moved = target !== lastTarget.current;
    lastTarget.current = target;
    const pathChanged = pathname !== lastPath.current;
    lastPath.current = pathname;
    if (!target) return;
    // On Inicio (waiting) or on the room's own address (a public match, a Clásico): neither takes you off another page.
    const roomScreen = target.startsWith("/partida/");
    const waiting = target === "/" || roomScreen;
    // Opened straight on the room's address (a reload): it is the first entry, so Back would leave the app. Put Home
    // under it (the next run pushes the room's screen back on top).
    if (roomScreen && pathname === target && window.history.state?.idx === 0) {
      nav("/", { replace: true });
      return;
    }
    if (pathname === target) return;

    // The Back button, from a match on the room's address to Home: back into it, pushed again so the next Back is
    // turned around too.
    if (roomScreen && pathname === "/" && pathChanged && navType === "POP") {
      nav(target);
      return;
    }

    const screenCode = pathname.match(ROOM_SCREEN)?.[1]?.toUpperCase();
    if (screenCode) {
      // An out-of-date screen of our own room gets swapped for the right one. Another room's link is left to
      // its page, which is busy joining it.
      if (screenCode === room.code || screenCode === HIDDEN_SLUG.toUpperCase()) nav(target, { replace: true });
      return;
    }
    // The old pages of "¿Cómo quieres jugar?" (/jugar...): the room's address takes their place.
    if (pathname.startsWith("/jugar")) {
      nav(target, { replace: true });
      return;
    }
    // On Home a match's screens are pushed on top of it, so that Back has somewhere to go. Other pages (profile...) are
    // only left when a match starts on its own screens.
    if (pathname === "/") nav(target, { replace: pathChanged && navType === "POP" });
    else if (moved && !waiting) nav(target);
  }, [target, pathname]);

  return null;
}

export default function App() {
  return (
    <>
      <RoomNavigator />
      <PageTitle />
      <RoomSounds />
      {/* Opening a room this account already plays in from another device: it can be the room's central device. */}
      <CentralOffer />
      {/* The host, on every screen: players asking to use another device of theirs as the central one. */}
      <CentralRequests />
      {/* A public match asks an idle player if they are still there. */}
      <StillThere />
      <Suspense fallback={<ScreenWait />}>
      <Routes>
        <Route path="/" element={<RoomScreen />} />
        <Route path="/partida/:code" element={<RoomScreen />} />
        {/* A group's invite link: into the group, then wherever it is (/sala/CODE, from links of a while ago, too). */}
        <Route path="/grupo/:groupCode" element={<RoomScreen />} />
        <Route path="/sala/:groupCode" element={<RoomScreen />} />
        {/* The old pages of "¿Cómo quieres jugar?" (/jugar/casual, /jugar/privada…) open Inicio on the side they named. */}
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
        {/* "¿Olvidaste tu contraseña?": ask for the email link, or (with its token) choose the new password. */}
        <Route path="/restablecer" element={<ResetPassword />} />
        <Route path="/terminos" element={<Terms />} />
        <Route path="/privacidad" element={<Privacy />} />
        {/* The leaderboard was removed: an old link to it goes to Inicio. */}
        <Route path="/leaderboard" element={<Navigate to="/" replace />} />
        {/* Any other address: "Esta página no existe" (pages/ErrorPages.jsx). */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </>
  );
}
