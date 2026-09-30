import Icon from "./Icon.jsx";

const STEPS = [
  { icon: "users", color: "pink", title: "Elige un modo", text: "Música, cultura general, cine, geografía… lo que más te guste." },
  { icon: "hash", color: "violet", title: "Crea una sala", text: "Comparte el código con tus amigos o juega solo." },
  { icon: "bolt", color: "sky", title: "Responde antes que nadie", text: "Cuanto más rápido aciertes, más puntos sumas." },
];

// Home: how a game works, in three steps that fit every mode.
export default function HowToPlay() {
  return (
    <section className="tv-card tv-howto" aria-labelledby="tv-howto-title">
      <h2 id="tv-howto-title" className="tv-card-title">Cómo se juega</h2>
      <ol className="tv-steps">
        {STEPS.map((step, i) => (
          <li key={step.title} className="tv-step" style={{ "--i": i }}>
            <span className={`tv-badge tv-c-${step.color}`}>
              <Icon name={step.icon} size={24} />
            </span>
            <div className="tv-step-text">
              <strong>
                <span className="tv-step-num">{i + 1}</span>
                {step.title}
              </strong>
              <span>{step.text}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
