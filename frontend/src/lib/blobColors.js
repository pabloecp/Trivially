// The Blob's colours (backend db/store.js checks the same rules): white for everyone and, with an account, the colours
// of the games (Trivia, Canción, Mundo, Lluvia, Rango, Farsante, Minas). Eight, so the profile shows them in two full
// rows of four. Everyone sees them all on the profile; the ones you can't use are dimmed and say how to get them. Any
// other avatar saved (the old colours, a Google photo, the owners' old gold) shows as white, but the old account
// colours as their new ones. `shade` is the darker tone of each, for the skins that draw a shadow inside (Blob.jsx).
export const BLOB_COLORS = [
  { id: "#FFFFFF", name: "Blanco", shade: "#AEB3BF", needs: null },
  { id: "#2F6BFF", name: "Trivia", shade: "#1A3C99", needs: "account" },
  { id: "#FF2FC0", name: "Canción", shade: "#A3157A", needs: "account" },
  { id: "#00D1C1", name: "Mundo", shade: "#007A71", needs: "account" },
  { id: "#00A2FF", name: "Lluvia", shade: "#0A62A8", needs: "account" },
  { id: "#FF5A1F", name: "Rango", shade: "#B32F00", needs: "account" },
  { id: "#1FD24A", name: "Farsante", shade: "#12801F", needs: "account" },
  { id: "#A63DFF", name: "Minas", shade: "#6418A8", needs: "account" },
];
const RENAMED = { "#8FD3FF": "#2F6BFF", "#FFA6D2": "#FF2FC0", "#8EF0B0": "#00D1C1", "#FFD60A": "#FF5A1F", "#FF8A00": "#FF5A1F" };

/** How to get a colour you can't use yet. */
export const HOW_TO_GET = {
  account: "Crea una cuenta para desbloquear este color.",
};

/** The colour a Blob is drawn in, from a player's `avatar`. */
export function blobColor(avatar) {
  const raw = String(avatar || "").toUpperCase();
  const id = RENAMED[raw] || raw;
  return BLOB_COLORS.some((c) => c.id === id) ? id : BLOB_COLORS[0].id;
}

/** The darker tone of a Blob colour (white's, for anything else). */
export function blobShade(color) {
  const id = String(color || "").toUpperCase();
  return (BLOB_COLORS.find((c) => c.id === id) || BLOB_COLORS[0]).shade;
}

/** Whether `user` can use colour `c`. */
export function canUseColor(user, c) {
  if (c.needs === "account") return Boolean(user) && !user.isGuest;
  return true;
}
