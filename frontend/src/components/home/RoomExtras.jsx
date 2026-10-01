import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { useApp } from "../../lib/store.jsx";

// The only messages players can send: nothing to moderate. Keep in step with QUICK_PHRASES / QUICK_EMOJIS in
// backend/src/game/roomManager.js.
export const QUICK_PHRASES = ["¡Ya empieza!", "¡Voy a ganar!", "Pon la de español", "Pon la de inglés", "¡Más rondas!", "¡Estoy listo!", "Dame un minuto", "¡Vamos!"];
export const QUICK_EMOJIS = ["🔥", "😂", "🎶", "😱", "👀", "💃", "👏", "😎"];

/** "¿Sabías que?": the server's facts about the songs in play, a new one every few seconds. */
export function FunFacts({ facts = [] }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * 1000));
  useEffect(() => {
    if (facts.length < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => i + 1), 7000);
    return () => clearInterval(timer);
  }, [facts.length]);
  if (!facts.length) return null;
  const fact = facts[index % facts.length];
  return (
    <div className="tv-fact" aria-live="polite">
      <span className="tv-fact-icon" aria-hidden="true">
        <Icon name="bulb" size={20} strokeWidth={2.4} />
      </span>
      <span className="tv-fact-body">
        <span className="tv-fact-label">¿Sabías que?</span>
        <span key={fact} className="tv-fact-text">
          {fact}
        </span>
      </span>
      {facts.length > 1 && (
        <button type="button" className="tv-fact-next" onClick={() => setIndex((i) => i + 1)} aria-label="Otro dato">
          <Icon name="chevron" size={18} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

/** Emoji and phrase buttons; what you send shows over your avatar for everyone in the room. */
export function QuickReactions({ onToast }) {
  const { react } = useApp();
  const [cooling, setCooling] = useState(false);

  async function send(text) {
    if (cooling) return;
    setCooling(true);
    setTimeout(() => setCooling(false), 1200);
    try {
      await react(text);
    } catch (err) {
      onToast?.(err.message || "No se pudo enviar");
    }
  }

  return (
    <div className="tv-quick" aria-label="Mensajes rápidos">
      <div className="tv-quick-emojis">
        {QUICK_EMOJIS.map((e) => (
          <button key={e} type="button" className="tv-quick-emoji" onClick={() => send(e)} disabled={cooling} aria-label={`Enviar ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="tv-quick-phrases">
        {QUICK_PHRASES.map((p) => (
          <button key={p} type="button" className="tv-quick-phrase" onClick={() => send(p)} disabled={cooling}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What a player just sent, over their avatar: a speech bubble for phrases, a rising emoji for emojis. */
export function ReactionBubble({ playerId }) {
  const { reactions } = useApp();
  const mine = reactions.filter((r) => r.playerId === playerId);
  const phrase = [...mine].reverse().find((r) => r.kind === "phrase");
  return (
    <>
      {phrase && (
        <span key={phrase.key} className="tv-bubble" role="status">
          {phrase.text}
        </span>
      )}
      {mine
        .filter((r) => r.kind === "emoji")
        .map((r) => (
          <span key={r.key} className="tv-float-emoji" aria-hidden="true">
            {r.text}
          </span>
        ))}
    </>
  );
}
