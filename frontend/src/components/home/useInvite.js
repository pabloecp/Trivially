import { useEffect, useRef, useState } from "react";

// Copies the room's invite link (/sala/CODE). `copied` stays true for 2 s so the button can say so; when the
// clipboard isn't available the link shows in a toast instead.
export function useInvite(code, onToast) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const url = `${window.location.origin}/sala/${code}`;
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
