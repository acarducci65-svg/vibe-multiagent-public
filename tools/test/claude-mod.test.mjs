/**
 * Test deterministici e offline per il modulo Claude Mod (tools/claude-mod)
 */

import { strictEqual, ok } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { valutaComando, registraCheckpoint, formattaStatoTerminale, register, firmaOverride } from "../claude-mod/hooks/register.js";

let superati = 0;
const test = (nome, fn) => {
  try {
    fn();
    superati++;
  } catch (err) {
    console.error(`FALLITO: ${nome}`);
    throw err;
  }
};

console.log("Esecuzione test per Claude Mod...");

// 1. Test Valutazione Comandi Vietati
test("valutaComando blocca git push", () => {
  const res = valutaComando("git push origin main");
  strictEqual(res.allowed, false);
  ok(res.reason.includes("git push"));
});

test("valutaComando blocca npm publish", () => {
  const res = valutaComando("npm publish");
  strictEqual(res.allowed, false);
});

test("valutaComando blocca deploy cloud", () => {
  const res = valutaComando("vercel deploy --prod");
  strictEqual(res.allowed, false);
});

test("valutaComando blocca --dangerously-skip-permissions", () => {
  const res = valutaComando("claude --dangerously-skip-permissions");
  strictEqual(res.allowed, false);
});

test("valutaComando consente comandi ordinari", () => {
  strictEqual(valutaComando("npm test").allowed, true);
  strictEqual(valutaComando("git status").allowed, true);
  strictEqual(valutaComando("node server.js").allowed, true);
});

test("valutaComando rifiuta file override non firmato o privo di token (S-1 fix)", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "vibe-override-test-"));
  try {
    const coordDir = join(tempDir, ".coord");
    mkdirSync(coordDir, { recursive: true });
    writeFileSync(join(coordDir, "DIRECTOR_OVERRIDE"), "fake-override", "utf8");

    const res = valutaComando("git push origin main", tempDir);
    strictEqual(res.allowed, false, "Un file non firmato non deve disabilitare il guardrail");

    // Con token valido
    process.env.DIRECTOR_TOKEN = "secret-12345";
    writeFileSync(join(coordDir, "DIRECTOR_OVERRIDE"), "secret-12345", "utf8");
    const resAuth = valutaComando("git push origin main", tempDir);
    strictEqual(resAuth.allowed, true, "File con token valido deve concedere l'override");
  } finally {
    delete process.env.DIRECTOR_TOKEN;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
test("valutaComando: file vuoti, finte firme e EMERGENCY_OVERRIDE non firmati non sbloccano (S-1)", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "vibe-override-s1-"));
  const prima = process.env.DIRECTOR_TOKEN;
  delete process.env.DIRECTOR_TOKEN;
  try {
    const coordDir = join(tempDir, ".coord");
    mkdirSync(coordDir, { recursive: true });
    for (const nome of ["DIRECTOR_OVERRIDE", "EMERGENCY_OVERRIDE"]) {
      for (const contenuto of ["", "AUTORIZZATO DAL DIRETTORE", "AUTORIZZATO_DA_DIRETTORE:" + "a".repeat(64)]) {
        writeFileSync(join(coordDir, nome), contenuto, "utf8");
        strictEqual(valutaComando("git push origin main", tempDir).allowed, false, `${nome}=${JSON.stringify(contenuto)} senza token non deve sbloccare`);
      }
      rmSync(join(coordDir, nome));
    }
    // Firma HMAC valida solo con il token giusto nell'ambiente
    process.env.DIRECTOR_TOKEN = "segreto-direttore-xyz";
    writeFileSync(join(coordDir, "EMERGENCY_OVERRIDE"), firmaOverride("segreto-direttore-xyz"), "utf8");
    strictEqual(valutaComando("git push origin main", tempDir).allowed, true, "firma HMAC valida deve sbloccare");
    writeFileSync(join(coordDir, "EMERGENCY_OVERRIDE"), firmaOverride("altro-segreto-123"), "utf8");
    strictEqual(valutaComando("git push origin main", tempDir).allowed, false, "firma con token diverso non deve sbloccare");
    // Token troppo corto ignorato
    process.env.DIRECTOR_TOKEN = "abc";
    writeFileSync(join(coordDir, "EMERGENCY_OVERRIDE"), "abc", "utf8");
    strictEqual(valutaComando("git push origin main", tempDir).allowed, false, "token sotto la lunghezza minima ignorato");
  } finally {
    if (prima === undefined) delete process.env.DIRECTOR_TOKEN; else process.env.DIRECTOR_TOKEN = prima;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
test("valutaComando rispetta DIRECTOR_OVERRIDE da env", () => {
  process.env.DIRECTOR_OVERRIDE = "1";
  try {
    const res = valutaComando("git push origin main");
    strictEqual(res.allowed, true);
  } finally {
    delete process.env.DIRECTOR_OVERRIDE;
  }
});

// 2. Test Checkpoint su Disco
test("registraCheckpoint scrive i fatti nel Punto di ripresa del task IN CORSO", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "vibe-mod-test-"));
  try {
    const tasksDir = join(tempDir, ".coord", "tasks");
    mkdirSync(tasksDir, { recursive: true });

    const taskContent = `---
ID: T-101
Titolo: Test Task
---
Stato: IN CORSO

## Descrizione
Test

## Punto di ripresa
- Fatti iniziali
`;
    writeFileSync(join(tasksDir, "T-101.md"), taskContent, "utf8");

    const esito = registraCheckpoint("src/core.js", tempDir);
    strictEqual(esito, true);

    const aggiornato = readFileSync(join(tasksDir, "T-101.md"), "utf8");
    ok(aggiornato.includes("- Fatti:"));
    ok(aggiornato.includes("modificato: src/core.js"));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// 3. Test Formattazione Barra Terminale
test("formattaStatoTerminale estrae correttamente sprint e task attivo", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "vibe-mod-status-"));
  try {
    const coordDir = join(tempDir, ".coord");
    const tasksDir = join(coordDir, "tasks");
    mkdirSync(tasksDir, { recursive: true });

    writeFileSync(join(coordDir, "CURRENT_SPRINT.md"), "# Sprint 3 - Core Features\n", "utf8");
    writeFileSync(join(tasksDir, "T-202.md"), "ID: T-202\nStato: IN CORSO\n## Punto di ripresa\n", "utf8");

    const stato = formattaStatoTerminale(tempDir);
    ok(stato.includes("Sprint 3"));
    ok(stato.includes("Task: T-202"));
    ok(stato.includes(".coord/dashboard.html"));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// 4. Test Registrazione Hook register(on)
test("register(on) registra tool.call e ui.render e blocca Bash pericolosi", async () => {
  const handlers = {};
  const mockOn = (evento, fn) => {
    handlers[evento] = fn;
  };

  register(mockOn);
  ok(typeof handlers["tool.call"] === "function");
  ok(typeof handlers["ui.render"] === "function");

  // Simula tool.call su comando vietato
  const bloccato = await handlers["tool.call"]({}, {
    tool: "Bash",
    command: "git push origin main"
  }, (e) => ({ allowed: true }));

  strictEqual(bloccato.block, true);
  ok(bloccato.reason.includes("git push"));

  // Simula tool.call su comando permesso
  let chiamatoNext = false;
  const permesso = await handlers["tool.call"]({}, {
    tool: "Bash",
    command: "npm test"
  }, (e) => {
    chiamatoNext = true;
    return { ok: true };
  });

  strictEqual(chiamatoNext, true);
  strictEqual(permesso.ok, true);

  // Simula ui.render
  let uiChiamato = false;
  await handlers["ui.render"]({}, {}, (e) => {
    uiChiamato = true;
    return { ok: true };
  });
  strictEqual(uiChiamato, true);
});

console.log(`claude-mod: ${superati} collaudi superati con successo`);

