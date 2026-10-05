// Three hopping dots, for lines that say we're waiting on something ("Esperando a que…").
export default function Dots() {
  return (
    <span className="tv-dots" aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}
