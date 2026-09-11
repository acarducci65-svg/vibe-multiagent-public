import { raccogliTelemetria } from "../telemetry.mjs";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { strict as assert } from "node:assert";

const testDir = join(tmpdir(), "telemetry-test-" + Date.now());
const coordDir = join(testDir, ".coord");
const tasksDir = join(coordDir, "tasks");
const logsDir = join(coordDir, "logs");

mkdirSync(tasksDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });

// 1. Fixture CURRENT_SPRINT.md
writeFileSync(join(coordDir, "CURRENT_SPRINT.md"), `# Sprint 1 — Setup e Core\n\nStato: IN CORSO\n`);

// 2. Fixture Tasks
writeFileSync(join(tasksDir, "T-001.md"), `
# T-001 — Motore di Calcolo
Stato: IN CORSO
Proprietario: Claude Code
## File riservati
- src/calc.ts
## Punto di ripresa
- Aggiornato il: 2026-09-11 10:00
- Sto per: implementare la funzione sum
- Fatti: 2026-09-11 10:05 — modificati: src/calc.ts
`);

writeFileSync(join(tasksDir, "T-002.md"), `
# T-002 — Test Suite
Stato: INTEGRATO
Proprietario: Codex CLI
## File riservati
- tests/calc.test.ts
## Punto di ripresa
- Sto per: nulla, chiuso
`);

// 3. Fixture Logs
writeFileSync(join(logsDir, "T-001.log"), `
Riga log 1
Riga log 2
Riga log 3
`);

// Esegui telemetria
const res = raccogliTelemetria(testDir);

assert.ok(res, "Telemetria deve restituire un oggetto");
assert.equal(res.milestone.titolo, "Sprint 1 — Setup e Core");
assert.equal(res.milestone.totale, 2);
assert.equal(res.milestone.completamento, 1);

assert.equal(res.tasks.length, 2);
const t1 = res.tasks.find(t => t.id === "T-001");
assert.equal(t1.stato, "IN CORSO");
assert.equal(t1.proprietario, "Claude Code");
assert.equal(t1.stoPer, "implementare la funzione sum");
assert.match(t1.fatti, /2026-09-11 10:05/);
assert.deepEqual(t1.fileRiservati, ["src/calc.ts"]);

// Verifica flotta agenti
const agClaude = res.agents.find(a => a.name === "Claude Code");
assert.equal(agClaude.status, "running");
assert.equal(agClaude.currentTask, "T-001");

const agCodex = res.agents.find(a => a.name === "Codex CLI");
assert.equal(agCodex.status, "idle");

// Verifica logs
assert.ok(res.logs["T-001"], "Log T-001 deve esistere");
assert.equal(res.logs["T-001"].length, 3);

// Verifica scrittura su disco state.json
const stateJsonPath = join(coordDir, "state.json");
assert.ok(existsSync(stateJsonPath), "state.json deve essere scritto su disco");
const saved = JSON.parse(readFileSync(stateJsonPath, "utf8"));
assert.equal(saved.milestone.titolo, "Sprint 1 — Setup e Core");

// Pulizia
rmSync(testDir, { recursive: true, force: true });
console.log("telemetry: collaudi superati con successo");
