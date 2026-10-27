// `npm run dev`: the backend (:8080) and Vite (:5173).
import concurrently from "concurrently";

const { result } = concurrently([
  { name: "api", command: "npm run dev --prefix backend", prefixColor: "magenta" },
  { name: "web", command: "npm run dev --prefix frontend", prefixColor: "cyan" },
]);
result.catch(() => process.exit(1));
