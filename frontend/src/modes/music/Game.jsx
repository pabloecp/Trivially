import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MiniBoard from "../../components/MiniBoard.jsx";
import TvShell from "../../components/home/TvShell.jsx";
import Avatar from "../../components/home/Avatar.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import CountUp from "../../components/home/CountUp.jsx";
import Icon from "../../components/home/Icon.jsx";
import PlayerName from "../../components/home/PlayerName.jsx";
import { remainingMs, useApp } from "../../lib/store.jsx";
import { BACKEND_URL } from "../../lib/config.js";

function normalize(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function GameScreen() {
  const { code } = useParams();
  const { user, room, joinRoom, answer, restartGame, leaveRoom, setGame } = useApp();
  const nav = useNavigate();

  const audioRef = useRef(null);
  const inputRef = useRef(null);
  const suggestionsListRef = useRef(null);

  const [left, setLeft] = useState(0);
  const [err, setErr] = useState("");

  // Search & autocomplete state
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [submittedSong, setSubmittedSong] = useState(null);
  // Host's "back to the main room" mid-match needs a second tap, since it ends the match for everyone.
  const [confirmHub, setConfirmHub] = useState(false);

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
  const locked = Boolean(me?.answered) || Boolean(submittedSong) || room?.phase !== "playing";
  const totalMs = room?.config?.roundMs || 15000;
  const pct =
    room?.phase === "playing"
      ? Math.max(0, Math.min(100, (left / totalMs) * 100))
      : room?.phase === "countdown"
      ? Math.max(0, Math.min(100, (left / 3000) * 100))
      : 100;

  // Filter autocomplete suggestions based on user search query
  const suggestions = useMemo(() => {
    const q = normalize(query);
    if (!q || !room?.searchCatalog || locked) return [];

    const list = room.searchCatalog;
    const matches = [];

    for (const song of list) {
      const normTitle = normalize(song.title);
      const normArtist = normalize(song.artistName);

      if (normTitle.startsWith(q)) {
        matches.push({ song, score: 100 - (normTitle.length - q.length) });
      } else if (normTitle.includes(q)) {
        matches.push({ song, score: 60 - normTitle.indexOf(q) });
      } else if (normArtist.startsWith(q) || normArtist.includes(q)) {
        matches.push({ song, score: 30 });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, 8).map((m) => m.song);
  }, [query, room?.searchCatalog, locked]);

  // Keep active index within bounds
  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions.length]);

  // Ensure active suggestion is visible when using arrow keys
  useEffect(() => {
    if (suggestionsListRef.current && suggestions.length > 0) {
      const items = suggestionsListRef.current.children;
      if (items[activeIndex]) {
        items[activeIndex].scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
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
    const top = room.results;
    const winner = top[0];
    const podium = [top[1], top[0], top[2]]; // 2nd, 1st, 3rd

    return (
      <div className="tv-page tv-results">
        <Confetti />
        <header className="tv-results-head">
          <p className="tv-party-kicker">Partida terminada</p>
          <h1 className="tv-page-title tv-results-title">
            {top.length > 1 ? `¡Ganó ${winner?.name}!` : "¡Fin de la partida!"}
          </h1>
        </header>

        <div className="tv-podium" role="list" aria-label="Podio">
          {podium.map((p, i) => {
            const place = i === 1 ? 1 : i === 0 ? 2 : 3;
            if (!p) return <div key={place} className="tv-podium-spot is-empty" aria-hidden="true" />;
            return (
              <div key={p.id} role="listitem" className={`tv-podium-spot is-${place}`}>
                <span className="tv-podium-avatar">
                  {place === 1 && <Icon name="crown" size={30} filled strokeWidth={1.6} className="tv-podium-crown" />}
                  <Avatar name={p.name} avatar={p.avatar} className={place === 1 ? "tv-avatar--lg" : ""} />
                </span>
                <PlayerName player={p} className="tv-podium-name" />
                <span className="tv-podium-score">
                  <CountUp value={p.score} /> pts
                </span>
                <div className="tv-podium-block">
                  <span className="tv-podium-place">{place}</span>
                </div>
              </div>
            );
          })}
        </div>

        <section className="tv-card" aria-labelledby="tv-breakdown">
          <h2 id="tv-breakdown" className="tv-card-title">Resultados</h2>
          <ol className="tv-rank-list">
            {top.map((p, i) => (
              <li key={p.id} className={`tv-rank-row${p.id === user?.id ? " is-me" : ""}`} style={{ "--i": i }}>
                <span className="tv-rank-pos">{p.position}</span>
                <Avatar name={p.name} avatar={p.avatar} />
                <span className="tv-rank-name">
                  <PlayerName player={p} />
                  <span className="tv-rank-meta">
                    {p.correct} aciertos · racha {p.bestStreak}
                    {p.avgMs ? ` · ${(p.avgMs / 1000).toFixed(1)} s` : ""}
                  </span>
                </span>
                <span className="tv-rank-score">{p.score}</span>
              </li>
            ))}
          </ol>
        </section>

        {err && <p className="tv-lobby-error" role="alert">{err}</p>}

        <div className="tv-results-actions">
          {isHost ? (
            <>
              <button className="tv-btn tv-btn--block tv-c-green" onClick={restartGame} type="button">
                <Icon name="play" size={20} filled strokeWidth={1.5} />
                Volver al lobby
              </button>
              <button className="tv-btn tv-c-neutral" onClick={() => backToHub()} type="button">
                <Icon name="home" size={18} />
                Elegir otro juego
              </button>
            </>
          ) : (
            <p className="tv-party-status">
              <span className="tv-pulse" aria-hidden="true" />
              Esperando a que el anfitrión decida qué jugar…
            </p>
          )}
          <button
            type="button"
            className="tv-link-btn"
            onClick={() => {
              leaveRoom();
              nav("/");
            }}
          >
            <Icon name="logout" size={18} />
            Salir de la sala
          </button>
        </div>
      </div>
    );
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
            <button
              type="button"
              className="tv-icon-btn tv-icon-btn--sm"
              aria-label="Salir de la partida"
              onClick={() => {
                if (window.confirm("¿Seguro que quieres salir de la partida?")) {
                  leaveRoom();
                  nav("/");
                }
              }}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>

          <div className="tv-timer" aria-hidden="true">
            <span className={`tv-timer-fill${urgent ? " is-urgent" : ""}`} style={{ width: `${pct}%` }} />
          </div>
        </section>

        {room.phase === "countdown" && (
          <section className="tv-card tv-countdown">
            <p className="tv-party-kicker">Prepárate para escuchar</p>
            <span key={Math.max(1, seconds)} className="tv-countdown-num">{Math.max(1, seconds)}</span>
            <p className="tv-hint">Escribe el título en cuanto reconozcas la canción.</p>
          </section>
        )}

        {room.phase === "playing" && (
          <section className="tv-card tv-play-card">
            <div className="tv-eq" aria-hidden="true">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} style={{ "--i": i }} />
              ))}
            </div>
            <h2 className="tv-play-q">¿Qué canción está sonando?</h2>

            {!locked ? (
              <div className="tv-search">
                <div className="tv-search-box">
                  <Icon name="music" size={22} className="tv-search-icon" />
                  <input
                    ref={inputRef}
                    type="text"
                    className="tv-search-input"
                    placeholder="Escribe el título…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                    autoFocus
                    spellCheck="false"
                    aria-label="Título de la canción"
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

                {query.trim().length > 0 && (
                  <div className="tv-suggest" id="tv-suggest">
                    {suggestions.length > 0 ? (
                      <ul className="tv-suggest-list" ref={suggestionsListRef} role="listbox">
                        {suggestions.map((song, index) => (
                          <li key={song.id} role="option" aria-selected={index === activeIndex} style={{ "--i": index }}>
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
                        ))}
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
              <div className="tv-locked">
                <span className="tv-locked-check">
                  <Icon name="check" size={28} strokeWidth={3.2} />
                </span>
                <p className="tv-party-kicker">Respuesta enviada</p>
                <p className="tv-locked-title">{submittedSong || me?.lastAnswer?.text || "Canción enviada"}</p>
                <p className="tv-hint">Esperando al resto de jugadores…</p>
              </div>
            )}

            {err && <p className="tv-lobby-error" role="alert">{err}</p>}
          </section>
        )}

        {room.phase === "reveal" && room.reveal && (() => {
          const isCorrect = Boolean(me?.lastAnswer?.correct);
          const didAnswer = Boolean(me?.lastAnswer?.text || submittedSong);
          const tone = isCorrect ? "ok" : didAnswer ? "bad" : "timeout";
          return (
            <>
              <section className={`tv-card tv-result tv-result--${tone}`} role="status">
                {isCorrect && <Confetti pieces={18} />}
                <span className="tv-result-icon">
                  <Icon name={isCorrect ? "check" : didAnswer ? "lock" : "hash"} size={30} strokeWidth={3} />
                </span>
                <h2 className="tv-result-title">
                  {isCorrect ? "¡Correcto!" : didAnswer ? "Incorrecto" : "¡Se acabó el tiempo!"}
                </h2>
                <div className="tv-tags tv-tags--center">
                  {isCorrect && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0} pts</span>}
                  {me?.streak > 1 && <span className="tv-tag tv-tag--streak">Racha de {me.streak}</span>}
                </div>
                {didAnswer && !isCorrect && me?.lastAnswer?.text && (
                  <p className="tv-hint">Escribiste “{me.lastAnswer.text}”</p>
                )}
              </section>

              <section className="tv-card tv-song">
                <img
                  className="tv-song-cover"
                  src={room.reveal.image || "/artists/bad-bunny.jpg"}
                  alt={`Portada de ${room.reveal.title}`}
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

              <p className="tv-party-status tv-next">
                <span className="tv-pulse" aria-hidden="true" />
                {room.currentRound + 1 >= room.totalRounds ? "Calculando resultados…" : "Siguiente canción en breve…"}
              </p>
            </>
          );
        })()}
      </div>

      <aside className="tv-game-side">
        <MiniBoard players={room.players || []} currentUserId={user?.id} />
      </aside>
    </div>
  );
}

export default function Game() {
  return (
    <TvShell mode="musica">
      <GameScreen />
    </TvShell>
  );
}
