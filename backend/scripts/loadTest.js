// Load test: many private Trivia matches at once against a server of ours, to know how many it holds before the
// rounds start to lag. Each match has a host and some players (fake guests), plays its rounds answering at random
// after a human-like pause, and the script measures how long the server takes to answer (the ack of every answer).
//
// Only against a server we run (on this computer, or a test copy): it signs the players' tokens with that server's
// SESSION_SECRET (read from backend/.env), so it can't be pointed at production. Never run it against Railway's.
//
//   npm run load:test --prefix backend                                   (20 matches of 6 against localhost:8080)
//   npm run load:test --prefix backend -- --rooms 100 --players 8 --rounds 5 --url http://localhost:8080
//
// Look at the "respuesta del servidor" times: under ~100 ms it plays fine; when p95 passes ~300 ms players feel it.
// Watch the server's CPU and memory meanwhile (Task Manager, or Railway's metrics on a test copy).
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { io } from "socket.io-client";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });
const { createSocketToken } = await import("../src/auth/socketToken.js");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const URL = arg("url", "http://localhost:8080");
const ROOMS = Number(arg("rooms", 20));
const PLAYERS = Number(arg("players", 6));
// Trivia plays 5 to 25 rounds (QUIZ_LIMITS): fewer becomes 5.
const ROUNDS = Math.max(5, Number(arg("rounds", 5)));
// New matches are opened a little apart, like people arriving, not all in the same millisecond.
const RAMP_MS = Number(arg("ramp", 50));

if (!/localhost|127\.0\.0\.1/.test(URL) && !process.argv.includes("--no-es-produccion")) {
  console.error(`${URL} no es este equipo. Si es una copia de pruebas (nunca producción), añade --no-es-produccion.`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = { latencies: [], errors: new Map(), disconnects: 0, finished: 0, started: 0, sockets: 0 };
const fail = (msg) => stats.errors.set(msg, (stats.errors.get(msg) || 0) + 1);

function connect(id) {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { transports: ["websocket"], auth: { token: createSocketToken(id) }, reconnection: false });
    socket.once("connect", () => {
      stats.sockets += 1;
      resolve(socket);
    });
    socket.once("connect_error", (err) => reject(err));
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") stats.disconnects += 1;
    });
  });
}

// An event with its answer, and how long the answer took.
function ask(socket, event, payload, measure = false) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const args = payload === undefined ? [] : [payload];
    socket.timeout(10000).emit(event, ...args, (err, res) => {
      if (measure) stats.latencies.push(performance.now() - t0);
      if (err) fail(`${event}: sin respuesta en 10 s`);
      else if (res && res.ok === false) fail(`${event}: ${res.error}`);
      resolve(err ? null : res);
    });
  });
}

// Each player answers the round's question once, after a pause of 1–6 s (as a person would).
function play(socket, done) {
  let answeredRound = -1;
  socket.on("room:state", (state) => {
    if (state.phase === "finished") return done();
    const q = state.question;
    if (state.phase !== "playing" || !q || answeredRound === q.round) return;
    answeredRound = q.round;
    const pick = q.type === "open" ? "respuesta" : Math.floor(Math.random() * (q.options?.length || 4));
    setTimeout(() => ask(socket, "game:answer", pick, true), 1000 + Math.random() * 5000);
  });
}

async function match(n) {
  const run = `${Date.now().toString(36)}${n}`;
  const sockets = [];
  try {
    const host = await connect(`gst_lt${run}h`);
    sockets.push(host);
    const created = await ask(host, "room:create", { user: { name: `Carga ${n}` }, mode: "multi", game: "opciones" });
    const code = created?.state?.code;
    if (!code) return sockets;
    await ask(host, "room:config", { quiz: { formats: ["opciones"], rounds: ROUNDS, roundMs: 15000 } });
    for (let p = 1; p < PLAYERS; p++) {
      const s = await connect(`gst_lt${run}p${p}`);
      sockets.push(s);
      await ask(s, "room:join", { code, user: { name: `Jugador ${n}.${p}` } });
    }
    const finished = new Promise((resolve) => {
      let left = sockets.length;
      for (const s of sockets) play(s, () => --left === 0 && resolve());
    });
    const started = await ask(host, "room:start");
    if (started?.ok) stats.started += 1;
    // A match of ROUNDS rounds lasts at most ~25 s a round (countdown, 15 s to answer, the reveal), plus the intro.
    await Promise.race([finished, sleep(ROUNDS * 25000 + 30000)]);
    stats.finished += 1;
  } catch (err) {
    fail(`conexión: ${err.message}`);
  }
  return sockets;
}

const pct = (list, p) => {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

console.log(`Prueba de carga contra ${URL}: ${ROOMS} partidas de Trivia de ${PLAYERS} jugadores, ${ROUNDS} rondas.`);
const t0 = Date.now();
const report = setInterval(() => {
  const recent = stats.latencies.slice(-200);
  console.log(
    `  ${Math.round((Date.now() - t0) / 1000)} s · conectados ${stats.sockets} · partidas empezadas ${stats.started}/${ROOMS} · respuesta del servidor p50 ${Math.round(pct(recent, 50))} ms, p95 ${Math.round(pct(recent, 95))} ms`
  );
}, 5000);

const runs = [];
for (let n = 0; n < ROOMS; n++) {
  runs.push(match(n));
  await sleep(RAMP_MS);
}
const all = (await Promise.all(runs)).flat();
clearInterval(report);
for (const s of all) s.disconnect();

const l = stats.latencies;
console.log("\nResultado");
console.log(`  Jugadores conectados: ${stats.sockets} (${ROOMS * PLAYERS} esperados), desconexiones inesperadas: ${stats.disconnects}`);
console.log(`  Partidas empezadas: ${stats.started}/${ROOMS}, terminadas: ${stats.finished}/${ROOMS}`);
console.log(`  Respuestas: ${l.length} · respuesta del servidor p50 ${Math.round(pct(l, 50))} ms, p95 ${Math.round(pct(l, 95))} ms, p99 ${Math.round(pct(l, 99))} ms, máx ${Math.round(Math.max(0, ...l))} ms`);
if (stats.errors.size) {
  console.log("  Errores:");
  for (const [msg, count] of stats.errors) console.log(`    ${count} × ${msg}`);
}
process.exit(0);
