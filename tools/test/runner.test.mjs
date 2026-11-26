import { spawnSync as spawnSyncNode } from "node:child_process";
import { chmodSync, closeSync, openSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { delimiter, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { strict as assert } from "node:assert";
import * as claude from "../adapters/claude.mjs";
import * as codex from "../adapters/codex.mjs";
import * as agy from "../adapters/agy.mjs";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
process.env.VIBE_ANTHROPIC_QUOTA = "0"; // Spegne il probe di rete della telemetria anche con pipe disponibili.

// 1. Test unitari di formattaRigaNdjson
const { formattaRigaNdjson, creaGestoreStream, analizzaArgomenti, promuoviTaskAConsegnato } = await import("../runner.mjs");

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

// Evento thinking_tokens (telemetria interna di Claude: deve essere silenziata)
const evThinking = JSON.stringify({
  type: "system",
  subtype: "thinking_tokens",
  estimated_tokens: 1500,
  estimated_tokens_delta: 100,
  session_id: "test-session"
});
assert.equal(formattaRigaNdjson(evThinking), "", "thinking_tokens deve essere silenziato per non intasare i log");

// Gestore stream con chunk parziali
let catturato = "";
const gestore = creaGestoreStream((chunk) => { catturato += chunk; });
gestore.scrivi(evTool.slice(0, 20));
assert.equal(catturato, "", "Non deve emettere prima del termine riga");
gestore.scrivi(evTool.slice(20) + "\n");
assert.match(catturato, /\[Claude\] 🔧 Tool: Bash -> npm test/);
gestore.chiudi();

// 2. Collaudo end-to-end con runnerScript
const testDir = mkdtempSync(join(tmpdir(), "runner-test-"));
process.on("exit", () => rmSync(testDir, { recursive: true, force: true }));
const coordDir = join(testDir, ".coord");
mkdirSync(coordDir, { recursive: true });

function spawnSync(exe, args, options) {
  const result = spawnSyncNode(exe, args, options);
  if (process.platform !== "win32" || result.error?.code !== "EPERM") return result;
  const paths = ["stdout", "stderr"].map(name => join(testDir, name));
  const fds = paths.map(path => openSync(path, "w"));
  try {
    const captured = spawnSyncNode(exe, args, { ...options, stdio: ["ignore", ...fds] });
    const [stdout, stderr] = paths.map(path => readFileSync(path, "utf8"));
    return { ...captured, stdout, stderr };
  } finally {
    for (const fd of fds) closeSync(fd);
  }
}

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

// 6. Test di regressione UTF-8 split chunks
let chunkOut = "";
const stream = creaGestoreStream(s => chunkOut += s);
const bytes = Buffer.from("test è accentata\n");
stream.scrivi(bytes.subarray(0, 6)); // taglia a metà la lettera 'è'
stream.scrivi(bytes.subarray(6));
stream.chiudi();
assert.equal(chunkOut, "test è accentata\n", "StringDecoder deve ricomporre correttamente UTF-8 multibyte");

// 7. Test formattaRigaNdjson con result is_error
const rErr = formattaRigaNdjson('{"type":"result","is_error":true,"result":"Simulated error"}');
assert.match(rErr, /❌ Errore agente.*Simulated error/, "is_error deve visualizzare ❌ Errore agente e non Completato");

// 8. Test formattaRigaNdjson con evento sconosciuto
const rCust = formattaRigaNdjson('{"type":"custom_ping","payload":"pong"}');
assert.match(rCust, /ℹ️ \[custom_ping\] pong/, "Eventi sconosciuti non devono essere persi");

// 9. Collaudo CircuitBreaker — macchina a stati a 4 livelli
const {
  CircuitBreaker, STATI_BREAKER, ErroreArgomenti, costruisciEnvFiglio, risolviCwdEsecuzione,
  risolviSessione,
} = await import("../runner.mjs");

assert.deepEqual([...STATI_BREAKER], ["healthy", "steering", "constrained", "stopped"], "Stati ammessi nell'ordine canonico");

// Registra le callback invocate, nell'ordine
function nuovoBreaker(opzioni = {}) {
  const eventi = [];
  const cb = new CircuitBreaker({
    ...opzioni,
    onSteer: (m) => eventi.push(["steer", m]),
    onConstrain: (m) => eventi.push(["constrain", m]),
    onTrip: (m) => eventi.push(["trip", m]),
  });
  return { cb, eventi, tipi: () => eventi.map((e) => e[0]) };
}

// 9a. Chiamate identiche: healthy -> steering -> constrained -> stopped
{
  const { cb, eventi, tipi } = nuovoBreaker();
  assert.equal(cb.state, "healthy");
  assert.equal(cb.registraToolCall("Bash", { command: "ls" }), "healthy", "Prima chiamata: healthy");
  assert.equal(cb.consecutiveIdenticalCalls, 0, "La prima chiamata non è una ripetizione");
  assert.equal(cb.registraToolCall("Bash", { command: "ls" }), "steering", "1 ripetizione (2 chiamate): steering");
  assert.equal(cb.consecutiveIdenticalCalls, 1);
  assert.deepEqual(tipi(), ["steer"]);
  assert.equal(cb.registraToolCall("Bash", { command: "ls" }), "constrained", "2 ripetizioni: constrained");
  assert.deepEqual(tipi(), ["steer", "constrain"]);
  assert.equal(cb.registraToolCall("Bash", { command: "ls" }), "stopped", "3 ripetizioni: stopped");
  assert.deepEqual(tipi(), ["steer", "constrain", "trip"]);
  assert.match(eventi[2][1], /chiamate identiche consecutive al tool Bash/);
  assert.equal(cb.motivoArresto, eventi[2][1]);
  // stopped è terminale: niente nuovi trip né ripristino
  cb.registraToolCall("Bash", { command: "ls" });
  cb.registraToolResult(false);
  assert.equal(cb.state, "stopped", "stopped non si ripristina");
  assert.deepEqual(tipi(), ["steer", "constrain", "trip"], "onTrip invocata una sola volta");
}

// 9b. Una chiamata diversa azzera il contatore di ripetizioni
{
  const { cb } = nuovoBreaker();
  cb.registraToolCall("Read", { file_path: "a" });
  cb.registraToolCall("Read", { file_path: "a" });
  cb.registraToolCall("Read", { file_path: "b" });
  assert.equal(cb.consecutiveIdenticalCalls, 0, "Input diverso: contatore azzerato");
  assert.equal(cb.totalCalls, 3);
}

// 9c. Soglia maxConsecutiveIdenticalCalls personalizzata (prevale sui livelli intermedi)
{
  const { cb, tipi } = nuovoBreaker({ maxConsecutiveIdenticalCalls: 2 });
  cb.registraToolCall("Bash", "x");
  cb.registraToolCall("Bash", "x");
  assert.equal(cb.state, "steering");
  cb.registraToolCall("Bash", "x");
  assert.equal(cb.state, "stopped", "Con soglia 2, 2 ripetizioni = stopped");
  assert.deepEqual(tipi(), ["steer", "trip"]);
}

// 9d. Errori consecutivi: healthy -> steering -> constrained -> stopped
{
  const { cb, eventi, tipi } = nuovoBreaker({ maxConsecutiveErrors: 3 });
  assert.equal(cb.registraToolResult(true, "fail 1"), "steering", "1 errore: steering");
  assert.equal(cb.registraToolResult(true, "fail 2"), "constrained", "2 errori: constrained");
  assert.equal(cb.registraToolResult(true, "fail 3"), "stopped", "3 errori: stopped");
  assert.deepEqual(tipi(), ["steer", "constrain", "trip"]);
  assert.match(eventi[2][1], /3 errori consecutivi.*fail 3/);
}

// 9e. Ripristino da steering e da constrained a healthy su successo
{
  const { cb, tipi } = nuovoBreaker();
  cb.registraToolResult(true, "fail 1");
  assert.equal(cb.state, "steering");
  assert.equal(cb.registraToolResult(false, "ok"), "healthy", "steering -> healthy su successo");
  assert.equal(cb.consecutiveErrors, 0);

  cb.registraToolResult(true, "fail 1");
  cb.registraToolResult(true, "fail 2");
  assert.equal(cb.state, "constrained");
  assert.equal(cb.registraToolResult(false, "ok"), "healthy", "constrained -> healthy su successo");
  assert.equal(cb.consecutiveErrors, 0, "Successo azzera consecutiveErrors");

  // Dopo il ripristino servono di nuovo 3 errori per lo stop, con callback rinnovate
  cb.registraToolResult(true, "fail 1");
  cb.registraToolResult(true, "fail 2");
  assert.equal(cb.state, "constrained", "Il contatore riparte da zero dopo il successo");
  cb.registraToolResult(true, "fail 3");
  assert.equal(cb.state, "stopped");
  assert.deepEqual(tipi(), ["steer", "steer", "constrain", "steer", "constrain", "trip"]);
}

// 9f. Ripristino da constrained raggiunto con chiamate duplicate
{
  const { cb } = nuovoBreaker();
  cb.registraToolCall("Bash", "x");
  cb.registraToolCall("Bash", "x");
  cb.registraToolCall("Bash", "x");
  assert.equal(cb.state, "constrained");
  cb.registraToolResult(false);
  assert.equal(cb.state, "healthy", "constrained (da duplicati) -> healthy su successo");
}

// 9g. I segnali si combinano senza de-escalation: lo stato non scende per un segnale più debole
{
  const { cb, tipi } = nuovoBreaker();
  cb.registraToolResult(true, "e1");
  cb.registraToolResult(true, "e2");
  assert.equal(cb.state, "constrained");
  cb.registraToolCall("Bash", "x");
  cb.registraToolCall("Bash", "x"); // 1 ripetizione = livello steering, ma siamo già constrained
  assert.equal(cb.state, "constrained", "Nessuna de-escalation da segnale più debole");
  assert.deepEqual(tipi(), ["steer", "constrain"], "Nessuna callback per transizioni non avvenute");
  cb.registraToolResult(true, "e3");
  assert.equal(cb.state, "stopped");
}

// 9h. Callback opzionali e soglie non valide ripiegano sui default
{
  const cb = new CircuitBreaker({ maxConsecutiveErrors: 0, maxConsecutiveIdenticalCalls: "x" });
  assert.equal(cb.maxConsecutiveErrors, 3);
  assert.equal(cb.maxConsecutiveIdenticalCalls, 3);
  cb.registraToolResult(true);
  cb.registraToolResult(true);
  cb.registraToolResult(true);
  assert.equal(cb.state, "stopped", "Funziona anche senza callback");
}

// 10. analizzaArgomenti: default CLI, --worktree e --dispatch-id
const argv = (...a) => ["node", "runner.mjs", ...a];
{
  const r = analizzaArgomenti(argv("--task", "T-99", "--worktree", "wt-feature", "--dispatch-id", "DISP-001", "--cmd", "echo test"));
  assert.equal(r.worktree, "wt-feature");
  assert.equal(r.dispatchId, "DISP-001");
  assert.equal(r.cmd, "echo test", "--cmd esplicito ha la precedenza");
}
{
  const r = analizzaArgomenti(argv("--task", "T-1", "--agent", "codex"));
  assert.equal(r.cmd, "codex exec --json --sandbox workspace-write -");
  const rm = analizzaArgomenti(argv("--agent", "codex", "--model", "gpt-6-astra", "--prompt-file", "p.txt", "-w", "../wt", "-d", "DISP-024-A"));
  assert.equal(rm.cmd, "codex exec --json --sandbox workspace-write --model gpt-6-astra -");
  assert.equal(rm.worktree, "../wt");
  assert.equal(rm.dispatchId, "DISP-024-A");
  const rc = analizzaArgomenti(argv("--agent", "codex", "--cmd", "codex exec --sandbox read-only -"));
  assert.equal(rc.cmd, "codex exec --sandbox read-only -", "Codex con --cmd esplicito: nessun override");
  const rd = analizzaArgomenti(argv("--agent", "codex", "--", "node", "-v"));
  assert.equal(rd.cmd, "node -v", "Codex con comando dopo --: nessun override");
}
{
  const r = analizzaArgomenti(argv("--agent", "claude", "--prompt-file", "p.txt", "--model", "opus", "--worktree", "wt", "--dispatch-id", "D1"));
  assert.equal(r.cmd, "claude -p --output-format stream-json --verbose --permission-mode acceptEdits --model opus");
  assert.equal(r.worktree, "wt");
  assert.equal(r.dispatchId, "D1");
  const ra = analizzaArgomenti(argv("--agent", "AGY", "--prompt-file", "p.txt", "-m", "gemini-3.1-pro-high", "--dispatch-id", "D2"));
  assert.equal(ra.agent, "agy");
  assert.equal(ra.cmd, "agy -p --output-format stream-json --model gemini-3.1-pro-high");
  assert.equal(ra.dispatchId, "D2");
  assert.equal(analizzaArgomenti(argv("--agent", "claude")).cmd, "", "Claude senza prompt-file né --cmd: nessun default (uso)");
  assert.equal(analizzaArgomenti(argv("--task", "T")).worktree, null, "Senza --worktree: null");
  assert.equal(analizzaArgomenti(argv("--task", "T")).dispatchId, null, "Senza --dispatch-id: null");
}
// Validazione
assert.throws(() => analizzaArgomenti(argv("--worktree")), ErroreArgomenti, "--worktree senza valore");
assert.throws(() => analizzaArgomenti(argv("--worktree", "--task", "T")), ErroreArgomenti, "--worktree seguito da opzione");
assert.throws(() => analizzaArgomenti(argv("--dispatch-id")), ErroreArgomenti, "--dispatch-id senza valore");
assert.throws(() => analizzaArgomenti(argv("--dispatch-id", "a b;rm")), /dispatch-id non valido/, "--dispatch-id con caratteri non ammessi");
assert.throws(() => analizzaArgomenti(argv("--dispatch-id", "x".repeat(65))), ErroreArgomenti, "--dispatch-id troppo lungo");

// Helper di ambiente e cwd
{
  const env = costruisciEnvFiglio({ PATH: "p" }, "T-7", "DISP-7");
  assert.deepEqual(env, { PATH: "p", TASK_ATTIVO: "T-7", DISPATCH_ID: "DISP-7" });
  assert.equal("DISPATCH_ID" in costruisciEnvFiglio({}, "T-7", null), false, "Nessun DISPATCH_ID se non fornito");
  assert.equal(risolviCwdEsecuzione(testDir, null), testDir);
  assert.equal(risolviCwdEsecuzione(testDir, "wt"), join(testDir, "wt"));
}

// 11. End-to-end: --worktree imposta il cwd del figlio, DISPATCH_ID e TASK_ATTIVO propagati
const wtDir = realpathSync(join(__dirname, "..", ".."));
const cmdEnv = "node -e \"console.log('CWD=' + process.cwd() + '|DISP=' + process.env.DISPATCH_ID + '|TASK=' + process.env.TASK_ATTIVO)\"";
const rWt = spawnSync(process.execPath, [
  runnerScript,
  "--task", "T-WT",
  "--coord", coordDir,
  "--worktree", wtDir,
  "--dispatch-id", "DISP-E2E",
  "--cmd", cmdEnv
], { cwd: testDir, encoding: "utf8" });
assert.equal(rWt.status, 0, "Runner con worktree deve uscire con 0: " + rWt.stderr);
const outWt = rWt.stdout.match(/CWD=(.*)\|DISP=(.*)\|TASK=(.*)/);
assert.ok(outWt, "Il figlio deve stampare cwd ed env");
assert.equal(realpathSync(outWt[1].trim()), realpathSync(wtDir), "cwd del figlio = worktree");
assert.equal(outWt[2].trim(), "DISP-E2E", "DISPATCH_ID propagato");
assert.equal(outWt[3].trim(), "T-WT", "TASK_ATTIVO propagato");
const logWt = readFileSync(join(coordDir, "logs", "T-WT.log"), "utf8");
assert.match(logWt, /Dispatch ID: DISP-E2E/);
assert.match(logWt, /Worktree: .* \(cwd: /);
for (const worktree of [testDir, __dirname]) {
  const result = spawnSync(process.execPath, [
    runnerScript, "--coord", coordDir, "--worktree", worktree, "--", process.execPath, "-v",
  ], { cwd: testDir, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--worktree.*radice Git/);
}

// Worktree inesistente e dispatch-id non valido: uscita 1 con messaggio
const rWtMissing = spawnSync(process.execPath, [runnerScript, "--task", "T-WT2", "--coord", coordDir, "--worktree", "non-esiste", "--cmd", "node -v"], { cwd: testDir, encoding: "utf8" });
assert.equal(rWtMissing.status, 1);
assert.match(rWtMissing.stderr, /--worktree non esiste/);
const rDispBad = spawnSync(process.execPath, [runnerScript, "--task", "T-WT3", "--coord", coordDir, "--dispatch-id", "bad id", "--cmd", "node -v"], { cwd: testDir, encoding: "utf8" });
assert.equal(rDispBad.status, 1);
assert.match(rDispBad.stderr, /dispatch-id non valido/);

// 12. End-to-end: il breaker emette STEERING, CONSTRAINED e TRIP su chiamate duplicate nello stream
const toolUse = '{type:\\"assistant\\",message:{content:[{type:\\"tool_use\\",name:\\"Bash\\",input:{command:\\"ls\\"}}]}}';
const cmdLoop = 'node -e "' +
  `for (let i = 0; i < 4; i++) console.log(JSON.stringify(${toolUse})); setTimeout(() => {}, 1500);` +
  '"';
const rLoop = spawnSync(process.execPath, [runnerScript, "--task", "T-LOOP", "--coord", coordDir, "--cmd", cmdLoop], { cwd: testDir, encoding: "utf8", timeout: 20000 });
assert.match(rLoop.stderr, /\[CircuitBreaker\] ⚠️ STEERING/, "Avviso steering su stderr");
assert.match(rLoop.stderr, /\[CircuitBreaker\] 🚧 CONSTRAINED/, "Avviso constrained su stderr");
assert.match(rLoop.stderr, /\[CircuitBreaker\] 🛑 TRIP: Rilevate 4 chiamate identiche/, "Trip su stderr");
const logLoop = readFileSync(join(coordDir, "logs", "T-LOOP.log"), "utf8");
assert.match(logLoop, /STEERING[\s\S]*CONSTRAINED[\s\S]*TRIP/, "Sequenza di avvisi nel log, in ordine");

// 13. Promozione consentita da un handover valido del task
const tasksDir = join(coordDir, "tasks");
mkdirSync(tasksDir, { recursive: true });
const taskFile = join(tasksDir, "T-DELIV-adapter.md");
writeFileSync(taskFile, "# Task T-DELIV\n- **Stato**: IN CORSO\nProprietario: Codex CLI\n");

const handoverDir = join(coordDir, "handover");
mkdirSync(handoverDir);
function handover(taskId) {
  return JSON.stringify({
    schema_version: "2.1", task_id: taskId, dispatch_id: "", outcome: "COMPLETO",
    base_sha: "", head_sha: "", acceptance_criteria: [], checks: [],
  });
}
assert.equal(promuoviTaskAConsegnato(coordDir, "T-DELIV"), false);
writeFileSync(join(handoverDir, "T-DELIV.md"), handover("T-DELIV"));
assert.equal(promuoviTaskAConsegnato(coordDir, "T-DELIV"), true, "Deve promuovere task da IN CORSO a CONSEGNATO");
assert.match(readFileSync(taskFile, "utf8"), /- \*\*Stato\*\*: CONSEGNATO/, "Il file deve contenere Stato: CONSEGNATO");
assert.equal(promuoviTaskAConsegnato(coordDir, "T-DELIV"), false, "Non deve ri-promuovere un task già CONSEGNATO");

// Test end-to-end con runner execution exitCode 0
const taskE2E = join(tasksDir, "T-E2EDELIV.md");
writeFileSync(taskE2E, "# Task T-E2EDELIV\nStato: IN CORSO\nProprietario: Claude Code\n");
function eseguiFixture(task, ...opzioni) {
  return spawnSync(process.execPath, [
    runnerScript, "--task", task, "--coord", coordDir, ...opzioni, "--", process.execPath, "-e", "process.exit(0)",
  ], { cwd: testDir, encoding: "utf8", timeout: 20000 });
}
const handoverE2E = join(handoverDir, "T-E2EDELIV.md");
for (const invalido of [null, "{}", handover("T-ALTRO")]) {
  if (invalido !== null) writeFileSync(handoverE2E, invalido);
  assert.equal(eseguiFixture("T-E2EDELIV").status, 0);
  assert.match(readFileSync(taskE2E, "utf8"), /Stato: IN CORSO/);
}
assert.match(readFileSync(join(coordDir, "logs", "T-E2EDELIV.log"), "utf8"), /CONSEGNA_INCOMPLETA/);
writeFileSync(handoverE2E, handover("T-E2EDELIV"));
const rDeliv = eseguiFixture("T-E2EDELIV");
assert.equal(rDeliv.status, 0);
assert.match(readFileSync(taskE2E, "utf8"), /Stato: CONSEGNATO/, "Runner deve promuovere il task a CONSEGNATO");
const logDeliv = readFileSync(join(coordDir, "logs", "T-E2EDELIV.log"), "utf8");
assert.match(logDeliv, /Transizione automatica: task T-E2EDELIV -> CONSEGNATO/);

// 14. Gli adapter operano anche con JSONL frammentato e UTF-8 multibyte.
const fixtures = [
  ["claude", claude, [
    { type: "system", subtype: "init", session_id: "session-claude" },
    { type: "assistant", message: { content: [{ type: "text", text: "già" }, { type: "tool_use", name: "Read", input: { file_path: "a" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", is_error: true, content: "ko" }] } },
    { type: "result", result: "fine" },
  ]],
  ["codex", codex, [
    { type: "thread.started", thread_id: "session-codex" },
    { type: "item.completed", item: { type: "agent_message", text: "già" } },
    { type: "item.started", item: { type: "command_execution", command: "test" } },
    { type: "item.completed", item: { type: "command_execution", command: "test", status: "failed", exit_code: 1 } },
    { type: "turn.completed" },
  ]],
  ["agy", agy, [
    { type: "init", session_id: "session-agy" },
    { type: "message", role: "assistant", content: "già", delta: true },
    { type: "tool_use", tool_name: "read_file", parameters: { path: "a" } },
    { type: "tool_result", status: "error", error: { message: "ko" } },
    { type: "result", status: "success" },
  ]],
];

for (const [provider, adapter, records] of fixtures) {
  const lines = records.map(record => JSON.stringify(record));
  const bytes = Buffer.from(lines.join("\r\n"));
  const events = [];
  const parser = creaGestoreStream(() => {}, ev => events.push(ev), { parse: adapter.parseEvent });
  for (const byte of bytes) parser.scrivi(Buffer.of(byte));
  parser.chiudi();
  assert.deepEqual(events.map(ev => ev.type), ["session", "text", "tool_call", "tool_result", "done"]);
  assert.ok(events.every(ev => ev.provider === provider));
  assert.equal(events[1].text, "già");
  assert.equal(events[3].isError, true);
  assert.deepEqual(adapter.parseEvent("{"), []);

  const task = `T-SESSION-${provider}`;
  const result = spawnSync(process.execPath, [
    runnerScript, "--task", task, "--coord", coordDir, "--agent", provider, "--profile", "read-only",
    "--", process.execPath, "-e", `process.stdout.write(${JSON.stringify(lines.join("\n"))});`,
  ], { cwd: testDir, encoding: "utf8", timeout: 20000 });
  assert.equal(result.status, 0, result.stderr);
  const readable = { claude: "Claude", codex: "Codex", agy: "AGY" }[provider];
  assert.ok(result.stdout.includes(`[${readable}] 💬 già`));
  const raw = readFileSync(join(coordDir, "logs", `${task}.jsonl`), "utf8");
  assert.deepEqual(raw.trimEnd().split("\n"), lines);
  const sessionId = `session-${provider}`;
  const context = { cwd: realpathSync(testDir), provider, profile: "read-only" };
  const sessions = JSON.parse(readFileSync(join(coordDir, "state", "sessions.json"), "utf8"));
  assert.deepEqual(sessions[task], { ...context, sessionId, updatedAt: sessions[task].updatedAt });
  assert.ok(Number.isFinite(Date.parse(sessions[task].updatedAt)));
  assert.equal(risolviSessione(coordDir, task, true, context), sessionId);
  assert.equal(risolviSessione(coordDir, task, sessionId, context), sessionId);
  assert.throws(() => risolviSessione(coordDir, task, "wrong", context), /sessionId/);
  assert.throws(() => risolviSessione(coordDir, task, true, { ...context, cwd: wtDir }), /cwd/);
  assert.throws(() => risolviSessione(coordDir, task, true, { ...context, profile: "workspace-write" }), /profile/);
  assert.throws(() => risolviSessione(coordDir, task, true, { ...context, provider: "altro" }), /provider/);
  assert.throws(() => risolviSessione(coordDir, "T-ASSENTE", true, context), /sessione/);

  if (provider === "claude") continue;
  for (const [event, count, reason] of [[records[2], 4, /chiamate identiche/], [records[3], 3, /errori consecutivi/]]) {
    const script = `const line = ${JSON.stringify(JSON.stringify(event))}; for (let i = 0; i < ${count}; i++) console.log(line); setInterval(() => {}, 1000);`;
    const loop = spawnSync(process.execPath, [
      runnerScript, "--task", `T-LOOP-${provider}`, "--coord", coordDir, "--agent", provider,
      "--", process.execPath, "-e", script,
    ], { cwd: testDir, encoding: "utf8", timeout: 20000 });
    assert.ok(loop.status > 0, loop.stderr);
    assert.match(loop.stderr, /\[CircuitBreaker\].*STEERING[\s\S]*CONSTRAINED[\s\S]*TRIP/);
    assert.match(loop.stderr, reason);
  }
}

// 15. Permessi predefiniti, opt-in esplicito e argomenti di resume.
const allowlistPath = claude.assicuraAllowlistClaude(testDir, "workspace-write");
assert.equal(allowlistPath, join(testDir, ".claude", "settings.local.json"));
let local = JSON.parse(readFileSync(allowlistPath, "utf8"));
assert.deepEqual(local.permissions.allow, [...claude.ALLOW_WORKSPACE_WRITE]);
assert.ok(local.permissions.deny.includes("Bash(git push*)"));
local.env = { TEST: "preservato" };
local.permissions.allow.push("mcp__custom__tool");
local.permissions.deny = ["Read(./privato/**)"];
writeFileSync(allowlistPath, JSON.stringify(local));
claude.assicuraAllowlistClaude(testDir, "workspace-write");
local = JSON.parse(readFileSync(allowlistPath, "utf8"));
assert.ok(local.permissions.allow.includes("mcp__custom__tool"), "Regole custom allow devono essere preservate in workspace-write");
assert.ok(local.permissions.deny.includes("Read(./privato/**)"));
assert.ok(local.permissions.deny.includes("Bash(git push*)"));
claude.assicuraAllowlistClaude(testDir, "read-only");
local = JSON.parse(readFileSync(allowlistPath, "utf8"));
assert.deepEqual(local.permissions.allow, [...claude.ALLOW_READ_ONLY]);
assert.deepEqual(local.env, { TEST: "preservato" });
assert.ok(local.permissions.deny.includes("Read(./privato/**)"));
assert.equal(local.permissions.defaultMode, "plan");
assert.deepEqual(claude.buildCommand({ profile: "read-only", resumeId: "s" }).args, [
  "-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "plan", "--resume", "s",
]);
for (const adapter of [claude, codex, agy]) {
  assert.ok(adapter.buildCommand({ directorOverride: "true" }).args.every(arg => !arg.startsWith("--dangerously-")));
}
assert.ok(claude.buildCommand({ directorOverride: true }).args.includes("--dangerously-skip-permissions"));
assert.deepEqual(codex.buildCommand({ prompt: "a\nb", profile: "read-only", resumeId: "s" }), {
  exe: "codex", args: ["exec", "resume", "s", "--json", "--sandbox", "read-only", "-"], stdinText: "a\nb",
});
assert.deepEqual(agy.buildCommand({ prompt: "a\nb", model: "m", resumeId: "s" }).args, [
  "-p", "a\nb", "--output-format", "stream-json", "-r", "s", "--model", "m",
]);
assert.equal(analizzaArgomenti(argv("--resume", "--profile", "read-only")).resume, true);
assert.equal(analizzaArgomenti(argv("--resume", "s")).resume, "s");
assert.throws(() => analizzaArgomenti(argv("--profile", "full")), /profile non valido/);

// 16. Formato AGY effettivo: il record DONE conta una sola volta per invocazione.
const agyInit = { event: "init", conversation_id: "session-agy-docs", init: { cwd: testDir } };
const agyStep = {
  event: "step_update",
  step_update: {
    step_index: 4, step_type: "tool", state: "DONE", tool_name: "run_command",
    tool_info: { parameters: { CommandLine: "test" }, error: { message: "ko" } },
  },
};
assert.deepEqual(agy.parseEvent(JSON.stringify(agyInit)), [
  { provider: "agy", type: "session", sessionId: "session-agy-docs" },
]);
assert.deepEqual(agy.parseEvent(JSON.stringify({ ...agyStep, step_update: { ...agyStep.step_update, state: "ACTIVE" } })), []);
assert.deepEqual(agy.parseEvent(JSON.stringify(agyStep)), [
  { provider: "agy", type: "tool_call", name: "run_command", input: { CommandLine: "test" } },
  { provider: "agy", type: "tool_result", name: "run_command", isError: true, detail: "ko" },
]);
assert.deepEqual(agy.parseEvent(JSON.stringify({ event: "result", result: { status: "ERROR", error: "ko" } })), [
  { provider: "agy", type: "error", detail: "ko" },
]);

// 17. Percorso di lancio nativo e resume con eseguibili di test, senza provider esterni.
const providerBin = join(testDir, "fixture-bin");
mkdirSync(providerBin);
for (const [provider, , records] of fixtures) {
  const isWindows = process.platform === "win32";
  const executable = join(providerBin, provider + (isWindows ? ".js" : ""));
  writeFileSync(executable, `#!/usr/bin/env node
    const fs = require("node:fs");
    const args = process.argv.slice(2);
    const settings = process.env.TASK_ATTIVO.endsWith("claude")
      ? JSON.parse(fs.readFileSync(".claude/settings.local.json", "utf8")).permissions : null;
    const input = args[0]?.startsWith("--print=") ? args[0].slice(8) : fs.readFileSync(0, "utf8");
    process.stdout.write(${JSON.stringify(JSON.stringify(provider === "agy" ? agyInit : records[0]))} + "\\n");
    process.stdout.write("FIXTURE " + JSON.stringify({ args, input, settings }) + "\\n");
  `);
  if (isWindows) writeFileSync(join(providerBin, provider + ".cmd"), `"%_prog%" "%dp0%\\${provider}.js" %*\r\n`);
  else chmodSync(executable, 0o700);

  const fixtureOptions = {
    cwd: testDir, encoding: "utf8", timeout: 20000,
    env: { ...process.env, PATH: providerBin + delimiter + process.env.PATH },
  };
  const runnerArgs = [
    runnerScript, "--task", `T-SESSION-${provider}`, "--coord", coordDir, "--agent", provider,
    "--prompt-file", promptTestFile,
  ];
  const mismatch = spawnSync(process.execPath, [...runnerArgs, "--resume"], fixtureOptions);
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /profile diverso/);
  const resumed = spawnSync(process.execPath, [...runnerArgs, "--profile", "read-only", "--resume", `session-${provider}`], fixtureOptions);
  assert.equal(resumed.status, 0, resumed.stderr);
  const { args, input, settings } = JSON.parse(resumed.stdout.match(/^FIXTURE (.+)$/m)[1]);
  assert.equal(input, "testo prompt da file");
  assert.ok(!args.some(arg => arg.startsWith("--dangerously-")));
  if (provider === "claude") {
    assert.deepEqual(args.slice(-2), ["--resume", "session-claude"]);
    assert.deepEqual(settings.allow, [...claude.ALLOW_READ_ONLY]);
  } else if (provider === "codex") {
    assert.deepEqual(args, ["exec", "--json", "--sandbox", "read-only", "resume", "session-codex", "-"]);
  } else {
    assert.deepEqual(args.slice(-4), ["--conversation", "session-agy", "--mode", "plan"]);
    const raw = readFileSync(join(coordDir, "logs", "T-SESSION-agy.jsonl"), "utf8");
    assert.deepEqual(JSON.parse(raw.trimEnd().split("\n").at(-1)), agyInit);
  }
}

// 18. Timeout ricorsivo: il discendente parte e viene fermato insieme al figlio.
const sopravvissuto = join(testDir, "discendente-sopravvissuto");
const scriptDiscendente = `console.log("DISCENDENTE PRONTO");
  setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(sopravvissuto)}, "vivo"), 1100);`;
const albero = `require("node:child_process").spawn(process.execPath,
  ["-e", ${JSON.stringify(scriptDiscendente)}], { stdio: "inherit" });
  setInterval(() => {}, 1000);`;
const timeout = spawnSync(process.execPath, [
  runnerScript, "--coord", coordDir, "--timeout-ms", "600",
  "--", process.execPath, "-e", albero,
], { cwd: testDir, encoding: "utf8", timeout: 20000 });
assert.equal(timeout.status, 124, timeout.stderr);
assert.match(timeout.stderr, /TIMEOUT/);
assert.match(timeout.stdout, /DISCENDENTE PRONTO/);
await new Promise(resolve => setTimeout(resolve, 1150));
assert.ok(!existsSync(sopravvissuto), "Il discendente deve fermarsi prima di scrivere il marker");

console.log("runner: collaudi superati con successo");
