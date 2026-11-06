import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AppProvider } from "./lib/store.jsx";
import { FriendsProvider } from "./lib/friends.jsx";
import { startMonitoring } from "./lib/monitoring.js";
import "./lib/theme.js";
import "./styles/global.css";
import "./styles/home.css";
import "./styles/palettes.css";
// Last: the look over everything else (see the file).
import "./styles/look.css";

// Errors to Sentry, when the site is built with its key (lib/monitoring.js).
startMonitoring();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <FriendsProvider>
          <App />
        </FriendsProvider>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);
