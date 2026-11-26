/**
 * Claude Mod per Vibe Multiagent v3.0.0 (compatibile con Claude Code v2.1.318+, retrocompatibile v2.1.287+)
 *
 * Fornisce presidi meccanici in-process:
 * 1. Gate Guardrail: blocca comandi di pubblicazione, deploy e bypass permessi non autorizzati dal Direttore
 *    su tutti i tool shell (Bash, PowerShell, pwsh, run_command) e sull'evento PreSkillShellCommand.
 * 2. Auto-Checkpoint post-esecuzione: registra le modifiche ai file nel "Punto di ripresa" del task IN CORSO
 *    solo dopo un esito positivo del tool (tool.result / PostToolUse), più un marker su PreCompact.
 * 3. Lifecycle Worktree: traccia WorktreeCreate / WorktreeRemove in .coord/state/worktrees.json (scrittura atomica).
 * 4. Terminal Status Band: riga di stato con sprint e task attivo, servita da cache in memoria
 *    invalidata da fs.watch (fallback TTL + mtimeMs).
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, statSync, unlinkSync, watch } from "node:fs";
import { resolve, join, normalize } from "node:path";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

// Regole dei comandi vietati (analogo a agy-gate.mjs)
export const COMANDI_VIETATI = [
  [/\bgit(\.exe)?\b.*\bpush\b/i, "git push è una pubblicazione: la autorizza il Direttore"],
  [/\b(npm|pnpm|yarn|bun)(\.cmd|\.exe|\.ps1|\.bat)?\s+(publish|deploy)\b/i, "pubblicazione di pacchetto"],
  [/\b(vercel|netlify|flyctl|fly|heroku|gcloud|aws|az)(\.cmd|\.exe|\.ps1|\.bat)?\b.*\b(deploy|publish|up)\b/i, "deploy verso un servizio esterno"],
  [/\b(prisma|knex|alembic|rails)(\.cmd|\.exe|\.ps1|\.bat)?\b.*\bmigrat/i, "migrazione di schema"],
  [/\b(npm|pnpm|yarn|bun)(\.cmd|\.exe|\.ps1|\.bat)?\b.*(-g\b|--global\b|\bglobal\s+add\b)/i, "installazione globale, fuori dal repository"],
  [/\b(curl|iwr|irm|wget)(\.exe)?\b[^|;]*\|\s*(ba)?sh\b/i, "scaricare ed eseguire uno script in un colpo solo"],
  [/\b(curl|iwr|irm|wget)(\.exe)?\b[^|;]*\|\s*(powershell|pwsh|iex)\b/i, "scaricare ed eseguire uno script in un colpo solo"],
  [/--dangerously-skip-permissions/i, "disattiva i permessi per conto del Direttore"],
  [/--dangerously-bypass-approvals/i, "disattiva le approvazioni per conto del Direttore"],
];

/** Tool shell intercettati dal gate (Claude Code su POSIX e Windows, Antigravity run_command). */
export const TOOL_SHELL = new Set(["Bash", "bash", "PowerShell", "powershell", "pwsh", "run_command"]);
/** Tool di modifica file che generano un checkpoint post-esecuzione. */
export const TOOL_MODIFICA = new Set(["Edit", "Write", "FileEdit", "MultiEdit", "NotebookEdit"]);

/** Lunghezza minima del segreto DIRECTOR_TOKEN per essere preso in considerazione. */
export const LUNGHEZZA_MINIMA_TOKEN = 8;
/** Contesto fisso firmato con HMAC-SHA256 per il formato `AUTORIZZATO_DA_DIRETTORE:<hex>`. */
export const CONTESTO_FIRMA_OVERRIDE = "vibe-multiagent:director-override:v1";

/**
 * Calcola la firma attesa per il file di override (strumento per il Direttore).
 * @param {string} token - Segreto DIRECTOR_TOKEN
 * @returns {string} contenuto da scrivere in .coord/DIRECTOR_OVERRIDE
 */
export function firmaOverride(token) {
  const hex = createHmac("sha256", String(token)).update(CONTESTO_FIRMA_OVERRIDE).digest("hex");
  return `AUTORIZZATO_DA_DIRETTORE:${hex}`;
}

function ugualeCostante(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * true solo se .coord/DIRECTOR_OVERRIDE o .coord/EMERGENCY_OVERRIDE contengono il token del Direttore
 * o la sua firma HMAC. Senza DIRECTOR_TOKEN nell'ambiente nessun file può concedere l'override (fail-closed).
 */
export function overrideFirmato(cwd = process.cwd()) {
  const token = process.env.DIRECTOR_TOKEN ?? "";
  if (token.length < LUNGHEZZA_MINIMA_TOKEN) return false;
  for (const nome of ["DIRECTOR_OVERRIDE", "EMERGENCY_OVERRIDE"]) {
    const p = resolve(cwd, ".coord", nome);
    if (!existsSync(p)) continue;
    try {
      const contenuto = readFileSync(p, "utf8").trim();
      if (ugualeCostante(contenuto, token) || ugualeCostante(contenuto, firmaOverride(token))) return true;
    } catch {}
  }
  return false;
}

/**
 * Valuta un comando shell per verificare se viola i guardrail del cantiere.
 * @param {string} cmd - Comando da verificare
 * @param {string} [cwd] - Directory di lavoro corrente
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function valutaComando(cmd, cwd = process.cwd()) {
  if (!cmd || typeof cmd !== "string") return { allowed: true };

  // Verifica override autorizzato del Direttore (S-1 hardening).
  // L'esistenza di un file (vuoto o con testo arbitrario) NON basta: un agente può crearlo con touch/Write.
  // Ammessi solo: DIRECTOR_OVERRIDE=1 nell'ambiente operatore, oppure file firmato con il segreto
  // DIRECTOR_TOKEN (che vive solo nell'ambiente del Direttore, mai su disco nel repository).
  if (process.env.DIRECTOR_OVERRIDE === "1") {
    return { allowed: true };
  }
  if (overrideFirmato(cwd)) {
    return { allowed: true };
  }

  for (const [re, motivo] of COMANDI_VIETATI) {
    if (re.test(cmd)) {
      return {
        allowed: false,
        reason: `Vietato dal protocollo Vibe Multiagent: ${motivo}. Riservato al Direttore umano.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Valuta un comando shell lanciato da una skill (evento PreSkillShellCommand, Claude Code v2.1.318+).
 * Applica le stesse regole del gate sui tool shell.
 * @param {string} cmd
 * @param {string} [cwd]
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function valutaPreSkillShellCommand(cmd, cwd = process.cwd()) {
  return valutaComando(typeof cmd === "string" ? cmd : "", cwd);
}

/**
 * Estrae la riga di comando da un evento di tool shell (Bash: command, run_command: CommandLine, altri: cmd).
 * @param {object} e
 * @returns {string}
 */
export function estraiComandoShell(e) {
  const fonti = [e, e?.input, e?.args, e?.toolInput, e?.tool_input];
  for (const f of fonti) {
    if (!f || typeof f !== "object") continue;
    const v = f.command ?? f.CommandLine ?? f.commandLine ?? f.cmd;
    if (typeof v === "string" && v) return v;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Ricerca del task attivo e scrittura nel "Punto di ripresa"
// ---------------------------------------------------------------------------

/** Riconosce `Stato: IN CORSO` anche nelle forme Markdown `- **Stato:** IN CORSO`. */
const REGEX_IN_CORSO = /^(?:[-*]\s+)?(?:\*\*)?Stato(?::\*\*|\*\*:|:)\s*IN CORSO\s*$/m;

function trovaTaskAttivo(dirTasks) {
  const taskAttivoEnv = process.env.TASK_ATTIVO?.replace(/[^a-zA-Z0-9_-]/g, "");
  if (taskAttivoEnv) {
    const p = join(dirTasks, `${taskAttivoEnv}.md`);
    if (existsSync(p)) return p;
  }
  const files = readdirSync(dirTasks).filter((f) => f.endsWith(".md")).sort();
  for (const f of files) {
    const fullPath = join(dirTasks, f);
    if (REGEX_IN_CORSO.test(readFileSync(fullPath, "utf8"))) return fullPath;
  }
  return null;
}

function aggiungiRigaRipresa(cwd, riga) {
  try {
    const dirTasks = resolve(cwd, ".coord", "tasks");
    if (!existsSync(dirTasks)) return false;
    const targetTaskFile = trovaTaskAttivo(dirTasks);
    if (!targetTaskFile) return false;

    let content = readFileSync(targetTaskFile, "utf8");
    const puntoRipresaRegex = /(## Punto di ripresa\s*\n)([\s\S]*?)(?=\n## |\n*$)/i;
    if (!puntoRipresaRegex.test(content)) return false;
    content = content.replace(puntoRipresaRegex, (match, header, body) => `${header}${riga}\n${body}`);
    writeFileSync(targetTaskFile, content, "utf8");
    invalidaCacheStato(cwd);
    return true;
  } catch {
    // I checkpoint falliscono pacificamente senza interrompere l'agente
    return false;
  }
}

const timestampIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Registra un checkpoint automatico nel task IN CORSO (API backward-compatible).
 * @param {string} filePath - File modificato
 * @param {string} [cwd] - Cartella di lavoro
 * @returns {boolean}
 */
export function registraCheckpoint(filePath, cwd = process.cwd()) {
  const cleanPath = String(filePath).replace(/\\/g, "/");
  return aggiungiRigaRipresa(cwd, `- Fatti: ${timestampIso()} - modificato: ${cleanPath}`);
}

/** true se l'esito del tool è un errore o un rifiuto (nessun checkpoint). */
export function esitoNegativo(e) {
  return e?.isError === true || e?.denied === true ||
    e?.result?.isError === true || e?.result?.denied === true ||
    e?.output?.isError === true;
}

function estraiTargetFile(e) {
  const fonti = [e, e?.input, e?.toolInput, e?.tool_input];
  for (const f of fonti) {
    if (!f || typeof f !== "object") continue;
    const v = f.file_path ?? f.path ?? f.notebook_path ?? f.filePath;
    if (typeof v === "string" && v) return v;
  }
  return "";
}

// De-duplica lo stesso evento ricevuto sia come tool.result sia come PostToolUse.
const checkpointRecenti = new Map();
const FINESTRA_DEDUP_MS = 1000;

/**
 * Checkpoint post-esecuzione: scrive il "Punto di ripresa" solo se il tool di modifica è andato a buon fine.
 * @param {object} e - Evento tool.result / PostToolUse
 * @param {string} [cwd]
 * @returns {boolean} true se il checkpoint è stato registrato
 */
export function registraCheckpointPostEsecuzione(e, cwd = process.cwd()) {
  const toolName = e?.tool ?? e?.name ?? e?.tool_name ?? e?.toolName ?? "";
  if (!TOOL_MODIFICA.has(toolName)) return false;
  if (esitoNegativo(e)) return false;
  const target = estraiTargetFile(e);
  if (!target) return false;

  const ora = Date.now();
  for (const [k, t] of checkpointRecenti) if (ora - t > FINESTRA_DEDUP_MS) checkpointRecenti.delete(k);
  const chiave = `${resolve(cwd)}|${e?.toolUseId ?? e?.tool_use_id ?? e?.id ?? ""}|${toolName}|${target}`;
  if (checkpointRecenti.has(chiave)) return false;
  checkpointRecenti.set(chiave, ora);

  return registraCheckpoint(target, cwd);
}

/**
 * Evento PreCompact: salva un marker timestampato nel "Punto di ripresa" del task IN CORSO,
 * così il contesto compattato può essere ripreso senza perdere il filo.
 * @param {string} [cwd]
 * @param {object} [meta] - Metadati dell'evento (sessionId / session_id, trigger)
 * @returns {boolean}
 */
export function gestisciPreCompact(cwd = process.cwd(), meta = {}) {
  const sessione = String(meta?.sessionId ?? meta?.session_id ?? "").replace(/[\r\n]/g, " ").trim();
  const trigger = String(meta?.trigger ?? "").replace(/[\r\n]/g, " ").trim();
  let riga = `- Fatti: ${timestampIso()} - PreCompact: contesto compattato`;
  if (trigger) riga += ` (trigger: ${trigger})`;
  if (sessione) riga += ` [sessione: ${sessione}]`;
  return aggiungiRigaRipresa(cwd, riga);
}

// ---------------------------------------------------------------------------
// Lifecycle Worktree (.coord/state/worktrees.json)
// ---------------------------------------------------------------------------

function percorsoWorktrees(cwd) {
  return resolve(cwd, ".coord", "state", "worktrees.json");
}

/** Legge il registro dei worktree (struttura `{ worktrees: [] }`). */
export function leggiWorktrees(cwd = process.cwd()) {
  try {
    const dati = JSON.parse(readFileSync(percorsoWorktrees(cwd), "utf8"));
    if (dati && Array.isArray(dati.worktrees)) return dati;
  } catch {}
  return { worktrees: [] };
}

function scriviAtomico(file, dati) {
  mkdirSync(resolve(file, ".."), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(dati, null, 2) + "\n", "utf8");
    renameSync(tmp, file);
  } catch (err) {
    try { unlinkSync(tmp); } catch {}
    throw err;
  }
}

const normPath = (p) => normalize(String(p)).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/**
 * Registra (o aggiorna) un worktree nel registro, con scrittura atomica (temp + rename).
 * @param {string} cwd
 * @param {{ path?: string, name?: string, branch?: string }} info
 * @returns {boolean}
 */
export function registraWorktree(cwd = process.cwd(), info = {}) {
  try {
    const path = info?.path ?? info?.worktreePath ?? info?.worktree_path ?? "";
    const name = info?.name ?? info?.worktreeName ?? info?.worktree_name ?? "";
    if (!path && !name) return false;
    const dati = leggiWorktrees(cwd);
    const voce = {
      name: String(name || String(path).replace(/\\/g, "/").split("/").filter(Boolean).pop() || ""),
      path: path ? String(path).replace(/\\/g, "/") : null,
      branch: info?.branch ? String(info.branch) : null,
      createdAt: timestampIso(),
    };
    const indice = dati.worktrees.findIndex((w) =>
      (voce.path && w.path && normPath(w.path) === normPath(voce.path)) || (!voce.path && w.name === voce.name));
    if (indice >= 0) dati.worktrees[indice] = { ...dati.worktrees[indice], ...voce, createdAt: dati.worktrees[indice].createdAt ?? voce.createdAt };
    else dati.worktrees.push(voce);
    scriviAtomico(percorsoWorktrees(cwd), dati);
    return true;
  } catch {
    return false;
  }
}

/**
 * Rimuove un worktree dal registro (per percorso o nome), con scrittura atomica.
 * @param {string} cwd
 * @param {string} pathOrName
 * @returns {boolean} true se una voce è stata rimossa
 */
export function rimuoviWorktree(cwd = process.cwd(), pathOrName = "") {
  try {
    if (!pathOrName) return false;
    const chiave = String(pathOrName);
    const dati = leggiWorktrees(cwd);
    const prima = dati.worktrees.length;
    dati.worktrees = dati.worktrees.filter((w) =>
      !(w.name === chiave || (w.path && normPath(w.path) === normPath(chiave))));
    if (dati.worktrees.length === prima) return false;
    scriviAtomico(percorsoWorktrees(cwd), dati);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Terminal Status Band (con cache)
// ---------------------------------------------------------------------------

/**
 * Estrae lo stato attuale per la barra terminale (lettura diretta da disco, senza cache).
 * @param {string} [cwd]
 * @returns {string|null}
 */
export function formattaStatoTerminale(cwd = process.cwd()) {
  try {
    const dirCoord = resolve(cwd, ".coord");
    if (!existsSync(dirCoord)) return null;

    let sprintNum = "1";
    const sprintFile = join(dirCoord, "CURRENT_SPRINT.md");
    if (existsSync(sprintFile)) {
      const m = readFileSync(sprintFile, "utf8").match(/Sprint\s+(\d+)/i);
      if (m) sprintNum = m[1];
    }

    let taskId = "In attesa";
    const dirTasks = join(dirCoord, "tasks");
    if (existsSync(dirTasks)) {
      const files = readdirSync(dirTasks).filter((f) => f.endsWith(".md")).sort();
      for (const f of files) {
        const c = readFileSync(join(dirTasks, f), "utf8");
        if (REGEX_IN_CORSO.test(c)) {
          const matchId = c.match(/^ID:\s*([A-Za-z0-9_-]+)/im);
          taskId = matchId ? matchId[1] : f.replace(/\.md$/, "");
          break;
        }
      }
    }

    return `[VIBE] Sprint ${sprintNum} | Task: ${taskId} | Control Room: .coord/dashboard.html`;
  } catch {
    return null;
  }
}

/** TTL di fallback quando fs.watch non è disponibile. */
export const TTL_CACHE_STATO_MS = 2000;

const cacheStato = new Map(); // cwd -> { valore, firma, calcolatoIl, watcher, valida }
const statistiche = { calcoli: 0, hit: 0 };

function firmaMtime(cwd) {
  const parti = [];
  for (const p of [".coord", join(".coord", "tasks"), join(".coord", "CURRENT_SPRINT.md")]) {
    try { parti.push(statSync(resolve(cwd, p)).mtimeMs); } catch { parti.push(-1); }
  }
  return parti.join("|");
}

function avviaWatcher(chiave, voce) {
  const dirCoord = resolve(chiave, ".coord");
  if (!existsSync(dirCoord)) return null;
  const invalida = () => { voce.valida = false; };
  let w = null;
  try {
    w = watch(dirCoord, { recursive: true, persistent: false }, invalida);
  } catch {
    try { w = watch(dirCoord, { persistent: false }, invalida); } catch { w = null; }
  }
  if (w) {
    w.on("error", () => { try { w.close(); } catch {} voce.watcher = null; voce.valida = false; });
    w.unref?.();
  }
  return w;
}

/**
 * Versione con cache di formattaStatoTerminale, usata da ui.render.
 * Invalidazione: eventi fs.watch su .coord (se disponibile) oppure TTL + firma mtimeMs delle cartelle.
 * @param {string} [cwd]
 * @param {{ watch?: boolean, ttlMs?: number }} [opzioni]
 * @returns {string|null}
 */
export function formattaStatoTerminaleCached(cwd = process.cwd(), opzioni = {}) {
  const usaWatch = opzioni.watch !== false;
  const ttlMs = Number.isFinite(opzioni.ttlMs) ? opzioni.ttlMs : TTL_CACHE_STATO_MS;
  const chiave = resolve(cwd);
  const ora = Date.now();
  const firma = firmaMtime(chiave);
  let voce = cacheStato.get(chiave);

  if (voce && voce.valida && voce.firma === firma && (voce.watcher || ora < voce.calcolatoIl + ttlMs)) {
    statistiche.hit++;
    return voce.valore;
  }

  if (!voce) {
    voce = { valore: null, firma: "", calcolatoIl: 0, watcher: null, valida: false };
    cacheStato.set(chiave, voce);
  }
  if (usaWatch && !voce.watcher) voce.watcher = avviaWatcher(chiave, voce);

  statistiche.calcoli++;
  voce.valore = formattaStatoTerminale(chiave);
  voce.firma = firma;
  voce.calcolatoIl = ora;
  voce.valida = true;
  return voce.valore;
}

/** Invalida la cache della status band per una cartella (o tutte se cwd assente). */
export function invalidaCacheStato(cwd) {
  if (cwd === undefined) {
    for (const v of cacheStato.values()) v.valida = false;
    return;
  }
  const voce = cacheStato.get(resolve(cwd));
  if (voce) voce.valida = false;
}

/** Chiude tutti i watcher e svuota la cache (cleanup per test e unload del mod). */
export function chiudiCacheStato() {
  for (const v of cacheStato.values()) {
    try { v.watcher?.close(); } catch {}
    v.watcher = null;
  }
  cacheStato.clear();
  statistiche.calcoli = 0;
  statistiche.hit = 0;
}

/** Statistiche della cache (calcoli effettivi, hit, watcher attivi). */
export function statisticheCacheStato() {
  let watcher = 0;
  for (const v of cacheStato.values()) if (v.watcher) watcher++;
  return { ...statistiche, voci: cacheStato.size, watcher };
}

// ---------------------------------------------------------------------------
// Registrazione eventi
// ---------------------------------------------------------------------------

const avanti = (next, e) => (typeof next === "function" ? next(e) : undefined);

function risultatoBlocco(reason) {
  return { deny: reason, block: true, reason };
}

/**
 * Aggancia un handler con feature-detection: se il runtime espone `on.supports(evento)` lo consulta,
 * e qualsiasi eccezione in registrazione (evento sconosciuto) viene assorbita.
 * @returns {boolean} true se registrato
 */
export function agganciaSicuro(on, evento, fn) {
  if (typeof on !== "function") return false;
  try {
    if (typeof on.supports === "function" && !on.supports(evento)) return false;
    on(evento, fn);
    return true;
  } catch {
    return false;
  }
}

/**
 * Funzione di registrazione principale per l'API Claude Mods (v2.1.287+, eventi estesi v2.1.318+)
 * @param {Function} on - Registro degli eventi fornito da Claude Code
 * @returns {string[]} eventi effettivamente registrati
 */
export function register(on) {
  const registrati = [];
  const aggancia = (evento, fn) => { if (agganciaSicuro(on, evento, fn)) registrati.push(evento); };

  // 1. Gate pre-esecuzione sui tool shell (Bash, PowerShell, pwsh, run_command)
  aggancia("tool.call", async ($, e, next) => {
    const toolName = e?.tool ?? e?.name ?? e?.tool_name ?? "";
    if (TOOL_SHELL.has(toolName)) {
      const val = valutaComando(estraiComandoShell(e), $?.cwd ?? process.cwd());
      if (!val.allowed) return risultatoBlocco(val.reason);
    }
    return avanti(next, e);
  });

  // 2. Gate sui comandi shell lanciati dalle skill
  aggancia("PreSkillShellCommand", async ($, e, next) => {
    const cmd = typeof e === "string" ? e : estraiComandoShell(e);
    const val = valutaPreSkillShellCommand(cmd, $?.cwd ?? e?.cwd ?? process.cwd());
    if (!val.allowed) return risultatoBlocco(val.reason);
    return avanti(next, e);
  });

  // 3. Checkpoint post-esecuzione (solo esiti positivi)
  const postEsecuzione = async ($, e, next) => {
    registraCheckpointPostEsecuzione(e, $?.cwd ?? process.cwd());
    return avanti(next, e);
  };
  aggancia("tool.result", postEsecuzione);
  aggancia("PostToolUse", postEsecuzione);

  // 4. Marker prima della compattazione del contesto
  aggancia("PreCompact", async ($, e, next) => {
    gestisciPreCompact($?.cwd ?? e?.cwd ?? process.cwd(), e ?? {});
    return avanti(next, e);
  });

  // 5. Lifecycle worktree
  aggancia("WorktreeCreate", async ($, e, next) => {
    registraWorktree($?.cwd ?? process.cwd(), e ?? {});
    return avanti(next, e);
  });
  aggancia("WorktreeRemove", async ($, e, next) => {
    const chiave = e?.path ?? e?.worktreePath ?? e?.worktree_path ?? e?.name ?? e?.worktreeName ?? "";
    rimuoviWorktree($?.cwd ?? process.cwd(), chiave);
    return avanti(next, e);
  });

  // 6. Status band con cache
  aggancia("ui.render", async ($, e, next) => {
    const statusText = formattaStatoTerminaleCached($?.cwd ?? process.cwd());
    if (statusText && typeof $?.ui?.banner === "function") {
      $.ui.banner(statusText);
    }
    return avanti(next, e);
  });

  return registrati;
}
