import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AppProvider } from "./lib/store.jsx";
import { FriendsProvider } from "./lib/friends.jsx";
import "./lib/theme.js";
import "./styles/global.css";
import "./styles/home.css";
import "./styles/palettes.css";

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
