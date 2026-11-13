// Hook de Claude Code (PreToolUse, ver .claude/settings.json): hace cumplir las reglas de CLAUDE.md sobre firmas.
//  - Un commit o un pull request nunca lleva "Co-Authored-By", "Generated with/by Claude Code" ni enlaces de sesión.
//  - Un pull request nunca se fusiona sin `commit_message` escrito a mano: GitHub copiaría la descripción del PR al
//    commit de fusión, y la herramienta de GitHub le agrega su firma a esa descripción.
// Si algo no se cumple, el hook devuelve el código 2 y su mensaje le llega a Claude; no se ejecuta la acción.
import { readFileSync } from "node:fs";

const FIRMA = /co-authored-by|generated (with|by)\s+\[?claude|claude\.ai\/code|claude-session|🤖/i;
const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const tool = input.tool_name || "";
const args = input.tool_input || {};

const deny = (why) => {
  console.error(`Bloqueado por .claude/hooks/sin-firma.mjs: ${why} (reglas de CLAUDE.md: sin firmas ni co-autor).`);
  process.exit(2);
};

if (tool === "Bash") {
  const cmd = String(args.command || "");
  if (/\bgit\s+commit\b/.test(cmd) && FIRMA.test(cmd)) deny("el commit lleva una firma o un co-autor; quítalos del mensaje");
}

if (/^mcp__github__(create_pull_request|update_pull_request|merge_pull_request|add_issue_comment)$/.test(tool)) {
  for (const field of ["title", "body", "commit_title", "commit_message"]) {
    if (FIRMA.test(String(args[field] || ""))) deny(`el campo "${field}" lleva una firma; quítala`);
  }
}

if (tool === "mcp__github__merge_pull_request" && !String(args.commit_message || "").trim()) {
  deny("fusiona pasando `commit_message` (los puntos del PR, sin firma), para que GitHub no copie la descripción con la firma que agrega la herramienta");
}
