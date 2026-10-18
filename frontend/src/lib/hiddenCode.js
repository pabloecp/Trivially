import { useEffect, useState } from "react";

// "Ocultar código": the room's code covered with dots on this device's screens (for whoever streams the game, so
// nobody watching gets in without an invitation). It's this device's choice only, kept in localStorage; every screen
// that shows the code (the room's column, the phones' header, the central device, a match's header) follows it at
// once, and so does the address bar: the room's addresses carry HIDDEN_SLUG instead of the code (/sala/oculta,
// /quiz/oculta...), which resolveCode turns back into this tab's room. Copying the invite link still works.
const KEY = "trivially_hide_code";
const EVENT = "trivially:hidecode";

// Stands for the code in the room's addresses while it's hidden. Never a real code: codes have no "O".
export const HIDDEN_SLUG = "oculta";
// This tab's room (lib/store.jsx keeps it here).
const ROOM_KEY = "trivially_room";

function read() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** [hidden, toggle]: whether this device hides the room's code, and a function that switches it. */
export function useHiddenCode() {
  const [hidden, setHidden] = useState(read);
  useEffect(() => {
    const sync = () => setHidden(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  function toggle() {
    try {
      if (hidden) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, "1");
    } catch {}
    setHidden(!hidden);
    window.dispatchEvent(new Event(EVENT));
  }
  return [hidden, toggle];
}

/** The code as this device shows it: dots while it's hidden. */
export function shownCode(code, hidden) {
  return hidden ? "•".repeat(String(code || "").length || 5) : code;
}

/** Whether this device hides the code right now (for code outside React, like the room's addresses). */
export function isCodeHidden() {
  return read();
}

/** The code as the room's addresses carry it: HIDDEN_SLUG while it's hidden. */
export function urlCode(code) {
  return read() ? HIDDEN_SLUG : code;
}

/** The room's code from an address's `:code`: HIDDEN_SLUG is this tab's room (the one open, else the one saved). */
export function resolveCode(param, room) {
  if (!param || param.toLowerCase() !== HIDDEN_SLUG) return param;
  if (room?.code) return room.code;
  try {
    return sessionStorage.getItem(ROOM_KEY) || null;
  } catch {
    return null;
  }
}
