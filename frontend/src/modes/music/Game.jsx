import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TvShell from "../../components/home/TvShell.jsx";
import Confetti from "../../components/home/Confetti.jsx";
import Icon from "../../components/home/Icon.jsx";
import AnswerSkip from "../../components/home/AnswerSkip.jsx";
import WaitingPill, { waitingNames } from "../../components/home/WaitingPill.jsx";
import PartyPanel from "../../components/home/PartyPanel.jsx";
import SpectatorBanner from "../../components/home/SpectatorBanner.jsx";
import MatchResults from "../../components/home/MatchResults.jsx";
import { ControllerBar, GetReady, PhoneHint, RoomVerdict } from "../../components/home/CentralBits.jsx";
import { useApp, useRemainingMs, useView } from "../../lib/store.jsx";
import { BACKEND_URL } from "../../lib/config.js";
import { useSongList } from "../../lib/songList.js";
import { useMasterVolume } from "../../lib/volume.js";
import { createLyricPlayer } from "./lyricAudio.js";
import "../../styles/quiz.css";
import { PauseButton, ReportButton, SkipButton, PauseVeil } from "../../components/home/PauseControls.jsx";
import { resolveCode } from "../../lib/hiddenCode.js";
import { MatchBar, MatchCard, MatchQuestion } from "../../components/home/MatchFrame.jsx";

// A closed round's four songs keep the same letters and colours as Trivia's options.
const OPTION_LETTERS = ["A", "B", "C", "D"];
// Keys that pick an option while a closed round is open: 1–4 or A–D.
const OPTION_KEYS = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };

function normalize(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// The same song once in the list even when it's saved twice ("ADIVINO" by Myke Towers, and by Myke Towers & Bad Bunny).
function songKey(song) {
  const artist = String(song.artistName || "").split(/\s*(?:&|,|\bfeat\.?|\bft\.?|\bx\b|\by\b)\s*/i)[0];
  return `${normalize(song.title)}|${normalize(artist)}`;
}

// Every artist of a song, the last after "&" (like the server's joinArtists): "Tyler, The Creator & Kali Uchis".
function joinArtists(list) {
  const names = Array.isArray(list) ? list.filter(Boolean) : [];
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}` : names[0] || "";
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
  const { code: codeParam } = useParams();
  const { user, room, joinRoom, answer, skipSong, restartGame } = useApp();
  // The address's code ("oculta" while it's hidden: this tab's room, lib/hiddenCode.js).
  const code = resolveCode(codeParam, room);
  const nav = useNavigate();
  // With a central device in the room, the song plays there and shows the round; the players' phones only have the
  // options or the search box (and say how their round went).
  const { central, controller, viewerId } = useView(room);

  const audioRef = useRef(null);
  const inputRef = useRef(null);
  const suggestionsListRef = useRef(null);
  const cheerOffset = useRef(Math.floor(Math.random() * CHEERS.length));

  const left = useRemainingMs(room);
  const [err, setErr] = useState("");

  // Search & autocomplete state
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [submittedSong, setSubmittedSong] = useState(null);
  // Round in which this player tapped "Saltar" (shown right away, before the server confirms).
  const [skippedRound, setSkippedRound] = useState(null);
  // The option picked in a closed round: { round, index }.
  const [pickedChoice, setPickedChoice] = useState(null);
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

  // Convert an iTunes previewUrl to go through our backend proxy
  // (iTunes serves audio/x-m4p which browsers don't support; proxy re-serves as audio/mp4)
  function proxyUrl(url) {
    if (!url) return url;
    // Spotify's previews too (public playlists pasted as a link): downloaded ahead by the server, like iTunes'.
    if (url.startsWith("https://audio-ssl.itunes.apple.com/") || url.startsWith("https://p.scdn.co/mp3-preview/")) {
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

  // The songs play at 80% of the page's volume (the button in the top bar, lib/volume.js).
  useMasterVolume(audioRef, 0.8);

  // Track the currently loaded audio source to avoid re-setting it
  const currentAudioSrc = useRef(null);

  // Completa la letra: the verse with its gap, and where the song is heard from and stops (ms of its preview).
  const lyrics = room?.lyrics || null;
  // The song already stopped at the gap in this round (its round number).
  const [cutRound, setCutRound] = useState(null);
  // The song as the reveal plays it on from the cut (room.audio only goes out until the round ends).
  const lyricRevealUrl = room?.phase === "reveal" && lyrics ? room.reveal?.previewUrl : null;

  // Audio preview playback handling
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !room) return;
    // The room's central device plays the song for everyone: a phone beside it stays quiet.
    if (controller) {
      audio.pause();
      return;
    }
    const load = (url) => {
      if (currentAudioSrc.current !== url) {
        currentAudioSrc.current = url;
        audio.src = proxyUrl(url);
        audio.load();
      }
    };
    const play = () => {
      const p = audio.play();
      if (p !== undefined) p.catch((e) => console.warn("Autoplay waiting for user gesture:", e));
    };
    const elapsed = Math.max(0, (Date.now() - (room.phaseStartedAt || Date.now())) / 1000);

    // Completa la letra plays through Web Audio (lyricPlayer, below): this element stays quiet.
    if (lyrics) {
      audio.pause();
      return;
    }

    // Paused by the host: the song stops, and on "Reanudar" it goes on from the same moment (phaseStartedAt moves).
    if (room.phase === "playing" && room.audio?.previewUrl && !room.paused) {
      load(room.audio.previewUrl);
      // A preview shorter than the round (Spotify's last 15–22 s, iTunes' 30 s) starts again instead of going quiet.
      audio.loop = true;
      const target = Number.isFinite(audio.duration) && audio.duration > 0 ? elapsed % audio.duration : elapsed;
      if (Math.abs(audio.currentTime - target) > 1.2) {
        try {
          audio.currentTime = target;
        } catch {}
      }
      play();
    } else {
      audio.pause();
      if (room.phase === "countdown" && room.audio?.previewUrl) load(room.audio.previewUrl);
    }
  }, [room?.phase, room?.currentRound, room?.audio?.previewUrl, lyricRevealUrl, lyrics?.cutMs, Boolean(room?.paused), room?.phaseStartedAt, controller]);

  // Completa la letra's song, cut to the sample (lyricAudio.js): downloaded and decoded during the countdown; while the
  // round plays, from `startMs` (where the room is) to the cut, exactly; at the reveal, from `revealFromMs` on. A pause
  // stops it, and "Reanudar" picks up from the same moment (phaseStartedAt moves).
  const lyricPlayer = useMemo(() => createLyricPlayer(), []);
  useEffect(() => () => lyricPlayer.stop(), [lyricPlayer]);
  useEffect(() => {
    if (!lyrics || controller || !room) return undefined;
    const elapsed = () => Math.max(0, (Date.now() - (room.phaseStartedAt || Date.now())) / 1000);
    if (room.phase === "countdown" && room.audio?.previewUrl) {
      lyricPlayer.load(proxyUrl(room.audio.previewUrl)).catch(() => {});
      return undefined;
    }
    if (room.paused) {
      lyricPlayer.stop();
      return undefined;
    }
    const round = room.currentRound;
    if (room.phase === "playing" && room.audio?.previewUrl) {
      // Quiet only while the answer is sung, then the rest of its line ("de mí"), then it stops.
      const then = lyrics.stopMs > lyrics.backMs ? { back: lyrics.backMs / 1000, stop: lyrics.stopMs / 1000 } : null;
      lyricPlayer.play(proxyUrl(room.audio.previewUrl), () => lyrics.startMs / 1000 + elapsed(), lyrics.cutMs / 1000, () => setCutRound(round), then);
    } else if (lyricRevealUrl) {
      lyricPlayer.play(proxyUrl(lyricRevealUrl), () => (lyrics.revealFromMs ?? lyrics.cutMs) / 1000 + elapsed());
    }
    return () => lyricPlayer.stop();
  }, [Boolean(lyrics), room?.phase, room?.currentRound, room?.audio?.previewUrl, lyricRevealUrl, Boolean(room?.paused), room?.phaseStartedAt, controller]);

  // Completa la letra: where the song is (seconds of its preview), for the lyrics to follow it like Spotify's: the
  // audio's own position while it plays here (it may have started late), else the room's clock.
  const [lyricPos, setLyricPos] = useState(0);
  useEffect(() => {
    if (!lyrics) return undefined;
    const tick = () => {
      // Paused: the lyrics stay where they were.
      if (room.paused) return;
      const elapsed = Math.max(0, (Date.now() - (room.phaseStartedAt || Date.now())) / 1000);
      let pos = lyrics.startMs / 1000;
      const lastHeard = Math.max(lyrics.cutMs, lyrics.stopMs || 0) / 1000;
      if (room.phase === "playing") pos = Math.min(lastHeard, lyrics.startMs / 1000 + elapsed);
      else if (room.phase === "reveal" || room.phase === "finished") pos = (lyrics.revealFromMs ?? lyrics.cutMs) / 1000 + elapsed;
      const heard = lyricPlayer.position();
      if (heard != null && (room.phase === "playing" || room.phase === "reveal")) {
        pos = room.phase === "playing" ? Math.min(lastHeard, heard) : heard;
      }
      setLyricPos(pos);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [Boolean(lyrics), room?.phase, room?.currentRound, room?.phaseStartedAt, Boolean(room?.paused), controller]);

  // Unlock audio on any click/key press if browser blocked initial autoplay
  useEffect(() => {
    const unlock = () => {
      const audio = audioRef.current;
      // Completa la letra's song plays through Web Audio, which a tap lets start.
      if (lyrics) return lyricPlayer.unlock();
      if (audio && !controller && room?.phase === "playing" && !room?.paused && audio.paused) {
        audio.play().catch(() => {});
      }
    };
    window.addEventListener("click", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [room?.phase, room?.paused, controller, Boolean(lyrics), cutRound, room?.currentRound]);

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

  const playerObj = room?.players?.find((p) => p.id === viewerId);
  const me = central
    ? null
    : playerObj
    ? { ...playerObj, ...(room?.me?.id === user?.id ? room.me : {}), lastAnswer: playerObj.lastAnswer || room?.me?.lastAnswer }
    : room?.me;

  const isHost = !central && room?.hostId === user?.id;
  const skipped = skippedRound === room?.currentRound || Boolean(me?.lastAnswer?.skipped);
  const spectator = Boolean(me?.spectator);
  const locked = Boolean(me?.answered) || Boolean(submittedSong) || skipped || room?.phase !== "playing" || spectator || central;

  // A closed round ("Preguntas Cerradas"): four songs to choose from instead of the search box.
  const choice = room?.choice || null;
  const closed = choice?.type === "choice";
  const myChoice = Number.isInteger(me?.lastAnswer?.choice) ? me.lastAnswer.choice : pickedChoice?.round === room?.currentRound ? pickedChoice.index : null;

  async function handleChoose(index) {
    if (locked || isSubmittingRef.current || !choice?.options?.[index]) return;
    isSubmittingRef.current = true;
    setPickedChoice({ round: room.currentRound, index });
    setSubmittedSong(choice.options[index]);
    setErr("");
    try {
      await answer(index);
    } catch (e) {
      if (room?.phase === "playing") {
        setErr(e.message || "Error al enviar respuesta");
        setSubmittedSong(null);
        setPickedChoice(null);
        isSubmittingRef.current = false;
      }
    }
  }

  // 1–4 or A–D pick an option of a closed round.
  useEffect(() => {
    if (!closed || locked || room?.phase !== "playing") return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const index = OPTION_KEYS[e.key.toLowerCase()];
      if (index != null && index < (choice?.options?.length || 0)) {
        e.preventDefault();
        handleChoose(index);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      setErr(e.message || "No se pudo saltar la canción");
    });
  }
  // Completa la letra's round also has the bit of song before the cut.
  const totalMs = lyrics?.roundMs || room?.config?.roundMs || 15000;
  const pct =
    room?.phase === "playing"
      ? Math.max(0, Math.min(100, (left / totalMs) * 100))
      : room?.phase === "countdown"
      ? Math.max(0, Math.min(100, (left / 3000) * 100))
      : 100;

  // Every song in the database (downloaded once) plus what this room adds, e.g. its Spotify songs still loading.
  const allSongs = useSongList();
  const searchList = useMemo(() => {
    const extras = room?.searchCatalog || [];
    if (!extras.length) return allSongs;
    const ids = new Set(allSongs.map((s) => s.id));
    return [...allSongs, ...extras.filter((s) => !ids.has(s.id))];
  }, [allSongs, room?.searchCatalog]);

  // Autocomplete by song name only: titles that start with what was typed first, then titles that contain it.
  const suggestions = useMemo(() => {
    const q = normalize(query);
    // Completa la letra's words are written as they are: no songs to suggest.
    if (!q || locked || lyrics) return [];
    const matches = [];
    const seen = new Set();
    for (const song of searchList) {
      const key = songKey(song);
      if (seen.has(key)) continue;
      seen.add(key);
      const title = normalize(song.title);
      if (title.startsWith(q)) matches.push({ song, score: 100 - (title.length - q.length) });
      else if (title.includes(q)) matches.push({ song, score: 60 - title.indexOf(q) });
    }
    matches.sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));
    return matches.slice(0, 12).map((m) => m.song);
  }, [query, searchList, locked, Boolean(lyrics)]);

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

  // Time running out with a title written: it goes on its own (the highlighted suggestion, or what was typed), as if
  // "Enviar" had been pressed.
  useEffect(() => {
    if (room?.phase !== "playing" || locked || closed || !query.trim() || left <= 0 || left > 500) return;
    handleSubmitSong(suggestions.length > 0 && suggestions[activeIndex] ? suggestions[activeIndex] : query.trim());
  }, [left]);

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
    restartGame().catch((e) => setErr(e.message || "No se pudo volver a la sala"));
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
    return <MatchResults room={room} />;
  }

  // ==========================================
  // ACTIVE GAME: COUNTDOWN, PLAYING, REVEAL
  // ==========================================
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const urgent = room.phase === "playing" && left <= 4000;

  // The host's controls of the match: in the round's card, or in the thin bar of a phone beside a central device.
  const tools = (
    <>
      <ReportButton room={room} onError={setErr} />
      <SkipButton room={room} onError={setErr} />
      <PauseButton room={room} isHost={isHost} onError={setErr} />
      {isHost && (
        <button
          type="button"
          className={`tv-mini-btn tv-end-btn${confirmHub ? " is-on" : ""}`}
          onClick={() => backToHub({ confirm: true })}
        >
          {confirmHub ? "¿Seguro? Toca otra vez" : "Terminar"}
        </button>
      )}
    </>
  );

  return (
    <div className={`tv-room tv-game tv-match${central ? " is-central" : ""}${controller ? " is-controller" : ""}`}>
      <audio ref={audioRef} preload="auto" playsInline />

      <div className="tv-room-main tv-game-main">
        {spectator && <SpectatorBanner />}
        {/* Beside a central device the round and the clock are on the big screen: only the ways to answer here. */}
        {controller ? (
          <ControllerBar seconds={seconds} pct={pct} urgent={urgent}>
            {tools}
          </ControllerBar>
        ) : (
          <MatchCard
            room={room}
            size={lyrics ? "s" : "m"}
            label={`${lyrics ? "Letra" : "Título"} · ${closed ? "Cerradas" : "Abiertas"}`}
            icon="music"
            dir={
              lyrics
                ? closed
                  ? "La canción se corta: elige la palabra que sigue"
                  : "La canción se corta: escribe la palabra que sigue"
                : closed
                ? "Escucha el fragmento y elige qué canción es · más rápido, más puntos"
                : "Escucha el fragmento y escribe su título · más rápido, más puntos"
            }
            seconds={seconds}
            pct={pct}
            urgent={urgent}
          >
            {lyrics ? (
              <MatchQuestion>{room.phase === "reveal" ? "Así seguía" : "¿Qué palabra sigue?"}</MatchQuestion>
            ) : room.phase === "reveal" && room.reveal ? (
              <MatchQuestion>{room.reveal.title}</MatchQuestion>
            ) : (
              <div className={`tv-qc-eq${room.phase === "playing" && !room.paused ? " is-on" : ""}`} aria-hidden="true">
                {Array.from({ length: 30 }, (_, i) => (
                  <i key={i} style={{ "--i": i }} />
                ))}
              </div>
            )}
          </MatchCard>
        )}

        {room.phase === "countdown" && (
          <section key={`c${room.currentRound}`} className="tv-game-stage tv-countdown tv-mpanel">
            <PauseVeil room={room} isHost={isHost} />
            {controller ? (
              <GetReady />
            ) : (
              <>
                <p className="tv-mono-label">Prepárate para escuchar</p>
                <span key={Math.max(1, seconds)} className="tv-countdown-num">{Math.max(1, seconds)}</span>
              </>
            )}
            <p className="tv-hint">
              {lyrics
                ? `${central ? "La canción se corta: completen" : "La canción se corta: completa"} lo que sigue en la letra${
                    closed ? " entre cuatro opciones" : ""
                  }${central ? " desde su teléfono" : controller ? " desde aquí" : ""}.`
                : central
                ? closed
                  ? "Elijan la canción en su teléfono entre cuatro opciones."
                  : "Escriban el título en su teléfono en cuanto reconozcan la canción."
                : controller
                ? closed
                  ? "Escucha la pantalla central y elige entre cuatro opciones."
                  : "Escucha la pantalla central y escribe el título en cuanto la reconozcas."
                : closed
                ? "Elige la canción entre cuatro opciones."
                : "Escribe el título en cuanto reconozcas la canción."}
            </p>
          </section>
        )}

        {/* A closed round stays on this screen at the reveal, like Trivia: the right song ringed in green, a wrong
            pick in red. */}
        {(room.phase === "playing" || (room.phase === "reveal" && closed)) && (
          <section key={`p${room.currentRound}`} className={`tv-game-stage tv-play-card${closed ? "" : " tv-mpanel"}`}>
            <PauseVeil room={room} isHost={isHost} />
            {/* Completa la letra: a small title and the lyrics following the song, like Spotify's. */}
            {!controller && !lyrics && !closed && <span className="tv-mpanel-label">Tu respuesta</span>}
            {lyrics && <LyricsPanel lyrics={lyrics} position={lyricPos} />}
            {closed && room.phase === "reveal" && central && <RoomVerdict room={room} />}
            {closed && room.phase === "reveal" && !central && (() => {
              const isCorrect = Boolean(me?.lastAnswer?.correct);
              const tone = isCorrect ? "ok" : Number.isInteger(myChoice) ? "bad" : "timeout";
              return (
                <div className={`tv-quiz-verdict tv-quiz-verdict--${tone} tv-music-verdict`} role="status">
                  {isCorrect && <Confetti pieces={18} />}
                  <span className="tv-quiz-verdict-icon">
                    <Icon name={isCorrect ? "check" : Number.isInteger(myChoice) ? "close" : "hash"} size={22} strokeWidth={3.2} />
                  </span>
                  <strong className="tv-quiz-verdict-title">
                    {spectator ? "Era esta" : isCorrect ? "¡Correcto!" : Number.isInteger(myChoice) ? "Incorrecto" : skipped ? "Te la saltaste" : "¡Se acabó el tiempo!"}
                  </strong>
                  <span className="tv-tags">
                    {isCorrect && <span className="tv-tag tv-tag--points">+{me?.lastPoints || 0} pts</span>}
                    {me?.streak > 1 && <span className="tv-tag tv-tag--streak">Racha de {me.streak}</span>}
                  </span>
                </div>
              );
            })()}

            {closed && room.phase === "playing" && central && <PhoneHint room={room}>Elijan desde su teléfono</PhoneHint>}
            {closed && room.phase === "playing" && !central && !spectator && Number.isInteger(myChoice) && (
              <WaitingPill room={room} userId={user?.id} />
            )}
            {!closed && room.phase === "playing" && central ? (
              <PhoneHint room={room}>{lyrics ? "Escriban lo que falta en su teléfono" : "Escriban el título en su teléfono"}</PhoneHint>
            ) : closed && (room.phase === "reveal" || central || (!spectator && (!locked || Number.isInteger(myChoice)))) ? (
              <div className={`tv-quiz-options tv-music-options${room.phase === "reveal" ? " is-reveal" : ""}`} role="group" aria-label="Opciones">
                {OPTION_LETTERS.map((letter, i) => {
                  const text = choice?.options?.[i];
                  if (text == null) return null;
                  // The title big and every artist under it (an older server only sends "Título - Artista").
                  const detail = choice?.details?.[i];
                  const isMine = myChoice === i;
                  const reveal = room.phase === "reveal";
                  const isRight = reveal && choice?.answer === i;
                  const state = reveal
                    ? isRight
                      ? " is-right"
                      : isMine
                      ? " is-wrong"
                      : " is-out"
                    : isMine
                    ? " is-picked"
                    : locked && !central
                    ? " is-out"
                    : "";
                  const picks = choice?.picks?.[i] || 0;
                  return (
                    <button
                      key={`${room.currentRound}-${i}`}
                      type="button"
                      className={`tv-quiz-opt tv-opt-${i}${state}`}
                      style={{ "--i": i }}
                      onClick={() => handleChoose(i)}
                      disabled={locked}
                      aria-pressed={isMine}
                      aria-label={`${letter}: ${text}`}
                    >
                      <span className="tv-quiz-opt-letter">{letter}</span>
                      {detail ? (
                        <span className="tv-quiz-opt-text tv-music-opt-text">
                          <span className="tv-music-opt-title">{detail.title}</span>
                          {detail.artists && <span className="tv-music-opt-artists">{detail.artists}</span>}
                        </span>
                      ) : (
                        <span className="tv-quiz-opt-text">{text}</span>
                      )}
                      {reveal && (isRight || isMine) && (
                        <span className="tv-quiz-opt-mark">
                          <Icon name={isRight ? "check" : "close"} size={18} strokeWidth={3.4} />
                        </span>
                      )}
                      {reveal && (room.players.length > 1 || central) && !controller && (
                        <span className="tv-quiz-opt-picks">
                          <Icon name="users" size={14} strokeWidth={2.6} />
                          {picks}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : !locked ? (
              <div className="tv-search">
                <div className="tv-search-row">
                <div className="tv-search-box">
                  <Icon name="keyboard" size={22} className="tv-search-icon" />
                  <input
                    ref={inputRef}
                    type="text"
                    className="tv-search-input"
                    placeholder={lyrics ? "Escribe lo que falta…" : "Escribe el título…"}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                    autoFocus
                    spellCheck="false"
                    aria-label={lyrics ? "Lo que falta en la letra" : "Título de la canción"}
                    aria-autocomplete={lyrics ? undefined : "list"}
                    aria-controls={lyrics ? undefined : "tv-suggest"}
                    maxLength={lyrics ? 100 : undefined}
                  />
                </div>
                {/* The yellow "Enviar" beside the box, always there (off until something is typed). */}
                <button
                  type="button"
                  className="tv-btn tv-btn--primary tv-mwrite-send"
                  disabled={!query.trim()}
                  onClick={() => {
                    if (suggestions.length > 0 && suggestions[activeIndex]) {
                      handleSubmitSong(suggestions[activeIndex]);
                    } else if (query.trim()) {
                      handleSubmitSong(query.trim());
                    }
                  }}
                >
                  <Icon name="send" size={20} strokeWidth={2.4} />
                  <span className="tv-mwrite-send-label">Enviar</span>
                </button>
                </div>

                {/* Hidden while typing, but it keeps its space so the answer box never moves. */}
                <div className="tv-mpanel-foot">
                  <AnswerSkip confirm={confirmSkip} onClick={handleSkip} hidden={Boolean(query.trim())} />
                </div>

                {query.trim().length > 0 && !lyrics && (
                  <div className="tv-suggest" id="tv-suggest">
                    {suggestions.length > 0 ? (
                      <ul className="tv-suggest-list" ref={suggestionsListRef} role="listbox">
                        {suggestions.map((song, index) => {
                          return (
                            <Fragment key={song.id}>
                              <li role="option" aria-selected={index === activeIndex} data-index={index} style={{ "--i": index }}>
                                <button
                                  type="button"
                                  className={`tv-suggest-item${index === activeIndex ? " is-active" : ""}`}
                                  onClick={() => handleSubmitSong(song)}
                                  onMouseEnter={() => setActiveIndex(index)}
                                >
                                  <span className="tv-suggest-title">{song.title}</span>
                                  <span className="tv-suggest-artist">{song.artists || song.artistName}</span>
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
              spectator ? (
                <div className="tv-locked">
                  <p className="tv-mono-label">Espectador</p>
                  <p className="tv-locked-title">Escucha y mira cómo responden los demás</p>
                </div>
              ) : (
              <div className={`tv-locked${skipped ? " is-skipped" : ""}`}>
                <span className="tv-locked-check">
                  <Icon name={skipped ? "close" : "check"} size={28} strokeWidth={3.2} />
                </span>
                <p className="tv-mono-label">{skipped ? "Sin respuesta" : "Respuesta enviada"}</p>
                <p className="tv-locked-title">
                  {skipped ? "Te la saltaste" : submittedSong || me?.lastAnswer?.text || "Canción enviada"}
                </p>
                <WaitingPill room={room} userId={user?.id} fallback={<p className="tv-hint">Esperando al resto de jugadores…</p>} />
              </div>
              )
            )}

            {err && <p className="tv-lobby-error" role="alert">{err}</p>}
          </section>
        )}

        {room.phase === "reveal" && room.reveal && !closed && (() => {
          const isCorrect = Boolean(me?.lastAnswer?.correct);
          const didAnswer = !skipped && Boolean(me?.lastAnswer?.text || submittedSong);
          const tone = isCorrect ? "ok" : didAnswer ? "bad" : "timeout";
          return (
            <section key={`r${room.currentRound}`} className="tv-game-stage tv-reveal tv-mpanel">
              <PauseVeil room={room} isHost={isHost} />
              {/* The central device says how the room did; each phone how its player did (the song is on the big screen). */}
              {central && <RoomVerdict room={room} />}
              {!spectator && !central && (
              <div className={`tv-result tv-result--${tone}`} role="status">
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
                  <p className="tv-hint">{closed ? "Elegiste" : "Escribiste"} “{me.lastAnswer.text}”</p>
                )}
              </div>
              )}

              {/* Completa la letra: the whole verse, with the words that were missing, while the song goes on. */}
              {lyrics && !controller && <LyricsPanel lyrics={lyrics} position={lyricPos} />}

              {!controller && (
                <div className={`tv-song${coverReadyFor === room.reveal.title ? "" : " is-waiting"}`}>
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
                    <p className="tv-mono-label">Era la canción</p>
                    <h3 className="tv-song-title">{room.reveal.title}</h3>
                    <p className="tv-song-meta">
                      {joinArtists(room.reveal.artists) || room.reveal.artistName}
                      {room.reveal.albumName ? ` · ${room.reveal.albumName}` : ""}
                      {room.reveal.year ? ` (${room.reveal.year})` : ""}
                    </p>
                  </div>
                </div>
              )}

              <p className="tv-next">
                {room.currentRound + 1 >= room.totalRounds ? "Calculando resultados" : "Siguiente canción en breve"}
              </p>
            </section>
          );
        })()}
      </div>

      {/* The scoreboard is the central device's, when there is one. */}
      {!controller && <PartyPanel room={room} scores display={central} onToast={setErr} />}
      {!controller && !central && <MatchBar room={room} viewerId={viewerId} tools={tools} />}
    </div>
  );
}

// Completa la letra's lyrics, line by line: every line is there from the start, in its place (nothing appears or
// pushes the rest down); the one being sung is lit, the others dim. `position` is where the song is (seconds of its
// preview). The last line has the gap: one long line, always as wide (it never tells how long the words are), filled
// with them in the same place once the reveal's song gets to them.
function LyricsPanel({ lyrics, position }) {
  const lines = lyrics.lines || [];
  const filled = Boolean(lyrics.answer) && position >= lyrics.cutMs / 1000;
  let current = -1;
  lines.forEach((l, i) => {
    if (l.atMs / 1000 <= position + 0.05) current = i;
  });
  return (
    <div className="tv-lyrics">
      {lines.map((line, i) => {
        const state = i === current ? " is-current" : i < current ? " is-past" : " is-next";
        // The gap, with any punctuation stuck to it ("___," keeps its comma).
        const [before, after] = line.text.split("___");
        return (
          <p key={i === lines.length - 1 ? "gap" : `${i}-${line.atMs}`} className={`tv-lyrics-line${state}`}>
            {after === undefined ? (
              line.text
            ) : (
              <>
                {before}
                <span className={`tv-lyrics-gap${filled ? " is-filled" : ""}`} aria-label={filled ? undefined : "espacio en blanco"}>
                  {filled ? lyrics.answer : "?"}
                </span>
                {after}
              </>
            )}
          </p>
        );
      })}
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
