import { useEffect } from "react";

/**
 * Keeps a panel over the page inside the part of the screen the phone's keyboard leaves visible. On phones the
 * keyboard doesn't make the page shorter: it covers its bottom, which is where panels sit on a phone (a sheet, or a
 * Modal shown as one), so the box being written in ends up under it. While `active`, the element of `ref` gets the
 * visible part's height and top (--tv-vv-h, --tv-vv-top; its CSS places it with them) and `is-keyboard` while the
 * keyboard is up. Without the keyboard they are the whole screen, so nothing changes. Matches have their own
 * (useMatchViewport).
 */
export default function useKeyboardFit(ref, active) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!active || !vv || !el) return undefined;
    function fit() {
      el.style.setProperty("--tv-vv-h", `${vv.height}px`);
      el.style.setProperty("--tv-vv-top", `${vv.offsetTop}px`);
      // With the keyboard up, the screen's bottom edge (and its safe area) is under the keyboard.
      el.classList.toggle("is-keyboard", window.innerHeight - vv.height > 120);
    }
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      el.classList.remove("is-keyboard");
      el.style.removeProperty("--tv-vv-h");
      el.style.removeProperty("--tv-vv-top");
    };
  }, [active]);
}
