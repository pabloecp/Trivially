import { useEffect, useState } from "react";

/** Whether the screen is a phone's (the width where the room's bars take over, home.css). */
export function usePhone() {
  const query = "(max-width: 640px)";
  const [phone, setPhone] = useState(() => Boolean(window.matchMedia?.(query).matches));
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return undefined;
    const onChange = () => setPhone(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return phone;
}
