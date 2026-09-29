import { useEffect, useState } from "react";

const THEME_KEY = "yoavlly_theme";

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || localStorage.getItem("bysong_theme") || "dark";
}

// Shared by the new Home and the legacy Layout so the choice survives navigation between them.
export function useTheme() {
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return { theme, toggleTheme };
}
