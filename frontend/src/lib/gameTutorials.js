// How to play each game in four steps, for the little tutorial on the game's card (Tutorial.jsx). Each step is a text
// and an `image` (a path or a URL; `null` until the pictures are made, the card shows an empty frame meanwhile).
const step = (text, image = null) => ({ text, image });

const SLIDES = {
  opciones: [
    step("Te hacemos una pregunta de cualquier tema"),
    step("Elige la respuesta correcta entre 4 opciones, o escríbela"),
    step("Responde rápido: mientras antes aciertes, más puntos"),
    step("Gana quien más puntos sume al final de las rondas"),
  ],
  musica: [
    step("Escucha un fragmento de una canción"),
    step("Elige su título entre 4 opciones o escríbelo"),
    step("Acierta rápido: hasta 1000 puntos por ronda"),
    step("Gana quien más puntos sume al final de las canciones"),
  ],
  mundo: [
    step("Te decimos un país, su sombra o su bandera"),
    step("Pon tu pin en el mapa donde creas que está"),
    step("Confirma tu pin antes de que se acabe el tiempo"),
    step("Dentro del país vale 1000; más cerca, más puntos"),
  ],
  historia: [
    step("Lee una pregunta cuya respuesta es un número"),
    step("Marca el número en la barra"),
    step("Mientras más cerca de la respuesta, más puntos"),
    step("El número exacto vale 1000 puntos"),
  ],
  minas: [
    step("Lee el tema del tablero de 25 respuestas"),
    step("Toca las respuestas correctas, sin esperar turno"),
    step("Si pisas una mina, quedas fuera de la ronda"),
    step("Gana quien más puntos sume al final de los tableros"),
  ],
  lluvia: [
    step("Las preguntas caen por la pantalla"),
    step("Escribe la respuesta antes que nadie"),
    step("Las verdes valen 1 punto, las amarillas 3 y las rojas 5"),
    step("Gana quien más puntos sume cuando pare la lluvia"),
  ],
  rey: [
    step("El rey elige una de tres preguntas"),
    step("Los demás escriben la respuesta"),
    step("El primero en acertar le quita la corona"),
    step("Si nadie acierta, el rey suma 1, 3 o 5 puntos"),
  ],
  farsante: [
    step("Te mostramos una pregunta muy difícil: inventa una respuesta"),
    step("Tu respuesta se mezcla con las de los demás"),
    step("Vota la que creas que es la verdadera"),
    step("Sumas puntos si aciertas y por cada voto que engañes"),
  ],
};

// The Clásico's rounds are other games, each with its own tutorial before it starts: this one is about how it's won.
const classicSlides = (wins) => [
  step("La ruleta elige un juego al azar"),
  step("Antes de empezar, verás cómo se juega"),
  step("Cada juego dura 5 rondas: gana quien más puntos sume"),
  step(`Gana el Clásico el primero en ganar ${wins} juegos`),
];

/** The four steps of a game's tutorial, or null for what has none ("Elige un juego"). */
export function tutorialSlides(mode) {
  if (mode.kind === "classic") return classicSlides(mode.wins);
  return SLIDES[mode.id] || null;
}
