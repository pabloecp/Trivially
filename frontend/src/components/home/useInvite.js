import { useEffect, useRef, useState } from "react";
import { play } from "../../lib/sounds.js";

// Copies the room's invite link (/sala/CODE), or with `what: "code"` the code alone. `copied` stays true for 2 s so the
// button can say so; when the clipboard isn't available the link (or code) shows in a toast instead.
export function useInvite(code, onToast, { what = "link" } = {}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const url = what === "code" ? code : `${window.location.origin}/sala/${code}`;
    // Played right away, while the click is handled, so the button's generic sound stays quiet.
    play("copy");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast?.(`Comparte este enlace: ${url}`, "link");
    }
  }

  return { copied, copy };
}
