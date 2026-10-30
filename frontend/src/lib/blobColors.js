// The Blob's colours (backend db/store.js checks the same rules): white for everyone, three more with an account, and
// gold only for owners. Everyone sees them all on the profile; the ones you can't use are dimmed and say how to get
// them. Any other avatar saved (the old colours, a Google photo) shows as white.
export const BLOB_COLORS = [
  { id: "#FFFFFF", name: "Blanco", needs: null },
  { id: "#8FD3FF", name: "Celeste", needs: "account" },
  { id: "#FFA6D2", name: "Rosa", needs: "account" },
  { id: "#8EF0B0", name: "Menta", needs: "account" },
  { id: "#FFC93C", name: "Dorado", needs: "owner" },
];

/** How to get a colour you can't use yet. */
export const HOW_TO_GET = {
  account: "Crea una cuenta para desbloquear este color.",
  owner: "Exclusivo del equipo de Trivially: solo lo tienen los owners.",
};

/** The colour a Blob is drawn in, from a player's `avatar`. */
export function blobColor(avatar) {
  const id = String(avatar || "").toUpperCase();
  return BLOB_COLORS.some((c) => c.id === id) ? id : BLOB_COLORS[0].id;
}

/** Whether `user` can use colour `c`. */
export function canUseColor(user, c) {
  if (c.needs === "owner") return user?.role === "owner";
  if (c.needs === "account") return Boolean(user) && !user.isGuest;
  return true;
}
