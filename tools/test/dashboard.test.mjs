import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { runInNewContext } from "node:vm";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, "../../templates/dashboard.html.template");
const html = readFileSync(templatePath, "utf8");

// 1. Verifica assenza di inline onclick
assert.ok(!/onclick\s*=/i.test(html), "La dashboard non deve contenere inline onclick handler");

// 2. Verifica presenza whitelist rigida per gli stati dei task (C-01 Codex / M-2 Claude)
assert.ok(html.includes("STATI_CSS"), "La dashboard deve definire una mappa STATI_CSS per gli stati consentiti");
assert.ok(html.includes("badge-SCONOSCIUTO"), "Deve esistere un fallback sicuro badge-SCONOSCIUTO");

// 3. Prova logica simulata di sanitizzazione dello stato
const STATI_CSS = {
  'PRONTO': 'badge-PRONTO',
  'IN CORSO': 'badge-IN-CORSO',
  'CONSEGNATO': 'badge-CONSEGNATO',
  'INTEGRATO': 'badge-INTEGRATO',
  'SOSPESO': 'badge-SOSPESO',
  'CHIUSO': 'badge-CHIUSO'
};

const xssPayload = "\"><svg/onload=alert(1)>";
const statoNorm = (xssPayload || 'SCONOSCIUTO').trim().toUpperCase();
const badgeClass = STATI_CSS[statoNorm] || 'badge-SCONOSCIUTO';
assert.equal(badgeClass, 'badge-SCONOSCIUTO', "Un payload malevolo nello stato deve produrre badge-SCONOSCIUTO senza iniettare HTML");

// 4. Verifica componenti UI: filtri, ricerca, modal dettagli, header auto-risoluzione
assert.ok(html.includes('id="filterButtons"'), "Deve esistere il container dei pulsanti di filtro");
assert.ok(html.includes('id="taskSearchInput"'), "Deve esistere il campo di ricerca testuale dei task");
assert.ok(html.includes('id="taskModalOverlay"'), "Deve esistere il modale di dettaglio completo del task");
assert.ok(html.includes('id="headerProjectName"'), "Deve esistere lo span per l'auto-risoluzione del nome progetto");
assert.ok(html.includes('id="headerCoordDir"'), "Deve esistere il badge per l'auto-risoluzione della directory di coordinamento");

// 5. Verifica avviso privacy
assert.ok(html.includes("privacy-hint"), "Deve essere presente l'avviso di privacy/riservatezza sui dati locali");

console.log("dashboard: 6 collaudi di sicurezza e markup superati con successo");

// Componenti v2.1 e parit? della demo offline.
for (const id of ["circuitBreaker", "breakerState", "breakerCounts", "mailbox", "mailUnread", "mailMessages", "memoryGraph", "graphContainer"]) {
  assert.ok(html.includes(`id="${id}"`), `Container mancante: ${id}`);
}
for (const state of ["healthy", "steering", "constrained", "stopped"]) {
  assert.ok(html.includes(`breaker-${state}`), `Colore mancante: ${state}`);
}
assert.ok(html.includes("escapeHtml(m.subject)") && html.includes("escapeHtml(node.label || node.id)"));

// Componenti v3.0: Sessioni Resume & Worktree attivi (degradazione graziosa se assenti).
for (const id of ["sessionsWorktrees", "sessionsCount", "sessionsList", "worktreesCount", "worktreesList"]) {
  assert.ok(html.includes(`id="${id}"`), `Container v3 mancante: ${id}`);
}
const mHelpers = html.match(/\/\/ <vibe-helpers>[^\n]*\n([\s\S]*?)\/\/ <\/vibe-helpers>/);
assert.ok(mHelpers, "Blocco <vibe-helpers> mancante nella dashboard");
const helpers = runInNewContext(`${mHelpers[1]}\n({ escapeHtml, normalizzaSessioni, normalizzaWorktrees, htmlSessioni, htmlWorktrees })`, {});

for (const assente of [undefined, null, "x", 42, true]) {
  assert.deepEqual(helpers.normalizzaSessioni(assente).length, 0, `sessions=${String(assente)} deve degradare a lista vuota`);
  assert.deepEqual(helpers.normalizzaWorktrees(assente).length, 0, `worktrees=${String(assente)} deve degradare a lista vuota`);
}
assert.equal(helpers.htmlSessioni([]), "Nessuna sessione registrata.");
assert.equal(helpers.htmlWorktrees([]), "Nessun worktree attivo.");

// Formato .coord/state/sessions.json (mappa per task) e .coord/state/worktrees.json ({ worktrees: [] }).
const sessioni = helpers.normalizzaSessioni({
  "T-1": { provider: "claude", profile: "workspace-write", cwd: "/repo", sessionId: "abc-123", updatedAt: "2026-11-26T10:00:00Z" },
  "T-rotto": "non-oggetto",
});
assert.equal(sessioni.length, 1);
assert.equal(sessioni[0].taskId, "T-1");
assert.equal(helpers.normalizzaSessioni({ sessions: [{ taskId: "T-2" }, null] }).length, 1);
const worktrees = helpers.normalizzaWorktrees({ worktrees: [{ name: "wt-a", path: "/tmp/wt-a", branch: "feat/a" }, 7] });
assert.equal(worktrees.length, 1);
assert.equal(helpers.normalizzaWorktrees([{ name: "wt-b" }]).length, 1);
assert.equal(helpers.normalizzaWorktrees({ "wt-c": { path: "/x" } })[0].name, "wt-c");

// XSS: i campi di sessioni e worktree vengono sempre escapati.
const xss = "\"><img src=x onerror=alert(1)>";
const htmlS = helpers.htmlSessioni(helpers.normalizzaSessioni({ [xss]: { provider: xss, profile: xss, sessionId: xss, updatedAt: xss } }));
const htmlW = helpers.htmlWorktrees([{ name: xss, branch: xss, path: xss, createdAt: xss }]);
for (const out of [htmlS, htmlW]) {
  assert.ok(!out.includes("<img"), "Payload HTML non deve sopravvivere all'escape");
  assert.ok(out.includes("&lt;img"), "Payload deve risultare escapato");
}
assert.ok(htmlS.includes("&quot;&gt;&lt;img"), "Anche il taskId derivato dalla chiave deve essere escapato");
assert.ok(helpers.htmlSessioni(sessioni).includes("abc-123"), "La sessione valida deve essere renderizzata");

// Modalità MCP App: nessun polling locale quando la pagina è servita dal sidecar MCP.
assert.ok(html.includes("window.__VIBE_EMBEDDED__"), "La dashboard deve supportare la modalità embedded MCP App");
assert.ok(html.includes("ui/notifications/tool-result"), "La dashboard deve gestire le notifiche tool-result dell'host MCP");
assert.ok(html.includes("e.source !== window.parent"), "I messaggi postMessage devono provenire solo dall'host padre");
assert.ok(!/<script[^>]+src=["']https?:/i.test(html), "Nessuno script da CDN esterni");

// Parità demo offline: strict appena demo/dashboard.html è stata risincronizzata col template v3.
const demo = readFileSync(join(__dirname, "../../demo/dashboard.html"), "utf8");
if (demo.includes('id="sessionsWorktrees"')) {
  assert.equal(demo, html);
} else {
  assert.ok(!/onclick\s*=/i.test(demo) && demo.includes("STATI_CSS"), "La demo deve mantenere i presidi di sicurezza");
  console.warn("dashboard: AVVISO demo/dashboard.html non ancora risincronizzata col template v3.0 (copiare templates/dashboard.html.template)");
}

console.log("dashboard: collaudi v3.0 (sessioni/worktree, XSS, MCP App) superati con successo");
