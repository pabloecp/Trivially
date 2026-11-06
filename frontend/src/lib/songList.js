import { useEffect, useState } from "react";
import { api } from "./api.js";

// Every song in the database (GET /api/songs), for the "Adivina la canción" search box. Downloaded and shared by every
// round; rooms only add their own extras on top (room.searchCatalog). It is downloaded again after a few minutes, so a
// song added to the database shows up without reloading the page.
const MAX_AGE_MS = 5 * 60 * 1000;
let cached = null;
let loadedAt = 0;
let pending = null;

const fresh = () => cached && Date.now() - loadedAt < MAX_AGE_MS;

function load() {
  if (!pending) {
    pending = api("/api/songs")
      .then((res) => {
        cached = res.songs || [];
        loadedAt = Date.now();
        pending = null;
        return cached;
      })
      .catch((err) => {
        pending = null; // try again next time
        throw err;
      });
  }
  return pending;
}

export function useSongList() {
  const [songs, setSongs] = useState(cached || []);
  useEffect(() => {
    if (fresh()) {
      setSongs(cached);
      return undefined;
    }
    let alive = true;
    load()
      .then((list) => alive && setSongs(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return songs;
}
