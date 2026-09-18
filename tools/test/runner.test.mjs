import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { strict as assert } from "node:assert";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

// 1. Test unitari di formattaRigaNdjson
const { formattaRigaNdjson, creaGestoreStream } = await import("../runner.mjs");

// Linea testo normale non JSON
assert.equal(formattaRigaNdjson("testo normale\r"), "testo normale\n");

// Evento tool_use
const evTool = JSON.stringify({
  type: "assistant",
  message: {
    content: [{ type: "tool_use", name: "Bash", input: { command: "npm test" } }]
  }
});
assert.match(formattaRigaNdjson(evTool), /\[Claude\] 🔧 Tool: Bash -> npm test/);

// Evento text
const evText = JSON.stringify({
  type: "assistant",
  message: {
    content: [{ type: "text", text: "Sto completando il task" }]
  }
});
assert.match(formattaRigaNdjson(evText), /\[Claude\] 💬 Sto completando il task/);

// Evento tool_result
const evRes = JSON.stringify({
  type: "user",
  message: {
    content: [{ type: "tool_result", content: "Test passati con successo\nSeconda riga", is_error: false }]
  }
});
assert.match(formattaRigaNdjson(evRes), /\[Claude\] 📄 Esito: Test passati con successo \(\+ 1 righe\)/);

// Evento result
const evDone = JSON.stringify({
  type: "result",
  result: "Task completato",
  duration_ms: 5400,
  total_cost_usd: 0.042
});
assert.match(formattaRigaNdjson(evDone), /\[Claude\] ✅ Completato \(durata: 5.4s, costo: \$0.0420\): Task completato/);

// Gestore stream con chunk parziali
let catturato = "";
const gestore = creaGestoreStream((chunk) => { catturato += chunk; });
gestore.scrivi(evTool.slice(0, 20));
assert.equal(catturato, "", "Non deve emettere prima del termine riga");
gestore.scrivi(evTool.slice(20) + "\n");
assert.match(catturato, /\[Claude\] 🔧 Tool: Bash -> npm test/);
gestore.chiudi();

// 2. Collaudo end-to-end con runnerScript
const testDir = join(tmpdir(), "runner-test-" + Date.now());
const coordDir = join(testDir, ".coord");
mkdirSync(coordDir, { recursive: true });

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

// 3. Collaudo end-to-end con emissione Claude stream-json simulata
const cmdStreamJson = 'node -e "' +
  'console.log(JSON.stringify({type:\\"assistant\\",message:{content:[{type:\\"tool_use\\",name:\\"Bash\\",input:{command:\\"npm run build\\"}}]} })); ' +
  'console.log(JSON.stringify({type:\\"result\\",result:\\"Build OK\\",duration_ms:2000,total_cost_usd:0.01}));' +
  '"';

const rStream = spawnSync(process.execPath, [
  runnerScript,
  "--task", "T-STREAM",
  "--coord", coordDir,
  "--cmd", cmdStreamJson
], { cwd: testDir, encoding: "utf8" });

assert.equal(rStream.status, 0, "Runner stream deve uscire con codice 0");
const logStreamFile = join(coordDir, "logs", "T-STREAM.log");
assert.ok(existsSync(logStreamFile), "Il file T-STREAM.log deve esistere");
const logStreamContent = readFileSync(logStreamFile, "utf8");
assert.match(logStreamContent, /\[Claude\] 🔧 Tool: Bash -> npm run build/);
assert.match(logStreamContent, /\[Claude\] ✅ Completato/);

// Verifica che state.json sia aggiornato con i log
const stateJson = join(coordDir, "state.json");
assert.ok(existsSync(stateJson), "state.json deve essere stato generato");
const stateData = JSON.parse(readFileSync(stateJson, "utf8"));
assert.ok(stateData.logs["T-042"], "I log per T-042 devono essere in state.json");
assert.ok(stateData.logs["T-STREAM"], "I log per T-STREAM devono essere in state.json");

// 4. Collaudo end-to-end con --prompt-file
const promptTestFile = join(testDir, "prompt.txt");
writeFileSync(promptTestFile, "testo prompt da file", "utf8");
const cmdReadStdin = 'node -e "let s = \'\'; process.stdin.on(\'data\', c => s += c); process.stdin.on(\'end\', () => console.log(\'ricevuto: \' + s));"';

const rPrompt = spawnSync(process.execPath, [
  runnerScript,
  "--task", "T-PROMPT",
  "--coord", coordDir,
  "--prompt-file", promptTestFile,
  "--cmd", cmdReadStdin
], { cwd: testDir, encoding: "utf8" });

assert.equal(rPrompt.status, 0, "Runner con prompt-file deve uscire con 0");
const logPromptFile = join(coordDir, "logs", "T-PROMPT.log");
assert.ok(existsSync(logPromptFile), "Il file T-PROMPT.log deve esistere");
const logPromptContent = readFileSync(logPromptFile, "utf8");
assert.match(logPromptContent, /ricevuto: testo prompt da file/);

// 5. Propagazione codice di uscita non zero
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
