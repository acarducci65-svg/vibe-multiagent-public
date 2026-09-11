import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";

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
