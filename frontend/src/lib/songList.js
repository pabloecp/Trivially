import { useEffect, useState } from "react";
import { api } from "./api.js";

// Every song in the database (GET /api/songs), for the "Adivina la canción" search box. Downloaded once per visit
// and shared by every round; rooms only add their own extras on top (room.searchCatalog).
let cached = null;
let pending = null;

function load() {
  if (!pending) {
    pending = api("/api/songs")
      .then((res) => {
        cached = res.songs || [];
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
    if (cached) return undefined;
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
