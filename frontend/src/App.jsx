import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import ModeSelect from "./pages/ModeSelect.jsx";
import Join from "./pages/Join.jsx";
import Setup from "./pages/Setup.jsx";
import Lobby from "./pages/Lobby.jsx";
import Game from "./pages/Game.jsx";
import Profile from "./pages/Profile.jsx";
import { useApp } from "./lib/store.jsx";

function Guard({ children }) {
  const { user } = useApp();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ModeSelect />} />
        <Route path="/play" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/leaderboard" element={<Navigate to="/" replace />} />
        <Route path="/play/join" element={<Join />} />
        <Route path="/play/setup" element={<Setup />} />
        <Route path="/lobby/:code" element={<Lobby />} />
        <Route path="/game/:code" element={<Game />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:userId" element={<Profile />} />
      </Routes>
    </Layout>
  );
}
