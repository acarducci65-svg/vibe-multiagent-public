import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { strict as assert } from "node:assert";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

// 1. Test unitari di formattaRigaNdjson
const { formattaRigaNdjson, creaGestoreStream, analizzaArgomenti } = await import("../runner.mjs");

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
const { CircuitBreaker, STATI_BREAKER, ErroreArgomenti, costruisciEnvFiglio, risolviCwdEsecuzione } = await import("../runner.mjs");

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
  assert.equal(r.cmd, "codex exec --dangerously-bypass-approvals-and-sandbox -", "Codex: default non interattivo anche senza --prompt-file");
  const rm = analizzaArgomenti(argv("--agent", "codex", "--model", "gpt-6-astra", "--prompt-file", "p.txt", "-w", "../wt", "-d", "DISP-024-A"));
  assert.equal(rm.cmd, "codex exec -m gpt-6-astra --dangerously-bypass-approvals-and-sandbox -");
  assert.equal(rm.worktree, "../wt");
  assert.equal(rm.dispatchId, "DISP-024-A");
  const rc = analizzaArgomenti(argv("--agent", "codex", "--cmd", "codex exec --sandbox read-only -"));
  assert.equal(rc.cmd, "codex exec --sandbox read-only -", "Codex con --cmd esplicito: nessun override");
  const rd = analizzaArgomenti(argv("--agent", "codex", "--", "node", "-v"));
  assert.equal(rd.cmd, "node -v", "Codex con comando dopo --: nessun override");
}
{
  const r = analizzaArgomenti(argv("--agent", "claude", "--prompt-file", "p.txt", "--model", "opus", "--worktree", "wt", "--dispatch-id", "D1"));
  assert.equal(r.cmd, "claude -p - --dangerously-skip-permissions --output-format stream-json --verbose --model opus");
  assert.equal(r.worktree, "wt");
  assert.equal(r.dispatchId, "D1");
  const ra = analizzaArgomenti(argv("--agent", "AGY", "--prompt-file", "p.txt", "-m", "gemini-3.1-pro-high", "--dispatch-id", "D2"));
  assert.equal(ra.agent, "agy");
  assert.equal(ra.cmd, "agy -p - -m gemini-3.1-pro-high");
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
const wtDir = join(testDir, "wt-e2e");
mkdirSync(wtDir, { recursive: true });
const cmdEnv = "node -e \"console.log('CWD=' + process.cwd() + '|DISP=' + process.env.DISPATCH_ID + '|TASK=' + process.env.TASK_ATTIVO)\"";
const rWt = spawnSync(process.execPath, [
  runnerScript,
  "--task", "T-WT",
  "--coord", coordDir,
  "--worktree", "wt-e2e",
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
assert.match(logWt, /Worktree: wt-e2e \(cwd: /);

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

// Pulizia
rmSync(testDir, { recursive: true, force: true });
console.log("runner: collaudi superati con successo");
