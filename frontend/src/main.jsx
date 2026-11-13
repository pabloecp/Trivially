import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AppProvider } from "./lib/store.jsx";
import { FriendsProvider } from "./lib/friends.jsx";
import { startMonitoring } from "./lib/monitoring.js";
import { ErrorBoundary } from "./pages/ErrorPages.jsx";
import "./lib/theme.js";
import "./styles/global.css";
import "./styles/home.css";
import "./styles/palettes.css";
// Last: the look over everything else (see the file).
import "./styles/look.css";
// After it: the light theme only changes the colour tokens.
import "./styles/light.css";

// On a phone, tapping "Enviar" or "Saltar" with the keyboard open used to take the focus off the box: the keyboard
// closed, the page moved under the finger and the tap was lost. Keeping the focus where it is lets the tap go through.
document.addEventListener("mousedown", (e) => {
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && e.target.closest?.(".tv-mwrite-send, .tv-skipbtn")) {
    e.preventDefault();
  }
});

// Errors to Sentry, when the site is built with its key (lib/monitoring.js).
startMonitoring();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* A failure anywhere shows "Algo salió mal" with "Recargar" instead of a blank screen. */}
    <ErrorBoundary>
      <BrowserRouter>
        <AppProvider>
          <FriendsProvider>
            <App />
          </FriendsProvider>
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
