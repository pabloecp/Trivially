import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../lib/store.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";

// Same as CHAT_MAX_LENGTH on the server (game/roomManager.js), and a little more than its CHAT_GAP_MS.
const MAX_LENGTH = 200;
const SEND_GAP_MS = 750;

// The room's chat: the messages (room.chat, oldest first) and a box to write one. Every message shows its sender's
// avatar and name, once per run of messages, yours too: yours on the right, the others' on the left. It keeps to the
// newest message unless you scrolled up to read (the tap for someone else's message is RoomSounds'). While a round is
// played the server closes it (no passing on the answer), and the box says so.
// The messages (ChatMessages) and the box (ChatForm) share their state through `useRoomChat`, so they can sit apart:
// in the room's column (PartyPanel) the messages grow in place of the players' list while the box takes the "Chat"
// button's place. `focus`: the box takes the keyboard (the chat was just opened) and the newest message shows.
export function useRoomChat(room, { focus = false } = {}) {
  const { user, sendChat } = useApp();
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stuck = useRef(true); // the list is scrolled to the bottom
  const lastSent = useRef(0);
  const messages = room.chat || [];
  const closed = room.phase === "countdown" || room.phase === "playing";

  // New messages: stay at the bottom (unless reading older ones).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stuck.current) list.scrollTop = list.scrollHeight;
  }, [messages.at(-1)?.id]);

  useEffect(() => {
    if (!focus) return;
    inputRef.current?.focus({ preventScroll: true });
    stuck.current = true;
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [focus]);

  useEffect(() => {
    if (!err) return undefined;
    const timer = setTimeout(() => setErr(""), 3000);
    return () => clearTimeout(timer);
  }, [err]);

  function onScroll(e) {
    const list = e.currentTarget;
    stuck.current = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
  }

  async function submit(e) {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy || closed) return;
    setBusy(true);
    try {
      // The server takes one message every 0.7 s: one sent sooner waits its turn instead of being refused.
      const wait = lastSent.current + SEND_GAP_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastSent.current = Date.now();
      await sendChat(message);
      setText("");
      stuck.current = true;
    } catch (error) {
      // Too soon after the last one (another tab, a slow clock): no notice, the text stays to send again.
      if (!/Espera un momento/.test(error.message || "")) setErr(error.message || "No se pudo enviar el mensaje");
    } finally {
      setBusy(false);
    }
  }

  return { user, messages, closed, text, setText, err, busy, listRef, inputRef, onScroll, submit };
}

export function ChatMessages({ chat }) {
  const { user, messages, listRef, onScroll } = chat;
  return (
    <div className="tv-chat-area">
      <ol className="tv-chat-list" ref={listRef} onScroll={onScroll} aria-live="polite" aria-label="Mensajes del chat">
        {messages.length === 0 && (
          <li className="tv-chat-empty">
            <Icon name="chat" size={22} strokeWidth={2.2} />
            Saluda a la sala
          </li>
        )}
        {messages.map((m, i) => {
          const mine = m.userId === user?.id;
          const first = messages[i - 1]?.userId !== m.userId;
          return (
            <li key={m.id} className={`tv-chat-msg${mine ? " is-mine" : ""}${first ? " is-first" : ""}`}>
              {first ? <Avatar name={m.name} avatar={m.avatar} /> : <span className="tv-chat-gap" aria-hidden="true" />}
              <div className="tv-chat-bubble">
                {first && <span className="tv-chat-name">{m.name}</span>}
                <span className="tv-chat-text">{m.text}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// The box and the send button; a refused message says why just above them.
export function ChatForm({ chat }) {
  const { closed, text, setText, err, busy, inputRef, submit } = chat;
  return (
    <form className="tv-chat-form" onSubmit={submit}>
      {err && (
        <p className="tv-chat-error" role="status">
          {err}
        </p>
      )}
      <input
        className="tv-chat-input"
        value={text}
        maxLength={MAX_LENGTH}
        disabled={closed}
        placeholder={closed ? "El chat se pausa durante la ronda" : "Escribe un mensaje…"}
        aria-label="Mensaje para la sala"
        ref={inputRef}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="tv-chat-send" data-sound="tap" disabled={closed || busy || !text.trim()} aria-label="Enviar">
        <Icon name="send" size={18} strokeWidth={2.4} />
      </button>
    </form>
  );
}

// The whole chat in one block, with its title (the phones' sheet).
export default function RoomChat({ room }) {
  const chat = useRoomChat(room);
  return (
    <section className="tv-chat" aria-label="Chat de la sala">
      <div className="tv-party-title">
        <h2>Chat</h2>
      </div>
      <ChatMessages chat={chat} />
      <ChatForm chat={chat} />
    </section>
  );
}

// The room's chat in a sheet from the bottom of the screen, opened by ChatButton. The X, Escape or its backdrop close
// it.
export function ChatSheet({ room, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="tv-chatsheet" role="dialog" aria-modal="true" aria-label="Chat de la sala">
      <div className="tv-chatsheet-backdrop" onClick={onClose} />
      <div className="tv-chatsheet-body">
        <button type="button" className="tv-chatsheet-close" data-sound="back" aria-label="Cerrar el chat" onClick={onClose}>
          <Icon name="close" size={20} strokeWidth={2.8} />
        </button>
        <RoomChat room={room} />
      </div>
    </div>,
    document.body
  );
}

/** Whether the screen is a phone's (the width where the room's bars and the chat's sheet take over, home.css). */
export function usePhone() {
  const query = "(max-width: 640px)";
  const [phone, setPhone] = useState(() => Boolean(window.matchMedia?.(query).matches));
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return undefined;
    const onChange = () => setPhone(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return phone;
}

/** How many messages from others came while the chat was closed (`open`); those from before you entered don't count. */
export function useChatUnread(room, open) {
  const { user } = useApp();
  const messages = room.chat || [];
  const newest = messages.at(-1)?.id ?? 0;
  const [seen, setSeen] = useState(newest);
  useEffect(() => {
    if (open) setSeen(newest);
  }, [open, newest]);
  return messages.filter((m) => m.id > seen && m.userId !== user?.id).length;
}

// The phones' button for the chat (in the bottom bar, RoomDock), with how many messages from others came since it was
// last open; those from before you entered the room don't count. With `label`, it says "Chat" beside the icon.
export function ChatButton({ room, className = "", label = false }) {
  const [open, setOpen] = useState(false);
  const unread = useChatUnread(room, open);

  return (
    <>
      <button
        type="button"
        className={`tv-chat-btn ${className}`.trim()}
        onClick={() => setOpen(true)}
        aria-label={unread ? `Chat: ${unread} mensajes nuevos` : "Chat"}
      >
        <Icon name="chat" size={label ? 18 : 22} strokeWidth={2.6} />
        {label && <span>Chat</span>}
        {unread > 0 && <span className="tv-chat-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && <ChatSheet room={room} onClose={() => setOpen(false)} />}
    </>
  );
}
