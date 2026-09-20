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
assert.ok(res.projectName, "Telemetria deve contenere projectName");
assert.equal(res.coordDir, ".coord");
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

// =========================================================================
// TEST SU CASI REALI DI PRODUZIONE (casi complessi e formattazione mista)
// =========================================================================
const testDir2 = join(tmpdir(), "telemetry-real-test-" + Date.now());
const coordDir2 = join(testDir2, ".coord");
const tasksDir2 = join(coordDir2, "tasks");
mkdirSync(tasksDir2, { recursive: true });

writeFileSync(join(coordDir2, "CURRENT_SPRINT.md"), `# Sprint\n\nStato: **IN CORSO** — F4, chiusura sprint\n`);

// 28 task INTEGRATO standard
for (let i = 1; i <= 28; i++) {
  const id = `T-${String(i).padStart(3, "0")}`;
  writeFileSync(join(tasksDir2, `${id}.md`), `# ${id}\nStato: INTEGRATO\nProprietario: Claude Code\n`);
}

// 4 task CHIUSO
writeFileSync(join(tasksDir2, "T-029.md"), `# T-029\nStato: CHIUSO\nProprietario: Claude Code\n`);
writeFileSync(join(tasksDir2, "T-030.md"), `# T-030\nStato: CHIUSO\nProprietario: Claude Code\n`);
writeFileSync(join(tasksDir2, "T-031.md"), `# T-031\nStato: CHIUSO\nProprietario: Claude Code\n`);
writeFileSync(join(tasksDir2, "T-032.md"), `# T-032\nStato: CHIUSO\nProprietario: Claude Code\n`);

// 2 task INTEGRATO con testo esteso
writeFileSync(join(tasksDir2, "T-033.md"), `# T-033\nStato: INTEGRATO — parte 1 (rilevamento e avviso); la parte 2 sta in T-032\nProprietario: Codex CLI\n`);
writeFileSync(join(tasksDir2, "T-034.md"), `# T-034\nStato: INTEGRATO — completato con test\nProprietario: AGY CLI / Claude Code\n`);

const res2 = raccogliTelemetria(testDir2);

// Verifica Punto 1: Tutti i 34 task devono risultare completati (28 + 4 CHIUSO + 2 INTEGRATO estesi)
assert.equal(res2.milestone.totale, 34, "Totale task deve essere 34");
assert.equal(res2.milestone.completamento, 34, `Attesi 34 completati, ottenuti ${res2.milestone.completamento}`);
assert.equal(res2.milestone.stato, "IN CORSO — F4, chiusura sprint", "Markdown ** deve essere rimosso da milestone.stato");

// Verifica stato normalizzato e stato esteso su T-033
const t33 = res2.tasks.find(t => t.id === "T-033");
assert.equal(t33.stato, "INTEGRATO", "Stato normalizzato deve essere INTEGRATO");
assert.match(t33.statoEsteso, /parte 1 \(rilevamento e avviso\)/, "Stato esteso deve conservare il testo completo");

// Verifica Punto 2: Riconoscimento AGY CLI
// Creiamo un task IN CORSO assegnato ad AGY CLI
writeFileSync(join(tasksDir2, "T-035.md"), `# T-035\nStato: IN CORSO — punto di ripresa aggiornato alle 18:30\nProprietario: AGY CLI\n`);
const res3 = raccogliTelemetria(testDir2);
const agAgy = res3.agents.find(a => a.name === "Antigravity AGY");
assert.equal(agAgy.status, "running", "AGY CLI deve essere riconosciuto e contrassegnato come running");
assert.equal(agAgy.currentTask, "T-035");

// Verifica proprietario misto "AGY CLI / Claude Code": vince il primo nominato (AGY)
writeFileSync(join(tasksDir2, "T-036.md"), `# T-036\nStato: IN CORSO\nProprietario: AGY CLI / Claude Code\n`);
// Creiamo un secondo task in corso per Claude
writeFileSync(join(tasksDir2, "T-037.md"), `# T-037\nStato: IN CORSO\nProprietario: Claude Code\n`);
const res4 = raccogliTelemetria(testDir2);
const agClaude4 = res4.agents.find(a => a.name === "Claude Code");
assert.equal(agClaude4.status, "running", "Claude Code deve essere running");
assert.equal(agClaude4.currentTask, "T-037");

// Verifica formattazione Markdown (con **Stato**: INTEGRATO e - **Proprietario**:)
writeFileSync(join(tasksDir2, "T-038.md"), `# T-038\n**Stato**: INTEGRATO\n**Proprietario**: Antigravity (AGY)\n`);
writeFileSync(join(tasksDir2, "T-039.md"), `# T-039\n- **Stato**: INTEGRATO\n- **Proprietario**: Codex CLI\n`);
const res5 = raccogliTelemetria(testDir2);
const t38 = res5.tasks.find(t => t.id === "T-038");
assert.equal(t38.stato, "INTEGRATO", "Deve gestire **Stato**: INTEGRATO");
assert.equal(t38.proprietario, "Antigravity (AGY)", "Deve pulire gli asterischi dal proprietario");
const t39 = res5.tasks.find(t => t.id === "T-039");
assert.equal(t39.stato, "INTEGRATO", "Deve gestire - **Stato**: INTEGRATO");

rmSync(testDir2, { recursive: true, force: true });
console.log("telemetry: collaudi superati con successo (inclusi casi reali complessi e formattazione mista)");
