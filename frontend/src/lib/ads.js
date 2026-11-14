// The site's ads (Google AdSense), only when the site is built with VITE_ADSENSE_CLIENT (in Vercel) and the place has
// its own ad unit (VITE_ADSENSE_SLOT_…): without them nothing is loaded and no space shows. Google's code is downloaded
// once, the first time a space is on screen. VITE_ADS_PREVIEW=1 shows the empty spaces with their size written in
// them, to see where they go without any ad (local only).

const client = import.meta.env.VITE_ADSENSE_CLIENT || "";
const slots = {
  left: import.meta.env.VITE_ADSENSE_SLOT_LEFT || "",
  right: import.meta.env.VITE_ADSENSE_SLOT_RIGHT || "",
  phone: import.meta.env.VITE_ADSENSE_SLOT_PHONE || "",
};

export const adsPreview = import.meta.env.VITE_ADS_PREVIEW === "1";
export const adClient = client;

/** The ad unit of a place ("left", "right", "phone"), or "" when it has none. */
export function adSlot(place) {
  return client ? slots[place] || "" : "";
}

let loading = false;
/** Downloads Google's code, once. */
export function loadAds() {
  if (loading || !client) return;
  loading = true;
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(script);
}

/** Asks Google for an ad for the <ins> just put on the page. */
export function requestAd() {
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    // An ad that doesn't come is never the page's problem.
  }
}
