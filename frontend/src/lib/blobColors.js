// The Blob's colours (backend db/store.js checks the same rules): white for everyone, the site's main colours (the logo's
// five and orange) with an account, and gold only for owners (drawn as metal that shines, Blob.jsx). Eight, so the
// profile shows them in two full rows of four. Everyone sees them all on the profile; the ones you can't use are dimmed
// and say how to get them. Any other avatar saved (the old colours, a Google photo) shows as white, but the old account
// colours (celeste, rosa, menta) as their new ones.
export const BLOB_GOLD = "#FFC93C";
export const BLOB_COLORS = [
  { id: "#FFFFFF", name: "Blanco", needs: null },
  { id: "#FF2FC0", name: "Rosa", needs: "account" },
  { id: "#FFD60A", name: "Amarillo", needs: "account" },
  { id: "#00D1C1", name: "Turquesa", needs: "account" },
  { id: "#2F6BFF", name: "Azul", needs: "account" },
  { id: "#A63DFF", name: "Morado", needs: "account" },
  { id: "#FF8A00", name: "Naranja", needs: "account" },
  { id: BLOB_GOLD, name: "Dorado", needs: "owner" },
];
const RENAMED = { "#8FD3FF": "#2F6BFF", "#FFA6D2": "#FF2FC0", "#8EF0B0": "#00D1C1" };

/** How to get a colour you can't use yet. */
export const HOW_TO_GET = {
  account: "Crea una cuenta para desbloquear este color.",
  owner: "Exclusivo del equipo de Trivially: solo lo tienen los owners.",
};

/** The colour a Blob is drawn in, from a player's `avatar`. */
export function blobColor(avatar) {
  const raw = String(avatar || "").toUpperCase();
  const id = RENAMED[raw] || raw;
  return BLOB_COLORS.some((c) => c.id === id) ? id : BLOB_COLORS[0].id;
}

/** Whether `user` can use colour `c`. */
export function canUseColor(user, c) {
  if (c.needs === "owner") return user?.role === "owner";
  if (c.needs === "account") return Boolean(user) && !user.isGuest;
  return true;
}
