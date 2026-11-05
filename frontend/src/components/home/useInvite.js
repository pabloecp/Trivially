import { useEffect, useRef, useState } from "react";
import { play } from "../../lib/sounds.js";

// A code out of what was typed or pasted: the code itself, or an invite link (/grupo/CODE; /sala/CODE from older links).
export function codeFromText(text, length = 5) {
  const link = String(text).match(/\/(?:grupo|sala)\/([A-Za-z0-9]{5})/);
  return (link ? link[1] : String(text)).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, length);
}

// The group's invite link.
export function inviteUrl(code) {
  return `${window.location.origin}/grupo/${code}`;
}

// Copies the group's invite link (/grupo/CODE), or with `what: "code"` the code alone. `copied` stays true for 2 s so the
// button can say so (and `done`, if given, is said in a toast); when the clipboard isn't available the link (or code) shows in a toast instead, if the screen gave `onToast`.
export function useInvite(code, onToast, { what = "link", done = "" } = {}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const url = what === "code" ? code : inviteUrl(code);
    // Played right away, while the click is handled, so the button's generic sound stays quiet.
    play("copy");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (done) onToast?.(done, "check");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast?.(`Comparte este enlace: ${url}`, "link");
    }
  }

  return { copied, copy };
}
