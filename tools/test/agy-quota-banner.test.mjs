import { execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";

const r = JSON.parse(execFileSync("node", ["../agy-quota-banner.mjs"], {
  cwd: import.meta.dirname, encoding: "utf8",
  input: JSON.stringify({ invocationNum: 1, initialNumSteps: 5, workspacePaths: ["C:/dev/x"] }),
}));

assert.ok(Array.isArray(r.injectSteps) && r.injectSteps.length === 1, "injectSteps deve essere un array con 1 elemento");
assert.match(r.injectSteps[0].ephemeralMessage, /\[PROTOCOLLO MULTI-AGENTE ATTIVO\]/, "manca il banner del protocollo multi-agente");
console.log("agy-quota-banner: iniezione del promemoria di coordinamento verificata con successo");
console.log("agy-quota-banner: 1 collaudo superato");
