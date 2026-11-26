import { inviaMessaggio, smistaPosta, drenaInbox, ATTI_PERMESSI } from "../mail-router.mjs";
import { mkdtempSync, rmSync, existsSync, readdirSync, mkdirSync, writeFileSync, utimesSync, openSync, closeSync, readFileSync } from "node:fs";
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
  let invocation = 0;
  function cattura(avvia) {
    const base = join(tempDir, `cli-${invocation++}`);
    const out = base + ".out";
    const err = base + ".err";
    const fdOut = openSync(out, "w");
    const fdErr = openSync(err, "w");
    try {
      return {
        child: avvia(["ignore", fdOut, fdErr]),
        leggi: () => ({ stdout: readFileSync(out, "utf8"), stderr: readFileSync(err, "utf8") }),
      };
    } finally {
      closeSync(fdOut);
      closeSync(fdErr);
    }
  }
  const run = (...args) => {
    const { child, leggi } = cattura(stdio => spawnSync(process.execPath, [cli, ...args], { stdio }));
    if (child.error) throw child.error;
    return { ...child, ...leggi() };
  };
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
  const runParallel = (...args) => new Promise((resolve, reject) => {
    const { child, leggi } = cattura(stdio => spawn(process.execPath, [cli, ...args], { stdio }));
    child.on("error", reject);
    child.on("close", code => {
      try {
        const { stdout, stderr } = leggi();
        if (code !== 0) throw new Error(stderr);
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(err);
      }
    });
  });
  const raccogli = async esecuzioni => (await Promise.allSettled(esecuzioni)).map(result => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
  const parallel = await raccogli(Array.from({ length: 20 }, (_, i) => runParallel(
    "send", "--from", "claude", "--to", "codex", "--act", "inform", "--subject", String(i), "--coord", parallelCoord,
  )));
  assert.equal(new Set(parallel.map(msg => msg.id)).size, 20);
  const reports = await raccogli([
    runParallel("route", "--coord", parallelCoord),
    runParallel("route", "--coord", parallelCoord),
  ]);
  assert.deepEqual(reports.map(report => report.consegnati).sort((a, b) => a - b), [0, 20]);
  assert.ok(reports.every(report => report.errori.length === 0));
  assert.equal(drenaInbox(parallelCoord, "codex").length, 20);

  // Un processo vivo mantiene il lock anche oltre il TTL. Un lock orfano
  // viene ripreso soltanto quando supera il TTL configurato.
  const lockCoord = join(tempDir, "lock");
  const lock = join(lockCoord, "mailbox", ".router.lock");
  const msg = inviaMessaggio({ dirCoord: lockCoord, from: "claude", to: "codex", subject: "Lock" });
  const src = join(lockCoord, "mail", "agents", "claude", "outbox", msg.id + ".json");
  mkdirSync(lock, { recursive: true });
  const live = join(lock, "owner-live.json");
  writeFileSync(live, JSON.stringify({ pid: process.pid }));
  const old = new Date("2000-01-01T00:00:00Z");
  utimesSync(live, old, old);
  assert.deepEqual(smistaPosta(lockCoord, { lockTtlMs: 1000 }), {
    consegnati: 0, errori: [], lockOccupato: true,
  });
  assert.ok(existsSync(src));
  assert.ok(existsSync(live));
  rmSync(live);

  // Il PID appartiene a un figlio già terminato.
  const ended = run("--help");
  assert.equal(ended.status, 0, ended.stderr);
  const orphan = join(lock, "owner-orphan.json");
  writeFileSync(orphan, JSON.stringify({ pid: ended.pid }));
  assert.equal(smistaPosta(lockCoord, { lockTtlMs: 60_000 }).consegnati, 0);
  assert.ok(existsSync(orphan));
  utimesSync(orphan, old, old);
  assert.equal(smistaPosta(lockCoord, { lockTtlMs: 1000 }).consegnati, 1);
  assert.equal(existsSync(lock), false);
  assert.equal(existsSync(src), false);
  assert.equal(drenaInbox(lockCoord, "codex")[0].id, msg.id);

  console.log("mail-router: tutti i collaudi superati con successo (FIPA-lite, single-writer, atomic delivery)");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
