/**
 * Adaptador Spotify Web API para Trivially.
 * Todas las llamadas se realizan exclusivamente desde el backend con el token del usuario.
 */

const SPOTIFY_API = "https://api.spotify.com/v1";

async function spotifyFetch(endpoint, accessToken) {
  if (!accessToken) return null;
  try {
    const res = await fetch(`${SPOTIFY_API}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      if (res.status === 401) return null;
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`Spotify fetch error on ${endpoint}:`, err.message);
    return null;
  }
}

/**
 * Busca un preview de audio legal de 30 segundos usando iTunes Search API
 * para canciones de Spotify que no incluyan preview_url nativo.
 */
async function resolveAudioPreview(title, artist) {
  try {
    const query = encodeURIComponent(`${title} ${artist}`.trim());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=1`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    return json.results?.[0]?.previewUrl || null;
  } catch {
    return null;
  }
}

export async function fetchUserSpotifyLibrary(accessToken) {
  if (!accessToken) {
    return {
      connected: false,
      playlists: [],
      artists: [],
      albums: [],
      currentlyPlaying: null,
      source: "unauthenticated",
    };
  }

  const [profile, playlistsData, topArtistsData, savedAlbumsData, currentPlayback] = await Promise.all([
    spotifyFetch("/me", accessToken),
    spotifyFetch("/me/playlists?limit=50", accessToken),
    spotifyFetch("/me/top/artists?limit=20", accessToken),
    spotifyFetch("/me/albums?limit=20", accessToken),
    spotifyFetch("/me/player/currently-playing", accessToken),
  ]);

  const rawPlaylists = playlistsData?.items || [];
  const playlists = rawPlaylists.map((p) => {
    const rawCount =
      p.tracks?.total ??
      p.items?.total ??
      p.total_tracks ??
      p.tracks?.count ??
      (Array.isArray(p.tracks) ? p.tracks.length : null) ??
      (Array.isArray(p.items) ? p.items.length : null);

    return {
      id: p.id,
      name: p.name || "Playlist sin título",
      description: p.description || "",
      image: p.images?.[0]?.url || "",
      trackCount: typeof rawCount === "number" ? rawCount : 0,
      owner: p.owner?.display_name || "Spotify",
    };
  });

  // Si alguna playlist quedó en 0 por cambios de API, consultamos su detalle rápido
  await Promise.all(
    playlists.slice(0, 15).map(async (p) => {
      if (p.trackCount > 0) return;
      try {
        const detail = await spotifyFetch(`/playlists/${p.id}?fields=tracks.total,items.total`, accessToken);
        const resolved = detail?.tracks?.total ?? detail?.items?.total ?? detail?.total;
        if (typeof resolved === "number" && resolved > 0) {
          p.trackCount = resolved;
        }
      } catch {
        // Silencioso
      }
    })
  );

  const artists = (topArtistsData?.items || []).map((a) => ({
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url || "",
    genreIds: a.genres || [],
    popularity: a.popularity,
    spotifyUrl: a.external_urls?.spotify,
  }));

  const albums = (savedAlbumsData?.items || []).map((item) => {
    const alb = item.album;
    return {
      id: alb.id,
      name: alb.name,
      artistId: alb.artists?.[0]?.id,
      artistName: alb.artists?.[0]?.name,
      year: alb.release_date ? parseInt(alb.release_date.slice(0, 4), 10) : null,
      image: alb.images?.[0]?.url,
      trackCount: alb.total_tracks,
    };
  });

  let currentlyPlaying = null;
  if (currentPlayback?.item) {
    const item = currentPlayback.item;
    currentlyPlaying = {
      id: item.id,
      title: item.name,
      artistName: item.artists?.map((a) => a.name).join(", "),
      albumName: item.album?.name,
      image: item.album?.images?.[0]?.url,
      isPlaying: currentPlayback.is_playing,
      progressMs: currentPlayback.progress_ms,
      durationMs: item.duration_ms,
      previewUrl: item.preview_url,
    };
  }

  return {
    connected: true,
    user: profile
      ? {
          id: profile.id,
          name: profile.display_name,
          email: profile.email,
          image: profile.images?.[0]?.url,
          product: profile.product,
        }
      : null,
    playlists,
    artists,
    albums,
    currentlyPlaying,
    source: "spotify",
  };
}

export async function fetchPlaylistTracks(accessToken, playlistId) {
  if (!accessToken || !playlistId) return [];

  // Intenta endpoints estándar y retrocompatibles con la API de Spotify
  let data = await spotifyFetch(`/playlists/${playlistId}/tracks?limit=50`, accessToken);
  if (!data?.items || !data.items.length) {
    data = await spotifyFetch(`/playlists/${playlistId}/items?limit=50`, accessToken);
  }
  if (!data?.items || !data.items.length) {
    const full = await spotifyFetch(`/playlists/${playlistId}`, accessToken);
    if (full?.tracks?.items?.length) data = full.tracks;
    else if (full?.items?.length) data = full;
  }
  if (!data?.items) return [];

  // Soporta tanto item.track como item.item (cambio API febrero 2026)
  const rawTracks = data.items
    .map((entry) => entry.track || entry.item || entry)
    .filter((t) => t && (t.id || t.name));

  // Resuelve tracks con preview de audio para que el juego siempre reproduzca música
  const tracks = await Promise.all(
    rawTracks.slice(0, 35).map(async (t) => {
      let previewUrl = t.preview_url || "";
      const artistName =
        t.artists?.map((a) => a.name).join(", ") || t.artistName || "Artista Spotify";

      if (!previewUrl) {
        previewUrl = (await resolveAudioPreview(t.name || t.title, artistName)) || "";
      }

      return {
        id: `sp-${t.id || Math.random().toString(36).slice(2)}`,
        title: t.name || t.title,
        artistId: t.artists?.[0]?.id || "sp-unknown",
        artistName,
        albumId: t.album?.id || "sp-album",
        albumName: t.album?.name || "Single",
        year: t.album?.release_date ? parseInt(t.album.release_date.slice(0, 4), 10) : 2024,
        image: t.album?.images?.[0]?.url || "",
        previewUrl,
        source: "spotify",
      };
    })
  );

  // Si hay canciones con audio preview funcional las priorizamos
  const withAudio = tracks.filter((t) => Boolean(t.previewUrl));
  return withAudio.length >= 3 ? withAudio : tracks;
}

export async function fetchSpotifyCatalog(_accessToken) {
  return null;
}
