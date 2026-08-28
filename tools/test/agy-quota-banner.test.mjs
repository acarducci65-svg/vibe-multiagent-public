import { execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";

const r = JSON.parse(execFileSync("node", ["../agy-quota-banner.mjs"], {
  cwd: import.meta.dirname, encoding: "utf8",
  input: JSON.stringify({ invocationNum: 1, initialNumSteps: 5, workspacePaths: ["C:/dev/x"] }),
}));

// Sotto soglia: oggetto vuoto. Sopra: injectSteps con un messaggio. Nient'altro è ammesso.
if (Object.keys(r).length === 0) console.log("agy-quota-banner: sotto soglia, nessuna iniezione — corretto");
else {
  assert.ok(Array.isArray(r.injectSteps) && r.injectSteps.length === 1, "injectSteps malformato");
  assert.match(r.injectSteps[0].ephemeralMessage, /\[QUOTA ANTHROPIC\]/);
  console.log("agy-quota-banner: sopra soglia, iniezione ben formata — corretto");
}
console.log("agy-quota-banner: 1 collaudo superato");
