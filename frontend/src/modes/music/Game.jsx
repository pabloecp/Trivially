import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MiniBoard from "../../components/MiniBoard.jsx";
import TvShell from "../../components/home/TvShell.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import { remainingMs, useApp } from "../../lib/store.jsx";
import { BACKEND_URL } from "../../lib/config.js";

function normalize(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// "Sebastián Yatra & Myke Towers" → ["Sebastián Yatra", "Myke Towers"]: each artist of a song can be searched.
function splitArtists(name = "") {
  return name
    .split(/\s*(?:,|&|\s+feat\.?\s+|\s+ft\.?\s+|\s+x\s+|\s+y\s+|\s+with\s+)\s*/i)
    .map((a) => a.trim())
    .filter(Boolean);
}

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// How an artist's name matches what was typed: 3 starts with it, 2 contains it, 1 close with a typo
// ("mike towers" for "Myke Towers"), 0 not at all.
function artistMatch(normArtist, q) {
  if (normArtist.startsWith(q)) return 3;
  if (normArtist.includes(q)) return 2;
  if (q.length >= 4) {
    const allowed = q.length >= 8 ? 2 : 1;
    if (editDistance(q, normArtist.slice(0, q.length)) <= allowed || editDistance(q, normArtist) <= allowed) return 1;
  }
  return 0;
}

// Shown under the result when the round didn't go your way; one per round, never the same twice in a row.
const CHEERS = [
  "¡Estuviste cerca!",
  "¡La próxima es tuya!",
  "¡Casi la tienes!",
  "¡No te rindas, tú puedes!",
  "¡Sigue así, vas mejorando!",
];

function GameScreen() {
  const { code } = useParams();
  const { user, room, joinRoom, answer, skipSong, setGame } = useApp();
  const nav = useNavigate();

  const audioRef = useRef(null);
  const inputRef = useRef(null);
  const suggestionsListRef = useRef(null);
  const cheerOffset = useRef(Math.floor(Math.random() * CHEERS.length));

  const [left, setLeft] = useState(0);
  const [err, setErr] = useState("");

  // Search & autocomplete state
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [submittedSong, setSubmittedSong] = useState(null);
  // Round in which this player tapped "Saltar" (shown right away, before the server confirms).
  const [skippedRound, setSkippedRound] = useState(null);
  // Host's "back to the main room" mid-match needs a second tap, since it ends the match for everyone.
  const [confirmHub, setConfirmHub] = useState(false);
  // Skip works like "Terminar": the first tap warns that the round gives no points, the second one skips.
  const [confirmSkip, setConfirmSkip] = useState(false);
  // The "Era la canción" card appears once its cover has loaded (or after 1.5 s, so a slow image never holds it).
  const revealTitle = room?.phase === "reveal" ? room?.reveal?.title : null;
  const [coverReadyFor, setCoverReadyFor] = useState(null);
  useEffect(() => {
    if (!revealTitle) return;
    const t = setTimeout(() => setCoverReadyFor(revealTitle), 1500);
    return () => clearTimeout(t);
  }, [revealTitle]);

  // Join room if disconnected or reloaded. Going back to the lobby is handled by RoomNavigator (App.jsx).
  useEffect(() => {
    if (!room || room.code !== code) {
      joinRoom(code).catch(() => nav("/"));
    }
  }, [code]);

  useEffect(() => {
    if (!confirmHub) return;
    const t = setTimeout(() => setConfirmHub(false), 3000);
    return () => clearTimeout(t);
  }, [confirmHub]);

  useEffect(() => {
    if (!confirmSkip) return;
    const t = setTimeout(() => setConfirmSkip(false), 3000);
    return () => clearTimeout(t);
  }, [confirmSkip]);

  useEffect(() => {
    setConfirmSkip(false);
  }, [room?.currentRound]);

  // Synchronized timer ticker
  useEffect(() => {
    const t = setInterval(() => {
      setLeft(remainingMs(room));
    }, 100);
    return () => clearInterval(t);
  }, [room]);

  // Convert an iTunes previewUrl to go through our backend proxy
  // (iTunes serves audio/x-m4p which browsers don't support; proxy re-serves as audio/mp4)
  function proxyUrl(url) {
    if (!url) return url;
    if (url.startsWith("https://audio-ssl.itunes.apple.com/")) {
      return `${BACKEND_URL}/api/audio/proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  }

  // Covers come through the backend too: it downloads each round's cover when the match starts, so at the reveal
  // it is served from memory. Same size as revealCoverUrl in backend/src/audio/mediaCache.js.
  function coverUrl(url) {
    if (!url) return "/logo.svg";
    if (/^https:\/\/is\d+-ssl\.mzstatic\.com\//.test(url)) {
      return `${BACKEND_URL}/api/image/proxy?url=${encodeURIComponent(url.replace(/\/\d+x\d+bb\./, "/300x300bb."))}`;
    }
    return url;
  }

  // Track the currently loaded audio source to avoid re-setting it
  const currentAudioSrc = useRef(null);

  // Audio preview playback handling
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !room) return;

    audio.volume = 0.8;

    if (room.phase === "playing" && room.audio?.previewUrl) {
      const src = proxyUrl(room.audio.previewUrl);
      if (currentAudioSrc.current !== room.audio.previewUrl) {
        currentAudioSrc.current = room.audio.previewUrl;
        audio.src = src;
        audio.load();
      }
      const elapsed = Math.max(0, (Date.now() - (room.phaseStartedAt || Date.now())) / 1000);
      if (Math.abs(audio.currentTime - elapsed) > 1.2) {
        try {
          audio.currentTime = elapsed;
        } catch {}
      }
      const p = audio.play();
      if (p !== undefined) {
        p.catch((e) => {
          console.warn("Autoplay waiting for user gesture:", e);
        });
      }
    } else {
      audio.pause();
      if (room.phase === "countdown" && room.audio?.previewUrl) {
        const src = proxyUrl(room.audio.previewUrl);
        if (currentAudioSrc.current !== room.audio.previewUrl) {
          currentAudioSrc.current = room.audio.previewUrl;
          audio.src = src;
          audio.load();
        }
      }
    }
  }, [room?.phase, room?.currentRound, room?.audio?.previewUrl]);

  // Unlock audio on any click/key press if browser blocked initial autoplay
  useEffect(() => {
    const unlock = () => {
      const audio = audioRef.current;
      if (audio && room?.phase === "playing" && audio.paused) {
        audio.play().catch(() => {});
      }
    };
    window.addEventListener("click", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [room?.phase]);

  const isSubmittingRef = useRef(false);

  // Reset local state when a new playing round starts
  useEffect(() => {
    if (room?.phase === "playing") {
      isSubmittingRef.current = false;
      setQuery("");
      setActiveIndex(0);
      setSubmittedSong(null);
      setSkippedRound(null);
      setErr("");
      // Auto-focus input when playing starts
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    }
  }, [room?.phase, room?.currentRound]);

  const playerObj = room?.players?.find((p) => p.id === user?.id);
  const me = playerObj
    ? { ...playerObj, ...(room?.me?.id === user?.id ? room.me : {}), lastAnswer: playerObj.lastAnswer || room?.me?.lastAnswer }
    : room?.me;

  const isHost = room?.hostId === user?.id;
  // Question games (Geografía): a written prompt and a free answer instead of a song and its autocomplete.
  const quiz = Boolean(room?.question) || Boolean(room?.game && room.game !== "musica");
  const skipped = skippedRound === room?.currentRound || Boolean(me?.lastAnswer?.skipped);
  const locked = Boolean(me?.answered) || Boolean(submittedSong) || skipped || room?.phase !== "playing";

  function handleSkip() {
    if (locked) return;
    if (!confirmSkip) {
      setConfirmSkip(true);
      return;
    }
    setConfirmSkip(false);
    setSkippedRound(room.currentRound);
    skipSong().catch((e) => {
      setSkippedRound(null);
      setErr(e.message || (quiz ? "No se pudo saltar la pregunta" : "No se pudo saltar la canción"));
    });
  }
  const totalMs = room?.config?.roundMs || 15000;
  const pct =
    room?.phase === "playing"
      ? Math.max(0, Math.min(100, (left / totalMs) * 100))
      : room?.phase === "countdown"
      ? Math.max(0, Math.min(100, (left / 3000) * 100))
      : 100;

  // Autocomplete: songs whose title matches go first; below them, each artist whose name matches with their songs.
  const suggestionGroups = useMemo(() => {
    const q = normalize(query);
    if (!q || !room?.searchCatalog || locked) return { byTitle: [], byArtist: [] };

    const titleMatches = [];
    const artists = new Map();

    for (const song of room.searchCatalog) {
      const normTitle = normalize(song.title);
      const normArtist = normalize(song.artistName);

      if (normTitle.startsWith(q)) {
        titleMatches.push({ song, score: 100 - (normTitle.length - q.length) });
      } else if (normTitle.includes(q)) {
        titleMatches.push({ song, score: 60 - normTitle.indexOf(q) });
      }

      // Every artist of the song counts, also the second one ("Myke Towers" finds "Pareja Del Año"), but under
      // that artist the songs where they come first go on top and the ones where they are a guest at the bottom.
      splitArtists(song.artistName).forEach((artist, position) => {
        const match = artistMatch(normalize(artist), q);
        if (!match) return;
        const key = normalize(artist);
        if (!artists.has(key)) artists.set(key, { name: artist, match, main: false, songs: [] });
        const group = artists.get(key);
        group.match = Math.max(group.match, match);
        group.main = group.main || position === 0;
        group.songs.push({ song, position });
      });
    }

    titleMatches.sort((a, b) => b.score - a.score);
    const byTitle = titleMatches.slice(0, 8).map((m) => m.song);
    const shown = new Set(byTitle.map((s) => s.id));

    const byArtist = [...artists.values()]
      .sort((a, b) => b.match - a.match || b.main - a.main || a.name.localeCompare(b.name))
      .map((a) => ({
        name: a.name,
        songs: a.songs
          .filter(({ song }) => !shown.has(song.id))
          .sort((x, y) => (x.position > 0) - (y.position > 0) || x.song.title.localeCompare(y.song.title))
          .map(({ song }) => song)
          // A song shows once: in its best group (groups are already sorted best first).
          .filter((song) => !shown.has(song.id) && shown.add(song.id))
          .slice(0, 5),
      }))
      .filter((a) => a.songs.length > 0)
      .slice(0, 4);

    return { byTitle, byArtist };
  }, [query, room?.searchCatalog, locked]);

  // Flat list in display order, for the arrow keys and Enter.
  const suggestions = useMemo(
    () => [...suggestionGroups.byTitle, ...suggestionGroups.byArtist.flatMap((a) => a.songs)],
    [suggestionGroups]
  );

  // Keep active index within bounds
  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions.length]);

  // Ensure active suggestion is visible when using arrow keys
  useEffect(() => {
    if (suggestionsListRef.current && suggestions.length > 0) {
      const item = suggestionsListRef.current.querySelector(`[data-index="${activeIndex}"]`);
      item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex]);

  async function handleSubmitSong(songOrText) {
    if (locked || isSubmittingRef.current) return;
    const titleToDisplay = typeof songOrText === "object" ? songOrText.title : songOrText;
    const valToSend = typeof songOrText === "object" ? (songOrText.id || songOrText.title) : songOrText;
    if (!valToSend || !String(valToSend).trim()) return;

    isSubmittingRef.current = true;
    setSubmittedSong(titleToDisplay);
    setErr("");
    try {
      await answer(valToSend);
    } catch (e) {
      if (room?.phase === "playing") {
        setErr(e.message || "Error al enviar respuesta");
        setSubmittedSong(null);
        isSubmittingRef.current = false;
      }
    }
  }

  function handleKeyDown(e) {
    if (locked) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length > 0) {
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length > 0) {
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (suggestions.length > 0 && suggestions[activeIndex]) {
        handleSubmitSong(suggestions[activeIndex]);
      } else if (query.trim()) {
        handleSubmitSong(query.trim());
      }
    }
  }

  function backToHub({ confirm = false } = {}) {
    if (confirm && !confirmHub) {
      setConfirmHub(true);
      return;
    }
    setConfirmHub(false);
    setGame(null).catch((e) => setErr(e.message || "No se pudo volver a la sala"));
  }

  if (!room) {
    return (
      <div className="tv-card tv-lobby-guest">
        <p className="tv-party-status">
          <span className="tv-pulse" aria-hidden="true" />
          Conectando a la partida…
        </p>
      </div>
    );
  }

  // ==========================================
  // PHASE: FINISHED (podio y resultados)
  // ==========================================
  if (room.phase === "finished" && room.results) {
    return <MatchResults room={room} color="green" />;
  }

  // ==========================================
  // ACTIVE GAME: COUNTDOWN, PLAYING, REVEAL
  // ==========================================
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const urgent = room.phase === "playing" && left <= 4000;

  return (
    <div className="tv-game">
      <audio ref={audioRef} preload="auto" playsInline />

      <div className="tv-game-main">
        <section className="tv-card tv-game-top">
          <div className="tv-game-round">
            <p className="tv-party-kicker">
              Sala {room.code} · {room.mode === "solo" ? "Práctica" : "Multijugador"}
            </p>
            <h1 className="tv-card-title">
              Ronda {room.currentRound + 1} <span className="tv-muted">de {room.totalRounds}</span>
            </h1>
          </div>

          <div className={`tv-clock${urgent ? " is-urgent" : ""}`} role="timer" aria-label={`${seconds} segundos`}>
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle className="tv-clock-track" cx="22" cy="22" r="19" />
              <circle className="tv-clock-fill" cx="22" cy="22" r="19" style={{ strokeDashoffset: 119.4 * (1 - pct / 100) }} />
            </svg>
            <span key={seconds} className="tv-clock-num">{seconds}</span>
          </div>

          <div className="tv-game-tools">
            {isHost && (
              <button
                type="button"
                className={`tv-mini-btn${confirmHub ? " is-on" : ""}`}
                onClick={() => backToHub({ confirm: true })}
                title="Termina la partida y lleva a todos al inicio"
              >
                {confirmHub ? "¿Seguro? Toca otra vez" : "Terminar"}
              </button>
            )}
          </div>

          <div className="tv-timer" aria-hidden="true">
            <span className={`tv-timer-fill${urgent ? " is-urgent" : ""}`} style={{ width: `${pct}%` }} />
          </div>
        </section>

        {room.phase === "countdown" && (
          <section className="tv-card tv-countdown">
            <p className="tv-party-kicker">{quiz ? "Prepárate para leer" : "Prepárate para escuchar"}</p>
            <span key={Math.max(1, seconds)} className="tv-countdown-num">{Math.max(1, seconds)}</span>
            <p className="tv-hint">{quiz ? "Escribe la respuesta en cuanto la sepas." : "Escribe el título en cuanto reconozcas la canción."}</p>
          </section>
        )}

        {room.phase === "playing" && (
          <section className="tv-card tv-play-card">
            {quiz ? (
              <span className="tv-badge tv-c-world" aria-hidden="true">
                <Icon name="globe" size={28} />
              </span>
            ) : (
              <div className="tv-eq" aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => (
                  <span key={i} style={{ "--i": i }} />
                ))}
              </div>
            )}
            <h2 className="tv-play-q">{quiz ? room.question?.prompt : "¿Qué canción está sonando?"}</h2>

            {!locked ? (
              <div className="tv-search">
                <div className="tv-search-box">
                  <Icon name={quiz ? "globe" : "music"} size={22} className="tv-search-icon" />
                  <input
                    ref={inputRef}
                    type="text"
                    className="tv-search-input"
                    placeholder={quiz ? "Escribe tu respuesta…" : "Escribe el título…"}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                    autoFocus
                    spellCheck="false"
                    aria-label={quiz ? "Tu respuesta" : "Título de la canción"}
                    aria-autocomplete="list"
                    aria-controls="tv-suggest"
                  />
                  {query.trim().length > 0 && (
                    <button
                      type="button"
                      className="tv-btn tv-btn--sm tv-c-green"
                      onClick={() => {
                        if (suggestions.length > 0 && suggestions[activeIndex]) {
                          handleSubmitSong(suggestions[activeIndex]);
                        } else if (query.trim()) {
                          handleSubmitSong(query.trim());
                        }
                      }}
                    >
                      Enviar
                    </button>
                  )}
                </div>

                {!query.trim() && (
                  <button
                    type="button"
                    className={`tv-skip-btn${confirmSkip ? " is-on" : ""}`}
                    onClick={handleSkip}
                    aria-live="polite"
                  >
                    <Icon name={confirmSkip ? "lock" : "close"} size={16} strokeWidth={3} />
                    {confirmSkip ? "No te dará puntos. Toca otra vez" : "Saltar"}
                  </button>
                )}

                {!quiz && query.trim().length > 0 && (
                  <div className="tv-suggest" id="tv-suggest">
                    {suggestions.length > 0 ? (
                      <ul className="tv-suggest-list" ref={suggestionsListRef} role="listbox">
                        {suggestions.map((song, index) => {
                          const firstOfArtist =
                            index >= suggestionGroups.byTitle.length &&
                            suggestionGroups.byArtist.find((a) => a.songs[0] === song);
                          return (
                            <Fragment key={song.id}>
                              {firstOfArtist && (
                                <li role="presentation" className="tv-suggest-group" style={{ "--i": index }}>
                                  <Icon name="user" size={14} strokeWidth={2.6} />
                                  {firstOfArtist.name}
                                </li>
                              )}
                              <li role="option" aria-selected={index === activeIndex} data-index={index} style={{ "--i": index }}>
                                <button
                                  type="button"
                                  className={`tv-suggest-item${index === activeIndex ? " is-active" : ""}`}
                                  onClick={() => handleSubmitSong(song)}
                                  onMouseEnter={() => setActiveIndex(index)}
                                >
                                  <span className="tv-suggest-title">{song.title}</span>
                                  <span className="tv-suggest-artist">{song.artistName}</span>
                                  {index === activeIndex && <kbd className="tv-kbd">Enter</kbd>}
                                </button>
                              </li>
                            </Fragment>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="tv-hint tv-suggest-empty">
                        Sin sugerencias. Pulsa <kbd className="tv-kbd">Enter</kbd> para enviar “{query}”.
                      </p>
                    )}
                    <p className="tv-suggest-help">Usa ↑ ↓ y Enter para elegir</p>
                  </div>
                )}
              </div>
            ) : (
              <div className={`tv-locked${skipped ? " is-skipped" : ""}`}>
                <span className="tv-locked-check">
                  <Icon name={skipped ? "close" : "check"} size={28} strokeWidth={3.2} />
                </span>
                <p className="tv-party-kicker">{skipped ? "Sin respuesta" : "Respuesta enviada"}</p>
                <p className="tv-locked-title">
                  {skipped ? "Te la saltaste" : submittedSong || me?.lastAnswer?.text || (quiz ? "Respuesta enviada" : "Canción enviada")}
                </p>
                <p className="tv-hint">Esperando al resto de jugadores…</p>
              </div>
            )}

            {err && <p className="tv-lobby-error" role="alert">{err}</p>}
          </section>
        )}

        {room.phase === "reveal" && room.reveal && (() => {
          const isCorrect = Boolean(me?.lastAnswer?.correct);
          const didAnswer = !skipped && Boolean(me?.lastAnswer?.text || submittedSong);
          const tone = isCorrect ? "ok" : didAnswer ? "bad" : "timeout";
          return (
            <>
              <section className={`tv-card tv-result tv-result--${tone}`} role="status">
                {isCorrect && <Confetti pieces={18} />}
                <span className="tv-result-icon">
                  <Icon name={isCorrect ? "check" : didAnswer ? "lock" : skipped ? "close" : "hash"} size={30} strokeWidth={3} />
                </span>
                <h2 className="tv-result-title">
                  {isCorrect ? "¡Correcto!" : didAnswer ? "Incorrecto" : skipped ? "No te la sabías" : "¡Se acabó el tiempo!"}
                </h2>
                {!isCorrect && (
                  <p className="tv-result-cheer">{CHEERS[(room.currentRound + cheerOffset.current) % CHEERS.length]}</p>
                )}
                <div className="tv-tags tv-tags--center">
                  {isCorrect && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0} pts</span>}
                  {me?.streak > 1 && <span className="tv-tag tv-tag--streak">Racha de {me.streak}</span>}
                </div>
                {didAnswer && !isCorrect && me?.lastAnswer?.text && (
                  <p className="tv-hint">Escribiste “{me.lastAnswer.text}”</p>
                )}
              </section>

              {quiz ? (
                <section className="tv-card tv-song">
                  <span className="tv-badge tv-c-world" aria-hidden="true">
                    <Icon name="globe" size={28} />
                  </span>
                  <div className="tv-song-text">
                    <p className="tv-party-kicker">La respuesta era</p>
                    <h3 className="tv-song-title">{room.reveal.answer}</h3>
                    <p className="tv-song-meta">{room.reveal.prompt}</p>
                  </div>
                </section>
              ) : (
              <section className={`tv-card tv-song${coverReadyFor === room.reveal.title ? "" : " is-waiting"}`}>
                {/* Flips in once the image has loaded, never half-drawn. */}
                <img
                  key={room.reveal.title}
                  className="tv-song-cover"
                  src={coverUrl(room.reveal.image)}
                  alt={`Portada de ${room.reveal.title}`}
                  onLoad={(e) => {
                    e.currentTarget.classList.add("is-loaded");
                    setCoverReadyFor(room.reveal.title);
                  }}
                  onError={(e) => {
                    e.currentTarget.src = "/logo.svg";
                  }}
                />
                <div className="tv-song-text">
                  <p className="tv-party-kicker">Era la canción</p>
                  <h3 className="tv-song-title">{room.reveal.title}</h3>
                  <p className="tv-song-meta">
                    {room.reveal.artistName}
                    {room.reveal.albumName ? ` · ${room.reveal.albumName}` : ""}
                    {room.reveal.year ? ` (${room.reveal.year})` : ""}
                  </p>
                </div>
              </section>
              )}

              <p className="tv-party-status tv-next">
                <span className="tv-pulse" aria-hidden="true" />
                {room.currentRound + 1 >= room.totalRounds ? "Calculando resultados…" : quiz ? "Siguiente pregunta en breve…" : "Siguiente canción en breve…"}
              </p>
            </>
          );
        })()}
      </div>

      <aside className="tv-game-side">
        <MiniBoard players={room.players || []} currentUserId={user?.id} phase={room.phase} />
      </aside>
    </div>
  );
}

export default function Game() {
  const { room } = useApp();
  return (
    <TvShell mode={room?.game || "musica"}>
      <GameScreen />
    </TvShell>
  );
}
