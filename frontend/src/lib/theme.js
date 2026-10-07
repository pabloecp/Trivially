// The site has a single look (the dark page, styles/palettes.css). There used to be several colour options behind a
// button in the top bar; their saved choice is dropped so it doesn't linger in the browser.
for (const key of ["trivially_palette_v2", "trivially_palette", "trivially_theme"]) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing to clean.
  }
}

document.documentElement.setAttribute("data-theme", "dark");
