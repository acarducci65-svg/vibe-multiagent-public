import { inviaMessaggio, smistaPosta, drenaInbox, ATTI_PERMESSI } from "../mail-router.mjs";
import { mkdtempSync, rmSync, existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";

const tempDir = mkdtempSync(join(tmpdir(), "vibe-mail-test-"));

try {
  const coordDir = join(tempDir, ".coord");

  // 1. Invia messaggio da Claude a Codex
  const msg1 = inviaMessaggio({
    dirCoord: coordDir,
    from: "claude",
    to: "codex",
    act: "request",
    subject: "Implementazione AST parser",
    body: "Richiesta implementazione come da TASK-022",
    taskId: "TASK-022",
    dispatchId: "DISP-022-A",
    requiresReply: true
  });

  assert.ok(msg1.id, "Il messaggio deve avere un ID generato");
  assert.equal(msg1.from, "claude");
  assert.equal(msg1.to, "codex");
  assert.equal(msg1.act, "request");

  // Verifica presenza nella outbox di claude
  const outboxClaude = join(coordDir, "mail", "agents", "claude", "outbox");
  assert.ok(existsSync(outboxClaude));
  const outFiles = readdirSync(outboxClaude).filter(f => f.endsWith(".json"));
  assert.equal(outFiles.length, 1);

  // 2. Smista la posta
  const report = smistaPosta(coordDir);
  assert.equal(report.consegnati, 1);
  assert.equal(report.errori.length, 0);

  // Verifica che il messaggio sia arrivato nella inbox di codex
  const inboxCodex = join(coordDir, "mail", "agents", "codex", "inbox");
  assert.ok(existsSync(inboxCodex));
  const inFiles = readdirSync(inboxCodex).filter(f => f.endsWith(".json"));
  assert.equal(inFiles.length, 1);

  // 3. Codex drena la sua inbox
  const letti = drenaInbox(coordDir, "codex");
  assert.equal(letti.length, 1);
  assert.equal(letti[0].subject, "Implementazione AST parser");

  // Verifica che la inbox sia vuota e i messaggi siano in .done
  const remainingInFiles = readdirSync(inboxCodex).filter(f => f.endsWith(".json") && !f.startsWith("."));
  assert.equal(remainingInFiles.length, 0);
  const doneFiles = readdirSync(join(inboxCodex, ".done")).filter(f => f.endsWith(".json"));
  assert.equal(doneFiles.length, 1);

  // 4. Test validazione atto non permesso
  assert.throws(() => {
    inviaMessaggio({
      dirCoord: coordDir,
      from: "claude",
      to: "codex",
      act: "invalid_act",
      subject: "Test"
    });
  }, /Atto di comunicazione non valido/);

  const cli = fileURLToPath(new URL("../mail-router.mjs", import.meta.url));
  const cliCoord = join(tempDir, "cli-coord");
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const sent = run("send", "--from", "claude", "--to", "codex", "--act", "request", "--subject", "Lavoro", "--body", "Corpo", "--task", "TASK-023", "--dispatch-id", "DISP-023-A", "--reply", "--coord", cliCoord);
  assert.equal(sent.status, 0, sent.stderr);
  const request = JSON.parse(sent.stdout);
  assert.equal(request.requiresReply, true);
  assert.equal(request.taskId, "TASK-023");
  assert.equal(request.dispatchId, "DISP-023-A");
  assert.equal(request.body, "Corpo");
  assert.equal(JSON.parse(run("route", "--coord", cliCoord).stdout).consegnati, 1);
  assert.equal(JSON.parse(run("drain", "--agent", "codex", "--coord", cliCoord).stdout)[0].id, request.id);
  for (const act of ["agree", "inform", "done"]) {
    const result = run("send", "--from", "codex", "--to", "claude", "--act", act, "--subject", act, "--requires-reply", "--coord", cliCoord);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).requiresReply, true);
    assert.equal(JSON.parse(run("route", "--coord", cliCoord).stdout).consegnati, 1);
    assert.equal(JSON.parse(run("drain", "--agent", "claude", "--coord", cliCoord).stdout)[0].act, act);
  }
  assert.equal(run("--help").status, 0);
  assert.notEqual(run("unknown").status, 0);
  assert.notEqual(run("send", "--from").status, 0);
  assert.notEqual(run("drain", "--coord", cliCoord).status, 0);
  const badOutbox = join(cliCoord, "mail", "agents", "claude", "outbox");
  mkdirSync(badOutbox, { recursive: true });
  writeFileSync(join(badOutbox, "corrupt.json"), "{broken");
  const badReport = JSON.parse(run("route", "--coord", cliCoord).stdout);
  assert.equal(badReport.errori.length, 1);
  assert.match(badReport.errori[0].file, /corrupt\.json$/);
  const parallelCoord = join(tempDir, "parallel");
  const sendParallel = (i) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "send", "--from", "claude", "--to", "codex", "--act", "inform", "--subject", String(i), "--coord", parallelCoord]);
    let output = "", error = "";
    child.stdout.on("data", chunk => output += chunk);
    child.stderr.on("data", chunk => error += chunk);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error)));
  });
  const parallel = await Promise.all(Array.from({ length: 20 }, (_, i) => sendParallel(i)));
  assert.equal(new Set(parallel.map(msg => msg.id)).size, 20);
  assert.equal(smistaPosta(parallelCoord).consegnati, 20);
  assert.equal(drenaInbox(parallelCoord, "codex").length, 20);

  console.log("mail-router: tutti i collaudi superati con successo (FIPA-lite, single-writer, atomic delivery)");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
