import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import MiniBoard from "../components/MiniBoard.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import { YoavllySymbol } from "../components/YoavllySymbol.jsx";
import { remainingMs, useApp } from "../lib/store.jsx";
import { BACKEND_URL } from "../lib/config.js";

function normalize(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function Game() {
  const { code } = useParams();
  const { user, room, joinRoom, answer, restartGame, leaveRoom } = useApp();
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

  // Join room if disconnected or reloaded
  useEffect(() => {
    if (!room || room.code !== code) {
      joinRoom(code).catch(() => nav("/play"));
    }
  }, [code]);

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

  // If room resets back to lobby
  useEffect(() => {
    if (room?.phase === "lobby") {
      nav(`/lobby/${room.code}`);
    }
  }, [room?.phase, room?.code]);

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

  if (!room) {
    return (
      <div className="card" style={{ maxWidth: 460, margin: "60px auto", textAlign: "center" }}>
        <p className="muted">Sincronizando con el servidor...</p>
      </div>
    );
  }

  // ==========================================
  // PHASE: FINISHED (Podio y Resultados Finales)
  // ==========================================
  if (room.phase === "finished" && room.results) {
    const top = room.results;
    const winner = top[0];
    const second = top[1];
    const third = top[2];

    return (
      <div className="grid page-medium" style={{ gap: 28 }}>
        <div style={{ textAlign: "center" }}>
          <div className="kicker">
            <YoavllySymbol size={16} /> ¡Partida Finalizada!
          </div>
          <h1>
            {top.length > 1 ? `¡Ganó ${winner?.name}!` : "¡Fin de la Partida!"}
          </h1>
          <p className="lead" style={{ margin: "0 auto" }}>
            Revisa el podio de honor, las mejores rachas y las estadísticas completas.
          </p>
        </div>

        {/* Podium */}
        <div className="podium">
          {/* Second Place */}
          {second ? (
            <div className="podium-place second">
              <div style={{ fontSize: 28, marginBottom: 8 }}>🥈</div>
              <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}>
                <UserAvatar
                  avatar={second.avatar}
                  name={second.name}
                  size={52}
                />
              </div>
              <strong style={{ fontSize: 16, display: "block" }}>{second.name}</strong>
              <div style={{ color: "var(--brand)", fontWeight: 900, fontSize: 22, margin: "4px 0" }}>
                {second.score} pts
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {second.correct} aciertos · racha {second.bestStreak}
              </div>
            </div>
          ) : <div style={{ flex: 1 }} />}

          {/* First Place */}
          {winner && (
            <div className="podium-place first">
              <div style={{ fontSize: 36, marginBottom: 4, lineHeight: 1 }}>👑</div>
              <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}>
                <UserAvatar
                  avatar={winner.avatar}
                  name={winner.name}
                  size={68}
                  style={{ boxShadow: "0 8px 24px var(--brand-subtle)" }}
                />
              </div>
              <div className="chip active" style={{ fontSize: 11, marginBottom: 8, padding: "4px 12px" }}>
                1º LUGAR
              </div>
              <strong style={{ fontSize: 20, display: "block" }}>{winner.name}</strong>
              <div style={{ color: "var(--brand)", fontWeight: 900, fontSize: 30, margin: "6px 0" }}>
                {winner.score} pts
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {winner.correct} aciertos · racha {winner.bestStreak}
              </div>
            </div>
          )}

          {/* Third Place */}
          {third ? (
            <div className="podium-place third">
              <div style={{ fontSize: 28, marginBottom: 8 }}>🥉</div>
              <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}>
                <UserAvatar
                  avatar={third.avatar}
                  name={third.name}
                  size={48}
                />
              </div>
              <strong style={{ fontSize: 15, display: "block" }}>{third.name}</strong>
              <div style={{ color: "var(--brand)", fontWeight: 900, fontSize: 20, margin: "4px 0" }}>
                {third.score} pts
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {third.correct} aciertos · racha {third.bestStreak}
              </div>
            </div>
          ) : <div style={{ flex: 1 }} />}
        </div>

        {/* Detailed Stats Table */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ margin: "0 0 16px" }}>Desglose de la partida</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Jugador</th>
                  <th>Puntos</th>
                  <th>Aciertos</th>
                  <th>Mejor Racha</th>
                  <th>Tiempo Promedio</th>
                </tr>
              </thead>
              <tbody>
                {top.map((p) => (
                  <tr key={p.id}>
                    <td><strong>#{p.position}</strong></td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <UserAvatar
                          avatar={p.avatar}
                          name={p.name}
                          size={26}
                        />
                        <span>{p.name}</span>
                      </div>
                    </td>
                    <td><strong>{p.score}</strong></td>
                    <td>{p.correct}</td>
                    <td>🔥 {p.bestStreak}</td>
                    <td>{p.avgMs ? `${(p.avgMs / 1000).toFixed(1)}s` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Controls */}
        <div className="row" style={{ justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          {isHost ? (
            <button className="btn primary lg" onClick={restartGame}>
              Jugar de Nuevo
            </button>
          ) : (
            <span className="muted">Esperando a que el host reinicie la partida...</span>
          )}

          <button
            className="btn ghost lg"
            onClick={() => {
              leaveRoom();
              nav("/play");
            }}
          >
            Salir al Menú
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // ACTIVE GAME SHELL: COUNTDOWN, PLAYING, REVEAL
  // ==========================================
  return (
    <div className="game-layout">
      {/* Hidden audio element for preview stream */}
      <audio ref={audioRef} preload="auto" playsInline />

      {/* Main Game Screen */}
      <div className="game-main">
        {/* Top Info Bar */}
        <div className="game-topbar">
          <div>
            <div className="kicker" style={{ fontSize: 11, marginBottom: 2 }}>
              Sala {room.code} · Modo {room.mode === "solo" ? "Práctica" : "Multijugador"}
            </div>
            <h2 style={{ margin: 0, fontSize: 20 }}>
              Ronda {room.currentRound + 1} de {room.totalRounds}
            </h2>
          </div>

          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <button
              type="button"
              className="btn ghost sm"
              style={{ fontSize: 12, padding: "5px 12px", color: "var(--text-muted)" }}
              onClick={() => {
                if (window.confirm("¿Seguro que deseas salir de la partida?")) {
                  leaveRoom();
                  nav("/play");
                }
              }}
              title="Salir de la partida actual"
            >
              ✕ Salir
            </button>

            <div
              style={{
                fontFamily: "'Outfit', monospace",
                fontWeight: 900,
                fontSize: 22,
                color: left <= 4000 && room.phase === "playing" ? "var(--bad)" : "var(--brand)",
              }}
            >
              ⏱️ {Math.max(0, Math.ceil(left / 1000))}s
            </div>
          </div>
        </div>

        {/* Dynamic Timer Bar */}
        <div className="timer-bar-wrap">
          <div
            className={`timer-bar-fill ${left <= 4000 && room.phase === "playing" ? "urgent" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* 1. COUNTDOWN PHASE */}
        {room.phase === "countdown" && (
          <div className="countdown-box">
            <div className="kicker" style={{ fontSize: 13 }}>
              <YoavllySymbol size={16} /> Prepárate para escuchar
            </div>
            <div className="countdown-number">
              {Math.max(1, Math.ceil(left / 1000))}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>
              Escucha atentamente. Escribe el título de la canción tan pronto como la reconozcas.
            </p>
          </div>
        )}

        {/* 2. PLAYING PHASE (TYPING & AUTOCOMPLETE SLIDE BAR) */}
        {room.phase === "playing" && (
          <div className="grid" style={{ gap: 20 }}>
            <div style={{ textAlign: "center" }}>
              <h2 style={{ fontSize: 24, margin: "0 0 6px" }}>¿Qué canción estás escuchando?</h2>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                Escribe el nombre y selecciona una sugerencia al instante
              </p>
            </div>

            {/* Sonic Pulse Equalizer Wave */}
            <div className="sound-pulse">
              <span className="sound-wave-bar" />
              <span className="sound-wave-bar" />
              <span className="sound-wave-bar" />
              <span className="sound-wave-bar" />
              <span className="sound-wave-bar" />
              <span className="sound-wave-bar" />
            </div>

            {/* Guess Typing Interface */}
            {!locked ? (
              <div className="yoavlly-search-container">
                <div className="yoavlly-input-wrapper">
                  <span className="yoavlly-input-icon">🎵</span>
                  <input
                    ref={inputRef}
                    type="text"
                    className="yoavlly-search-input"
                    placeholder="Escribe la canción (Ej. Andrea)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                    autoFocus
                    spellCheck="false"
                  />
                  {query.trim().length > 0 && (
                    <button
                      type="button"
                      className="yoavlly-search-submit-btn"
                      onClick={() => {
                        if (suggestions.length > 0 && suggestions[activeIndex]) {
                          handleSubmitSong(suggestions[activeIndex]);
                        } else if (query.trim()) {
                          handleSubmitSong(query.trim());
                        }
                      }}
                      title="Enviar respuesta (Enter)"
                    >
                      Enviar ↵
                    </button>
                  )}
                </div>

                {/* Animated Dropdown / Slide Bar with matching songs */}
                {query.trim().length > 0 && (
                  <div className="yoavlly-suggestions-slidebar">
                    <div className="yoavlly-suggestions-header">
                      <span>Sugerencias ({suggestions.length})</span>
                      <span className="yoavlly-keyboard-hint">Usa ↑ ↓ y Enter para elegir</span>
                    </div>

                    {suggestions.length > 0 ? (
                      <div className="yoavlly-suggestions-list" ref={suggestionsListRef}>
                        {suggestions.map((song, index) => {
                          const isSelected = index === activeIndex;
                          return (
                            <div
                              key={song.id}
                              className={`yoavlly-suggestion-item ${isSelected ? "active" : ""}`}
                              onClick={() => handleSubmitSong(song)}
                              onMouseEnter={() => setActiveIndex(index)}
                            >
                              <div className="yoavlly-suggestion-icon">🎶</div>
                              <div className="yoavlly-suggestion-info">
                                <span className="yoavlly-suggestion-title">{song.title}</span>
                                <span className="yoavlly-suggestion-artist">{song.artistName}</span>
                              </div>
                              {isSelected && (
                                <span className="yoavlly-select-badge">Enter ↵</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="yoavlly-no-suggestions">
                        <span>No encontramos una sugerencia exacta, pero puedes presionar <strong>Enter</strong> para enviar "<strong>{query}</strong>".</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Locked Answer Display */
              <div className="yoavlly-locked-container">
                <div className="yoavlly-locked-card">
                  <div className="yoavlly-locked-badge">✓ Respuesta Registrada</div>
                  <h3 className="yoavlly-locked-title">
                    {submittedSong || me?.lastAnswer?.text || "Canción enviada"}
                  </h3>
                  <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
                    Esperando a que termine el tiempo o a que los demás jugadores respondan...
                  </p>
                </div>
              </div>
            )}

            {err && <p className="error" style={{ textAlign: "center", margin: 0 }}>{err}</p>}
          </div>
        )}

        {/* 3. REVEAL PHASE (RESULTADO DE LA RONDA) */}
        {room.phase === "reveal" && room.reveal && (
          <div className="grid" style={{ gap: 20 }}>
            {/* Feedback Banner */}
            {(() => {
              const isCorrect = Boolean(me?.lastAnswer?.correct);
              const didAnswer = Boolean(me?.lastAnswer?.text || submittedSong);

              return (
                <div
                  className={`card ${isCorrect ? "anim-win-banner" : didAnswer ? "anim-lose-banner" : ""}`}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    padding: "24px 28px",
                    textAlign: "center",
                    background: isCorrect
                      ? "var(--ok-subtle)"
                      : didAnswer
                      ? "var(--bad-subtle)"
                      : "var(--amber-subtle)",
                    borderColor: isCorrect
                      ? "var(--ok-border)"
                      : didAnswer
                      ? "var(--bad-border)"
                      : "var(--border)",
                  }}
                >
                  <div style={{ fontSize: 38, marginBottom: 8 }}>
                    {isCorrect ? "🎉" : didAnswer ? "❌" : "⌛"}
                  </div>

                  <h2 style={{ margin: "0 0 6px", fontSize: 24 }}>
                    {isCorrect
                      ? "¡Correcto! Excelente oído"
                      : didAnswer
                      ? "Respuesta Incorrecta"
                      : "¡Se agotó el tiempo!"}
                  </h2>

                  <div className="row" style={{ justifyContent: "center", gap: 12, margin: "8px 0" }}>
                    {isCorrect && (
                      <span className="chip ok" style={{ fontSize: 14, fontWeight: 800 }}>
                        +{me?.lastPoints || 0} pts
                      </span>
                    )}

                    {me?.streak > 1 && (
                      <span className="chip streak" style={{ fontSize: 14 }}>
                        🔥 Racha de {me.streak}
                      </span>
                    )}
                  </div>

                  {didAnswer && !isCorrect && me?.lastAnswer?.text && (
                    <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                      Escribiste: <em>"{me.lastAnswer.text}"</em>
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Reveal Song Card */}
            <div
              className="card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                padding: 20,
                background: "var(--bg-surface)",
              }}
            >
              <img
                src={room.reveal.image || "/artists/bad-bunny.jpg"}
                alt={room.reveal.title}
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: 12,
                  objectFit: "cover",
                  boxShadow: "var(--shadow-md)",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="kicker" style={{ fontSize: 11, marginBottom: 4 }}>
                  Era la canción:
                </div>
                <h3 style={{ margin: "0 0 4px", fontSize: 22, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {room.reveal.title}
                </h3>
                <p className="muted" style={{ margin: 0, fontSize: 15 }}>
                  {room.reveal.artistName}
                  {room.reveal.albumName ? ` · ${room.reveal.albumName}` : ""}
                  {room.reveal.year ? ` (${room.reveal.year})` : ""}
                </p>
              </div>
            </div>

            <div style={{ textAlign: "center" }}>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                {room.currentRound + 1 >= room.totalRounds
                  ? "Cargando resultados finales..."
                  : "Siguiente canción en breve..."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Realtime Players Sidebar */}
      <aside className="game-sidebar">
        <MiniBoard
          players={room.players || []}
          currentUserId={user?.id}
          phase={room.phase}
        />
      </aside>
    </div>
  );
}
