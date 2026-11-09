import { useEffect, useMemo, useRef, useState } from "react";
import { blobColor } from "../../lib/blobColors.js";
import { useBlobsStill } from "../../lib/ownerView.js";
import { play } from "../../lib/sounds.js";
import { useApp } from "../../lib/store.jsx";
import Blob, { BlobGhost } from "./Blob.jsx";
import { publicMatchLine } from "./matchInfo.js";

// How long someone who left stays in their seat, going out (look.css, tvSeatOut).
const LEAVE_MS = 260;

// The search for a public match, in the game's card under its name (ModeStage's `search`): one seat per player of the
// match. Who has come shows their Blob and name; a free seat is a dashed Blob with a "?". A player keeps their seat
// while the room fills, so nobody slides when someone comes or goes: you are in the first one, then your group, then
// whoever arrives. Over the seats, how it goes and a clock in one place: counting up while it searches and down
// ("Empieza en 3") once it's full, when the Blobs jump one after another and the card's bar runs out. Who comes sounds
// soft, and the room filling sounds like a right answer. Bots come like anyone: nothing here tells them apart.
export default function SearchBoard({ room }) {
  const { user, group } = useApp();
  const still = useBlobsStill();
  const info = room.matchmaking;
  const full = Boolean(info.startsAt);
  const here = room.players.filter((p) => p.connected);
  const meId = user?.id;
  const groupIds = useMemo(() => new Set(group?.members.map((m) => m.id)), [group?.members]);
  const seats = useSeats(here, info.size, (id) => (id === meId ? 0 : groupIds.has(id) ? 1 : 2));

  const since = useMemo(() => searchStart(room.code), [room.code]);
  const now = useNow(full ? 200 : 500);
  const waited = Math.max(0, Math.floor((now - since) / 1000));
  const serverNow = now + (room.clockOffset || 0);
  const startsIn = full ? Math.max(1, Math.ceil((info.startsAt - serverNow) / 1000)) : null;
  // Fixed when it fills, so the bar isn't told a new length every time the clock ticks.
  const barMs = useMemo(() => (full ? Math.max(0, info.startsAt - (Date.now() + (room.clockOffset || 0))) : 0), [info.startsAt]);

  const count = here.length;
  const before = useRef(count);
  useEffect(() => {
    if (count > before.current) play(count >= info.size ? "correct" : "tap");
    before.current = count;
  }, [count, info.size]);

  return (
    <div className={`tv-finding${full ? " is-full" : ""}${still ? " is-still" : ""}`}>
      <div className="tv-finding-rings" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <div className="tv-finding-status">
        <div className="tv-finding-title" role="status">
          <h3>
            {full ? (
              "¡Partida lista!"
            ) : (
              <>
                Buscando jugadores
                <span className="tv-finding-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </>
            )}
          </h3>
          <p>
            <b>
              {count} de {info.size}
            </b>
            <span> · {info.game ? publicMatchLine(info.game) : "Juegos al azar · gana el primero en ganar 2"}</span>
          </p>
        </div>
        <div className="tv-finding-clock">
          {full ? (
            <>
              <span>Empieza en</span>
              <strong key={startsIn} className="is-count">
                {startsIn}
              </strong>
            </>
          ) : (
            <>
              <span>Tiempo</span>
              <strong>
                {Math.floor(waited / 60)}:{String(waited % 60).padStart(2, "0")}
              </strong>
            </>
          )}
        </div>
      </div>

      <ul className="tv-finding-seats" data-seats={seats.length} style={{ "--seats": seats.length }} aria-label="Jugadores de la partida">
        {seats.map((player, i) => (
          <Seat key={i} index={i} player={player} meId={meId} groupIds={groupIds} />
        ))}
      </ul>

      {full && (
        <span className="tv-finding-bar" aria-hidden="true">
          <i style={{ animationDuration: `${barMs}ms` }} />
        </span>
      )}
    </div>
  );
}

function Seat({ index, player, meId, groupIds }) {
  // Whoever just left stays a moment, going out.
  const [shown, setShown] = useState(player);
  useEffect(() => {
    if (player) {
      setShown(player);
      return undefined;
    }
    const t = setTimeout(() => setShown(null), LEAVE_MS);
    return () => clearTimeout(t);
  }, [player?.id]);
  const who = player || shown;
  const me = who?.id === meId;

  return (
    <li className={`tv-seat${who ? " is-taken" : ""}${who && !player ? " is-leaving" : ""}`} style={{ "--i": index }}>
      {who ? (
        <div key={who.id} className="tv-seat-who">
          <span className="tv-seat-face">
            <Blob color={blobColor(who.avatar)} mood="neutral" ring={me ? "var(--p-accent-2, #ffd60a)" : null} />
          </span>
          <span className="tv-seat-text">
            <b className="tv-seat-name">{who.name}</b>
            <span className="tv-seat-tag">{groupIds.has(who.id) ? "Tu grupo" : "Listo"}</span>
          </span>
        </div>
      ) : (
        <div className="tv-seat-who is-empty">
          <span className="tv-seat-face">
            <BlobGhost />
          </span>
          <span className="tv-seat-text">
            <b className="tv-seat-name">Buscando…</b>
          </span>
        </div>
      )}
    </li>
  );
}

// Who sits where: someone stays in their seat until they leave, and a new one takes the first free seat. `order` says
// who goes first among those arriving together (you, then your group, then the rest as the server has them). Doing it
// again with the same players gives the same seats.
function useSeats(players, size, order) {
  const seats = useRef([]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const next = seats.current.map((id) => (byId.has(id) ? id : null));
  const arriving = players
    .map((p) => p.id)
    .filter((id) => !next.includes(id))
    .sort((a, b) => order(a) - order(b));
  for (const id of arriving) {
    const free = next.indexOf(null);
    if (free >= 0) next[free] = id;
    else next.push(id);
  }
  while (next.length < size) next.push(null);
  seats.current = next;
  return next.map((id) => byId.get(id) || null);
}

function useNow(everyMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

// When this device started searching in a room (sessionStorage, so a reload keeps counting from the same moment).
function searchStart(code) {
  const key = `trivially_search_since_${code}`;
  try {
    const saved = Number(sessionStorage.getItem(key));
    if (saved > 0) return saved;
    const t = Date.now();
    sessionStorage.setItem(key, String(t));
    return t;
  } catch {
    return Date.now();
  }
}
