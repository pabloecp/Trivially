// `npm run dev`: the backend (:8080) and Vite (:5173), plus the design board (:5199) when this computer has the
// git-ignored figma/ folder. Without it, only the first two run, as before.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import concurrently from "concurrently";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const board = path.join(root, "figma");

const commands = [
  { name: "api", command: "npm run dev --prefix backend", prefixColor: "magenta" },
  { name: "web", command: "npm run dev --prefix frontend", prefixColor: "cyan" },
];
if (fs.existsSync(path.join(board, "node_modules", "vite"))) {
  commands.push({
    name: "tablero",
    // The board's example data first, like figma/iniciar.bat, then its server.
    command: "node escenas/gen.mjs && node node_modules/vite/bin/vite.js --config vite.config.js",
    cwd: board,
    prefixColor: "yellow",
  });
}

const { result } = concurrently(commands, { cwd: root });
result.catch(() => process.exit(1));
