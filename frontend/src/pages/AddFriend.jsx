import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Avatar from "../components/home/Avatar.jsx";
import TvShell from "../components/home/TvShell.jsx";
import { useFriends } from "../lib/friends.jsx";
import "../styles/friends.css";

const RELATION_TEXT = {
  self: "Ese es tu propio código.",
  friends: "Ya son amigos.",
  asked: "Ya le enviaste una solicitud.",
};

function AddFriendScreen() {
  const { username } = useParams();
  const friends = useFriends();
  const [who, setWho] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | sent | error
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!friends.isAccount) {
      setState("guest");
      return;
    }
    friends
      .lookup(username)
      .then((data) => {
        setWho(data);
        setState("ready");
      })
      .catch((err) => {
        setMsg(err.message || "No encontramos a nadie con ese usuario");
        setState("error");
      });
  }, [username, friends.isAccount]);

  async function send() {
    try {
      const res = await friends.requestByUsername(who?.username || username);
      setMsg(res.status === "accepted" ? "¡Ya son amigos!" : "Solicitud enviada. Se hacen amigos cuando la acepte.");
      setState("sent");
    } catch (err) {
      setMsg(err.message || "No se pudo enviar la solicitud");
      setState("error");
    }
  }

  return (
    <section className="tv-card tv-addfriend">
      {state === "loading" && <p>Buscando…</p>}
      {state === "guest" && (
        <>
          <h1>Añadir amigo</h1>
          <p>Inicia sesión con una cuenta para añadir amigos.</p>
          <Link className="tv-btn tv-c-violet" to="/login">Iniciar sesión</Link>
        </>
      )}
      {state === "error" && (
        <>
          <h1>No se pudo</h1>
          <p>{msg}</p>
          <Link className="tv-btn tv-c-neutral" to="/">Ir al inicio</Link>
        </>
      )}
      {state === "ready" && who && (
        <>
          <Avatar name={who.name} avatar={who.avatar} />
          <h1>{who.name}</h1>
          <p className="tv-handle">@{who.username}</p>
          {RELATION_TEXT[who.relation] ? (
            <p>{RELATION_TEXT[who.relation]}</p>
          ) : (
            <button type="button" className="tv-btn tv-c-green" onClick={send}>
              {who.relation === "asking" ? "Aceptar como amigo" : "Enviar solicitud de amistad"}
            </button>
          )}
          <Link className="tv-btn tv-c-neutral" to="/">Ir al inicio</Link>
        </>
      )}
      {state === "sent" && (
        <>
          <h1>{who?.name}</h1>
          <p>{msg}</p>
          <Link className="tv-btn tv-c-neutral" to="/">Ir al inicio</Link>
        </>
      )}
    </section>
  );
}

export default function AddFriend() {
  return (
    <TvShell>
      <AddFriendScreen />
    </TvShell>
  );
}
