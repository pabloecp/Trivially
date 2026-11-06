import { Component } from "react";
import { Link } from "react-router-dom";
import TvShell from "../components/home/TvShell.jsx";
import AppIcon from "../components/home/AppIcon.jsx";

// The two pages for when something isn't there: an address that doesn't exist ("Esta página no existe", the last
// route of App.jsx), and the screen that takes the place of the whole site when it fails while drawing ("Algo salió
// mal", ErrorBoundary in main.jsx), so a failure mid-match never leaves the screen blank.

/** An address of the site that doesn't exist: what happened and the way back to Inicio. */
export function NotFound() {
  return (
    <TvShell>
      <div className="tv-auth tv-errorpage">
        <header className="tv-auth-head">
          <AppIcon />
          <h1 className="tv-page-title">Esta página no existe</h1>
          <p className="tv-page-sub">Puede que el enlace esté mal escrito o que la partida ya haya terminado.</p>
        </header>
        <Link to="/" className="tv-btn tv-btn--primary tv-btn--block">
          Ir a Inicio
        </Link>
      </div>
    </TvShell>
  );
}

// Drawn without the site's bar or its data (any of them may be what failed), only inside its look (.tv-app): the logo,
// the message and the two ways out.
function Crashed() {
  return (
    <div className="tv-app tv-errorpage--crash" role="alert">
      <main className="tv-main tv-main--page tv-auth tv-errorpage">
        <header className="tv-auth-head">
          <AppIcon />
          <h1 className="tv-page-title">Algo salió mal</h1>
          <p className="tv-page-sub">La página tuvo un problema. Recárgala para seguir; si estabas en una partida, vuelves a ella.</p>
        </header>
        <button type="button" className="tv-btn tv-btn--primary tv-btn--block" onClick={() => window.location.reload()}>
          Recargar
        </button>
        <a href="/" className="tv-btn tv-btn--neutral tv-btn--block">
          Ir a Inicio
        </a>
      </main>
    </div>
  );
}

/** Catches any failure while drawing the site and shows "Algo salió mal" instead of a blank screen. */
export class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("[Trivially] La página falló:", error, info?.componentStack);
  }

  render() {
    return this.state.failed ? <Crashed /> : this.props.children;
  }
}
