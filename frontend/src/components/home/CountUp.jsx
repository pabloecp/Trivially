import { locale } from "../../lib/i18n.js";
import { useEffect, useRef, useState } from "react";

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Animates a number from its previous value to `value` (stats, scores): the first time from `start` (0 by default), after
// `delay` ms. `format` writes it (by default with the language's own separators).
export default function CountUp({ value = 0, duration = 900, start: first = 0, delay = 0, format = (n) => n.toLocaleString(locale()) }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(reduceMotion() ? target : first);
  const from = useRef(shown);

  useEffect(() => {
    if (reduceMotion()) {
      setShown(target);
      return;
    }
    let frame = 0;
    const begin = (startedAt) => {
      const origin = from.current;
      const tick = (now) => {
        const t = Math.min(1, Math.max(0, now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const next = Math.round(origin + (target - origin) * eased);
        from.current = next;
        setShown(next);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => begin(performance.now()), delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, duration, delay]);

  return format(shown);
}
