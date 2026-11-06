import { useEffect, useLayoutEffect, useState } from "react";

// Where a match is laid out for a phone (the same query as the phone frame at the end of styles/look.css): narrow
// screens, and short ones (a phone on its side).
const PHONE_FRAME = "(max-width: 899px), (max-height: 500px)";

// A phone's keyboard: how long the frame waits for it to come up or go, and how much of the screen's height it took the
// last time on this device, per orientation (a guess before the first time).
const KEYBOARD_WAIT_MS = 1000;
const KEYBOARD_KEY = "trivially_rain_keyboard";
const orientation = () => (window.innerWidth > window.innerHeight ? "landscape" : "portrait");
let keyboardShares = null;
function keyboardShare() {
  if (!keyboardShares) {
    try {
      keyboardShares = JSON.parse(localStorage.getItem(KEYBOARD_KEY)) || {};
    } catch {
      keyboardShares = {};
    }
  }
  const share = Number(keyboardShares[orientation()]);
  return share > 0.2 && share < 0.8 ? share : orientation() === "landscape" ? 0.6 : 0.45;
}
function rememberKeyboard(share) {
  keyboardShare();
  const key = orientation();
  if (Math.abs((keyboardShares[key] || 0) - share) < 0.01) return;
  keyboardShares[key] = Math.round(share * 1000) / 1000;
  try {
    localStorage.setItem(KEYBOARD_KEY, JSON.stringify(keyboardShares));
  } catch {
    // Without storage it just guesses again next time.
  }
}

// A box to write in, where a match has any.
const isBox = (el) => el instanceof Element && el.matches("input:not([type=range]):not([type=hidden]), textarea") && Boolean(el.closest(".tv-room"));
// Whatever a tap on gives the keyboard to the box (the box itself, what's around it, Lluvia's sky).
const TAP_AREA = "input, textarea, label, .tv-search-box, .tv-rain-box, .tv-rain-sky";

// Whether this touch can scroll something on its own (the scoreboard's strip, a long list, a panel over the page).
function scrollsInside(target) {
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    if ((el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(style.overflowY)) || (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(style.overflowX))) return true;
  }
  return false;
}

/**
 * On a phone a match is exactly the part of the screen the player can see, in every game and in the intro before it: the
 * page doesn't scroll, and everything stays in sight (styles/look.css, html.tv-match-lock).
 *
 * The keyboard doesn't make the page shorter: it covers its bottom, and the browser scrolls the page to show the box, pushing
 * the question up and away. So the frame follows visualViewport (--match-top, --match-h): the box sits right above the
 * keyboard and the rest fits in what's left (html.tv-keyboard-up), keyboard open or not.
 * Safari scrolls the page to centre a box a tap focuses, even one in sight in a fixed frame, and the frame only follows once
 * the keyboard is up: everything goes up and jumps back down. It doesn't for a box the page focuses with preventScroll
 * (Safari 15.5 on), so a tap while the keyboard is down doesn't focus the box itself: the page does (onTouchEnd), and with
 * the keyboard up the page can't be dragged either (onTouchMove).
 * The frame doesn't wait for the keyboard to say how tall it is: the moment the box is tapped it already makes room for it
 * (as much as it took last time, keyboardShare), so the box is above it before it comes up; when the box loses the keyboard,
 * the frame gets its height back at once. Meanwhile what the browser measures is ignored until it agrees (or for
 * KEYBOARD_WAIT_MS at most).
 */
export default function useMatchViewport(active) {
  const [phone, setPhone] = useState(() => Boolean(window.matchMedia?.(PHONE_FRAME).matches));
  // Turned on its side, or a window made smaller mid-match: the frame comes or goes with it.
  useEffect(() => {
    const query = window.matchMedia?.(PHONE_FRAME);
    if (!query) return undefined;
    const onChange = () => setPhone(query.matches);
    onChange();
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  useLayoutEffect(() => {
    if (!active || !phone) return undefined;
    const root = document.documentElement;
    const vv = window.visualViewport;
    root.classList.add("tv-match-lock");
    let gone = false;
    let shown = "";
    // Whether the frame has made room for the keyboard.
    let up = false;
    // The box is being focused by a tap (onTouchEnd), and where that touch started.
    let tapping = false;
    let touchStart = null;
    // { keyboard, until, seen }: what the frame is ready for, while the keyboard comes up or goes.
    let expect = null;
    let frame = 0;
    const set = (top, height, keyboard) => {
      const key = `${top}/${height}/${keyboard}`;
      if (key === shown) return;
      shown = key;
      up = keyboard;
      root.style.setProperty("--match-h", `${height}px`);
      root.style.setProperty("--match-top", `${top}px`);
      root.classList.toggle("tv-keyboard-up", keyboard);
    };
    const fit = () => {
      const height = Math.round(vv ? vv.height : window.innerHeight);
      const top = Math.round(vv ? vv.offsetTop : 0);
      const keyboard = height < window.innerHeight * 0.8;
      if (expect && performance.now() < expect.until) {
        // Not there yet, or still moving (the same twice in a row): the frame stays as it was made ready.
        const seen = `${top}/${height}/${keyboard}`;
        if (keyboard !== expect.keyboard || seen !== expect.seen) {
          expect.seen = seen;
          return;
        }
      }
      expect = null;
      if (keyboard) rememberKeyboard(1 - height / window.innerHeight);
      set(top, height, keyboard);
    };
    // Until the keyboard is up (or gone), the frame follows what the browser measures on every frame, not only on its
    // events, which can come late.
    const watch = () => {
      cancelAnimationFrame(frame);
      const until = performance.now() + KEYBOARD_WAIT_MS + 300;
      const tick = () => {
        fit();
        if (performance.now() < until) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const ready = (keyboard) => {
      expect = { keyboard, until: performance.now() + KEYBOARD_WAIT_MS };
      const full = window.innerHeight;
      set(0, keyboard ? Math.round(full * (1 - keyboardShare())) : full, keyboard);
      watch();
    };
    const onTouchStart = (e) => {
      const t = e.touches[0];
      touchStart = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
    };
    const onTouchEnd = (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const place = target?.closest(TAP_AREA);
      if (up || !place?.closest(".tv-room") || target.closest("button")) return;
      const input = isBox(place) ? place : [...(place.querySelectorAll("input, textarea")), ...document.querySelectorAll(".tv-room input, .tv-room textarea")].find((el) => isBox(el) && !el.disabled);
      if (!input) return;
      const t = e.changedTouches[0];
      // A drag isn't a tap.
      if (!touchStart || !t || Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y) > 12) return;
      e.preventDefault();
      // Focused but with no keyboard (a box takes the focus back after each round): focused anew, so it comes up.
      if (document.activeElement === input) input.blur();
      tapping = true;
      input.focus({ preventScroll: true });
      tapping = false;
    };
    // Only a tap brings the keyboard up: a box takes the focus back by itself after each round (on a phone, without the
    // keyboard), and a computer has none.
    const onFocus = (e) => {
      if (isBox(e.target) && tapping && !up) ready(true);
    };
    const onTouchMove = (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (e.touches.length > 1 || !target || !e.cancelable) return;
      // A box moves its caret, a slider its knob (the volume) and what scrolls scrolls; nothing else moves the page.
      if (target.closest("input, textarea") || scrollsInside(target)) return;
      e.preventDefault();
    };
    const onBlur = (e) => {
      if (!isBox(e.target) || !up) return;
      // Given back to a box straight away (a new round's box), the keyboard stays.
      requestAnimationFrame(() => {
        if (!gone && !isBox(document.activeElement)) ready(false);
      });
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    return () => {
      gone = true;
      cancelAnimationFrame(frame);
      root.classList.remove("tv-match-lock", "tv-keyboard-up");
      root.style.removeProperty("--match-h");
      root.style.removeProperty("--match-top");
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
      document.removeEventListener("touchmove", onTouchMove, { capture: true });
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
    };
  }, [active, phone]);
}
