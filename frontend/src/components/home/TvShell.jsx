import { useEffect } from "react";
import TvTopbar from "./TvTopbar.jsx";
import PageDecor from "./PageDecor.jsx";
import "../../styles/home.css";

// The Home look (black page, top bar, chunky cards) for screens that live inside a game mode.
// `mode` swaps the site's main color for that mode (see :root[data-mode] in global.css).
export default function TvShell({ mode, children }) {
  useEffect(() => {
    if (!mode) return;
    document.documentElement.setAttribute("data-mode", mode);
    return () => document.documentElement.removeAttribute("data-mode");
  }, [mode]);

  return (
    <div className="tv-app">
      <PageDecor />

      <TvTopbar />

      <main className="tv-main tv-main--page">{children}</main>
    </div>
  );
}
