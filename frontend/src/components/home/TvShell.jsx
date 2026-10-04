import { useEffect } from "react";
import TvTopbar from "./TvTopbar.jsx";
import "../../styles/home.css";

// The Home look (backdrop, top bar, chunky cards) for screens that live inside a game mode.
// `mode` swaps the site's main color for that mode (see :root[data-mode] in global.css).
export default function TvShell({ mode, children }) {
  useEffect(() => {
    if (!mode) return;
    document.documentElement.setAttribute("data-mode", mode);
    return () => document.documentElement.removeAttribute("data-mode");
  }, [mode]);

  return (
    <div className="tv-app">
      <div className="tv-backdrop" aria-hidden="true">
        <span className="tv-blob tv-blob--1" />
        <span className="tv-blob tv-blob--2" />
        <span className="tv-blob tv-blob--3" />
        <span className="tv-blob tv-blob--4" />
        <span className="tv-blob tv-blob--5" />
      </div>

      <TvTopbar />

      <main className="tv-main tv-main--page">{children}</main>
    </div>
  );
}
