import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { adClient, adSlot, adsPreview, loadAds, requestAd } from "../../lib/ads.js";

// The spaces for ads, only on Inicio (HomeFrame, with no match waiting or being searched for): flat grey boxes with
// "Publicidad" over them, never moving and never over anything that is tapped.
//  - Computers: one bar in each margin of the page, as tall as the window (`AdSides`), only when the window is wide
//    enough to have margins (1760 px): narrower, there are none and the page is as it was.
//  - Phones: one banner (320 × 50) between the game's card and the boxes under it (`AdBanner`).
// A space with no ad unit of its own (lib/ads.js) isn't on the page at all.

function useMedia(query) {
  const [on, setOn] = useState(() => Boolean(window.matchMedia?.(query).matches));
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return undefined;
    const onChange = () => setOn(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return on;
}

function Ad({ place, size }) {
  const slot = adSlot(place);
  useEffect(() => {
    if (!slot) return;
    loadAds();
    requestAd();
  }, [slot]);
  if (!slot && !adsPreview) return null;
  return (
    <aside className={`tv-ad tv-ad--${place}`} aria-label="Publicidad">
      <span className="tv-ad-label">Publicidad</span>
      {slot ? (
        <ins className="adsbygoogle tv-ad-unit" data-ad-client={adClient} data-ad-slot={slot} />
      ) : (
        <span className="tv-ad-unit tv-ad-demo">{size}</span>
      )}
    </aside>
  );
}

/** The two bars beside the page, on a wide computer window. */
export function AdSides() {
  const wide = useMedia("(min-width: 1760px) and (min-height: 560px)");
  if (!wide) return null;
  const frame = document.querySelector(".tv-app") || document.body;
  return createPortal(
    <>
      <Ad place="left" size="160 × el alto de la ventana" />
      <Ad place="right" size="160 × el alto de la ventana" />
    </>,
    frame
  );
}

/** The one banner of a phone, under the game's card. */
export function AdBanner() {
  const phone = useMedia("(max-width: 760px)");
  if (!phone) return null;
  return <Ad place="phone" size="320 × 50" />;
}
