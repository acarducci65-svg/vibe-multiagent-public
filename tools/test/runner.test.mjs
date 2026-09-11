import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { strict as assert } from "node:assert";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

const testDir = join(tmpdir(), "runner-test-" + Date.now());
const coordDir = join(testDir, ".coord");
mkdirSync(coordDir, { recursive: true });

// 1. Esecuzione normale di successo
const runnerScript = join(__dirname, "..", "runner.mjs");
const cmdSuccess = process.platform === "win32"
  ? 'node -e "console.log(\'output stdout\'); console.error(\'errore stderr\');"'
  : "node -e 'console.log(\"output stdout\"); console.error(\"errore stderr\");'";

const r1 = spawnSync(process.execPath, [
  runnerScript,
  "--task", "T-042",
  "--coord", coordDir,
  "--cmd", cmdSuccess
], { cwd: testDir, encoding: "utf8" });

assert.equal(r1.status, 0, "Runner deve uscire con codice 0");
assert.match(r1.stdout, /output stdout/, "Stdout deve apparire sulla console");
assert.match(r1.stderr, /errore stderr/, "Stderr deve apparire sulla console");

const logFile = join(coordDir, "logs", "T-042.log");
assert.ok(existsSync(logFile), "Il file .coord/logs/T-042.log deve esistere");
const logContent = readFileSync(logFile, "utf8");
assert.match(logContent, /Inizio esecuzione task T-042/);
assert.match(logContent, /output stdout/);
assert.match(logContent, /errore stderr/);
assert.match(logContent, /Fine esecuzione task T-042 \(exit code: 0\)/);

// Verifica che state.json sia aggiornato con i log
const stateJson = join(coordDir, "state.json");
assert.ok(existsSync(stateJson), "state.json deve essere stato generato");
const stateData = JSON.parse(readFileSync(stateJson, "utf8"));
assert.ok(stateData.logs["T-042"], "I log per T-042 devono essere in state.json");

// 2. Propagazione codice di uscita non zero
const cmdFail = 'node -e "process.exit(7)"';
const r2 = spawnSync(process.execPath, [
  runnerScript,
  "--task", "T-FAIL",
  "--coord", coordDir,
  "--cmd", cmdFail
], { cwd: testDir, encoding: "utf8" });

assert.equal(r2.status, 7, "Runner deve propagare il codice di uscita 7");

// Pulizia
rmSync(testDir, { recursive: true, force: true });
console.log("runner: collaudi superati con successo");
