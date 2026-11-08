import { useEffect } from "react";

// Inputs that don't bring up the keyboard.
const NO_KEYBOARD = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

function writing(el) {
  const a = document.activeElement;
  if (!a || !el.contains(a) || a.disabled || a.readOnly) return false;
  if (a.isContentEditable || a.tagName === "TEXTAREA") return true;
  return a.tagName === "INPUT" && !NO_KEYBOARD.has(a.type);
}

/**
 * Keeps a panel over the page inside the part of the screen the phone's keyboard leaves visible. On phones the
 * keyboard covers the page's bottom, which is where panels sit on a phone (a sheet, or a Modal shown as one), so the box
 * being written in ends up under it. While `active` and a box inside the panel is being written in on a touch screen,
 * the element of `ref` gets the visible part's height and top (--tv-vv-h, --tv-vv-top; its CSS places it with them)
 * and `is-keyboard`. Otherwise it has neither and takes the whole screen: the iPhone sometimes keeps reporting the
 * smaller visible part after the keyboard is gone, and a panel opened then ("Tu grupo") was left cut short, with the
 * page showing under it. Matches have their own (useMatchViewport).
 */
export default function useKeyboardFit(ref, active) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!active || !vv || !el) return undefined;
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    let raf = 0;
    function clear() {
      el.classList.remove("is-keyboard");
      el.style.removeProperty("--tv-vv-h");
      el.style.removeProperty("--tv-vv-top");
    }
    function fit() {
      if (!touch || !writing(el)) return clear();
      el.style.setProperty("--tv-vv-h", `${vv.height}px`);
      el.style.setProperty("--tv-vv-top", `${vv.offsetTop}px`);
      el.classList.add("is-keyboard");
    }
    // Moving from one box to another passes through no focus at all: it is looked at once the focus has landed.
    function later() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    }
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    el.addEventListener("focusin", fit);
    el.addEventListener("focusout", later);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      el.removeEventListener("focusin", fit);
      el.removeEventListener("focusout", later);
      clear();
    };
  }, [active]);
}
