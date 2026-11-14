import { useEffect } from "react";
import { Link } from "react-router-dom";
import TvShell from "../components/home/TvShell.jsx";

import { translate as tr } from "../lib/i18n.js";
// "Términos de uso" (/terminos) and "Aviso de privacidad" (/privacidad): what Trivially keeps about players and the
// rules for using it. Linked from "Entra a Trivially", the profile and each other; Google asks for the privacy one to
// sign in with Google. The text says what the code really does: when that changes (a new kind of data, analytics,
// ads), change it here too, and the date.

const UPDATED = "6 de noviembre de 2026";
// Where players write to see, correct or delete their data (for now, a team member's own).
const CONTACT_EMAIL = "pablo.ecpx@gmail.com";

function Contact() {
  return CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <b>{tr("el correo de contacto de Trivially")}</b>;
}

function LegalPage({ title, other, children }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [title]);
  return (
    <TvShell>
      <article className="tv-legal">
        <header className="tv-legal-head">
          <h1 className="tv-page-title">{title}</h1>
          <p className="tv-page-sub">{tr("Última actualización:")} {tr(UPDATED)}</p>
        </header>
        <div className="tv-card tv-legal-body">{children}</div>
        <nav className="tv-legal-foot">
          <Link to={other.to}>{other.label}</Link>
          <Link to="/">{tr("Ir a Inicio")}</Link>
        </nav>
      </article>
    </TvShell>
  );
}

export function Privacy() {
  return (
    <LegalPage title={tr("Aviso de privacidad")} other={{ to: "/terminos", label: tr("Términos de uso") }}>
      <p>
        {tr("Trivially es un juego de trivia hecho por un equipo independiente. Aquí te contamos qué datos guardamos cuando juegas, para qué, quién más los ve y qué puedes hacer con ellos.")}
      </p>

      <h2>{tr("Qué datos guardamos")}</h2>
      <h3>{tr("Si juegas sin cuenta")}</h3>
      <p>
        {tr("Solo el nombre y el color que eliges, y un número que tu navegador guarda para reconocerte. No los guardamos en nuestra base de datos: se borran al cerrar tu sesión de invitado.")}
      </p>
      <h3>{tr("Si creas una cuenta")}</h3>
      <ul>
        <li>{tr("Tu nombre, tu @usuario, tu correo y el color o la foto de tu perfil.")}</li>
        <li>{tr("Tu contraseña, guardada de forma que nadie puede leerla, ni nosotros.")}</li>
        <li>
          {tr("Si entras con Google: tu nombre, tu correo y tu foto de perfil de Google. No vemos nada más de tu cuenta de Google.")}
        </li>
        <li>
          {tr("Si conectas Spotify: el nombre de tu cuenta, tu correo de Spotify y permiso para leer tus playlists, para poder jugar con ellas.")}
        </li>
        <li>
          {tr("Lo que pasa en el juego: puntos, estadísticas, rango, reto del día, tus últimas 10 partidas con lo que respondiste y las playlists que guardaste.")}
        </li>
        <li>{tr("Tus amigos y las solicitudes de amistad.")}</li>
        <li>{tr("Los reportes de preguntas que mandas, con la partida en la que pasaron.")}</li>
      </ul>
      <h3>{tr("Para todos")}</h3>
      <p>
        {tr("Si la página o el servidor fallan, guardamos qué falló y en qué navegador, para arreglarlo. No guardamos tu dirección IP ni tus cookies en esos avisos.")}
      </p>

      <h2>{tr("Para qué los usamos")}</h2>
      <ul>
        <li>{tr("Para que el juego funcione: entrar, jugar con otros, guardar tus puntos y mostrarte tu perfil.")}</li>
        <li>{tr("Para mandarte el correo de recuperar tu contraseña cuando lo pides.")}</li>
        <li>{tr("Para encontrar y arreglar errores y preguntas equivocadas.")}</li>
      </ul>
      <p>{tr("No vendemos tus datos ni los usamos para publicidad.")}</p>

      <h2>{tr("Qué ven otros jugadores")}</h2>
      <p>
        {tr("Tu nombre, tu @usuario, tu color o foto, tus estadísticas, tu rango y tus últimas partidas. Nunca ven tu correo ni tu contraseña.")}
      </p>

      <h2>{tr("Quién más los guarda")}</h2>
      <p>{tr("Usamos estos servicios para que Trivially funcione, y cada uno guarda solo lo que necesita para su parte:")}</p>
      <ul>
        <li>{tr("Supabase: la base de datos donde viven las cuentas.")}</li>
        <li>{tr("Railway: el servidor del juego.")}</li>
        <li>{tr("Vercel: la página.")}</li>
        <li>{tr("Google y Spotify: solo si entras o te conectas con ellos.")}</li>
        <li>{tr("Resend: manda los correos para recuperar la contraseña.")}</li>
        <li>{tr("Sentry: recibe los avisos de errores.")}</li>
      </ul>

      <h2>{tr("Cookies")}</h2>
      <p>
        {tr("Usamos una sola cookie, para que sigas con tu sesión iniciada hasta 30 días. Tu navegador también guarda cosas del juego, como tu nombre de invitado, tu grupo o el volumen. No usamos cookies de publicidad ni de estadísticas. Si eso cambia, te lo pediremos antes.")}
      </p>

      <h2>{tr("Cuánto tiempo")}</h2>
      <p>
        {tr("Mientras tengas tu cuenta. Si la borras, se borra todo lo de arriba, aunque puede quedar en nuestras copias de seguridad por un tiempo, hasta que se reemplacen.")}
      </p>

      <h2>{tr("Tus derechos")}</h2>
      <p>
        {tr("Puedes pedir ver tus datos, corregirlos, borrarlos o que dejemos de usarlos. Tu nombre, tu @usuario y tu foto los cambias tú mismo en tu perfil, y ahí también puedes borrar tu cuenta (\"Borrar cuenta\"). Para todo lo demás, escríbenos a")} <Contact /> {tr("desde el correo de tu cuenta.")}
      </p>

      <h2>{tr("Menores de edad")}</h2>
      <p>
        {tr("Cualquiera puede jugar sin cuenta. Si tienes menos de 13 años, pide permiso a tu mamá, papá o tutor antes de crear una cuenta.")}
      </p>

      <h2>{tr("Cambios")}</h2>
      <p>
        {tr("Si cambiamos este aviso, actualizaremos la fecha de arriba. Si el cambio es importante, lo avisaremos en la página.")}
      </p>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title={tr("Términos de uso")} other={{ to: "/privacidad", label: tr("Aviso de privacidad") }}>
      <p>
        {tr("Al jugar en Trivially aceptas estas reglas. Son pocas y sirven para que el juego sea divertido para todos.")}
      </p>

      <h2>{tr("El juego")}</h2>
      <p>
        {tr("Trivially es gratis. Lo mejoramos seguido, así que los juegos, las preguntas y las reglas pueden cambiar. Hacemos lo posible para que funcione siempre, pero puede haber fallas o ratos en que no esté disponible.")}
      </p>

      <h2>{tr("Tu cuenta")}</h2>
      <ul>
        <li>{tr("Cuida tu contraseña: lo que pase con tu cuenta es tu responsabilidad.")}</li>
        <li>{tr("Usa un nombre y un @usuario que no ofendan ni se hagan pasar por otra persona.")}</li>
        <li>{tr("Una cuenta es de una persona. No vendas ni compartas tu cuenta.")}</li>
      </ul>

      <h2>{tr("Cómo jugar limpio")}</h2>
      <ul>
        <li>{tr("No hagas trampa: nada de programas que contesten por ti ni cuentas falsas para subir de rango.")}</li>
        <li>{tr("No molestes, insultes ni acoses a otros jugadores.")}</li>
        <li>{tr("No pongas enlaces ni publicidad en tu nombre.")}</li>
        <li>{tr("No intentes romper, saturar ni entrar sin permiso a la página o al servidor.")}</li>
      </ul>
      <p>
        {tr("Si alguien rompe estas reglas podemos cambiarle el nombre, quitarle puntos o rango, o suspender su cuenta.")}
      </p>

      <h2>{tr("Contenido")}</h2>
      <p>
        {tr("Las preguntas y el diseño de Trivially son nuestros. Las canciones, imágenes, banderas y mapas pertenecen a sus dueños: usamos fragmentos de servicios de música e imágenes con licencia libre, y damos el crédito cuando la licencia lo pide. Si crees que algo no debería estar, escríbenos y lo revisamos.")}
      </p>

      <h2>{tr("Responsabilidad")}</h2>
      <p>
        {tr("Trivially se ofrece tal como está. No respondemos por puntos, rangos o partidas que se pierdan por una falla, ni por lo que escriban otros jugadores.")}
      </p>

      <h2>{tr("Cambios")}</h2>
      <p>
        {tr("Podemos cambiar estos términos. La fecha de arriba dice cuándo fue la última vez. Si sigues jugando después de un cambio, lo aceptas.")}
      </p>

      <h2>{tr("Contacto")}</h2>
      <p>
        {tr("Dudas, reportes o quejas:")} <Contact />.
      </p>
    </LegalPage>
  );
}
