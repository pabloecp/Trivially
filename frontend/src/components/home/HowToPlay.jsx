import Icon from "./Icon.jsx";

const STEPS = [
  { icon: "play", color: "music", title: "Elige cómo jugar", text: "Solo, con amigos o contra cualquiera." },
  { icon: "bolt", color: "culture", title: "Responde rápido", text: "Cada ronda es una pregunta distinta." },
  { icon: "star", color: "site", title: "Suma puntos", text: "Gana quien más acierte y más rápido." },
];

// Home: how it works, in three steps: Jugar's three options (PlayPage), the games, and the scoring every game shares.
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
