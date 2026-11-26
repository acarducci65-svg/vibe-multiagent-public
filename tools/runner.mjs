#!/usr/bin/env node
// Runner universale v3.0.0: streaming multi-provider, telemetria e resume.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { delimiter, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { constants, tmpdir } from "node:os";
import { StringDecoder } from "node:string_decoder";
import { raccogliTelemetria, canonicalTaskId } from "./telemetry.mjs";
import { validaHandover } from "./validate-handover.mjs";
import * as claude from "./adapters/claude.mjs";
import * as codex from "./adapters/codex.mjs";
import * as agy from "./adapters/agy.mjs";

const ADATTATORI = Object.freeze({ claude, codex, agy });
const PROFILI = new Set(["read-only", "workspace-write"]);

/**
 * Circuit Breaker a 4 livelli (ispirato a Munder Difflin breaker.ts):
 *
 *   healthy -> steering -> constrained -> stopped
 *
 * Segnali monitorati (ciascuno produce un livello; lo stato è il massimo dei due
 * ed è monotono crescente finché un esito positivo non lo ripristina):
 *
 * - Chiamate identiche consecutive (`consecutiveIdenticalCalls` = numero di RIPETIZIONI
 *   della stessa chiamata `nome+input`; la prima chiamata vale 0):
 *     1 ripetizione (2 chiamate identiche)  -> steering    (onSteer)
 *     2 ripetizioni (3 chiamate identiche)  -> constrained (onConstrain)
 *     >= maxConsecutiveIdenticalCalls (default 3, cioè 4 chiamate) -> stopped (trip/onTrip)
 * - Errori consecutivi dei tool (`consecutiveErrors`):
 *     1 errore  -> steering
 *     2 errori  -> constrained
 *     >= maxConsecutiveErrors (default 3) -> stopped
 *
 * Un esito positivo (`registraToolResult(false)`) azzera `consecutiveErrors` e riporta
 * `steering`/`constrained` a `healthy`. `stopped` è terminale: non si ripristina.
 */
export const STATI_BREAKER = Object.freeze(["healthy", "steering", "constrained", "stopped"]);

const LIVELLO = Object.freeze({ healthy: 0, steering: 1, constrained: 2, stopped: 3 });

function sogliaValida(valore, predefinito) {
  return Number.isInteger(valore) && valore >= 1 ? valore : predefinito;
}

export class CircuitBreaker {
  constructor(opzioni = {}) {
    this.maxConsecutiveErrors = sogliaValida(opzioni.maxConsecutiveErrors, 3);
    this.maxConsecutiveIdenticalCalls = sogliaValida(opzioni.maxConsecutiveIdenticalCalls, 3);
    this.state = "healthy";
    this.consecutiveErrors = 0;
    this.consecutiveIdenticalCalls = 0;
    this.lastToolHash = null;
    this.totalCalls = 0;
    this.motivoArresto = null;
    this.onTrip = typeof opzioni.onTrip === "function" ? opzioni.onTrip : () => {};
    this.onSteer = typeof opzioni.onSteer === "function" ? opzioni.onSteer : () => {};
    this.onConstrain = typeof opzioni.onConstrain === "function" ? opzioni.onConstrain : () => {};
  }

  /** Livello richiesto da un contatore: stopped ha priorità sulle soglie fisse 1/2. */
  static livelloPer(contatore, soglia) {
    if (contatore >= soglia) return "stopped";
    if (contatore >= 2) return "constrained";
    if (contatore >= 1) return "steering";
    return "healthy";
  }

  registraToolCall(name, input) {
    if (this.state === "stopped") return this.state;
    this.totalCalls++;
    let inputStr = "";
    try {
      inputStr = typeof input === "string" ? input : JSON.stringify(input);
    } catch {
      inputStr = String(input);
    }
    const hash = `${name}:${inputStr}`;

    if (hash === this.lastToolHash) {
      this.consecutiveIdenticalCalls++;
    } else {
      this.consecutiveIdenticalCalls = 0;
      this.lastToolHash = hash;
      return this.state;
    }

    const n = this.consecutiveIdenticalCalls;
    const target = CircuitBreaker.livelloPer(n, this.maxConsecutiveIdenticalCalls);
    const chiamate = n + 1;
    if (target === "stopped") {
      this.trip(`Rilevate ${chiamate} chiamate identiche consecutive al tool ${name} (${n} ripetizioni)`);
    } else if (target === "constrained") {
      this.constrain(`${chiamate} chiamate identiche consecutive al tool ${name}`);
    } else if (target === "steering") {
      this.steer(`chiamata ripetuta al tool ${name}`);
    }
    return this.state;
  }

  registraToolResult(isError, detail = "") {
    if (this.state === "stopped") return this.state;
    if (isError) {
      this.consecutiveErrors++;
      const n = this.consecutiveErrors;
      const target = CircuitBreaker.livelloPer(n, this.maxConsecutiveErrors);
      const dettaglio = String(detail ?? "").slice(0, 100);
      if (target === "stopped") {
        this.trip(`Raggiunto limite di ${n} errori consecutivi dei tool (${dettaglio})`);
      } else if (target === "constrained") {
        this.constrain(`${n} errori consecutivi nei tool`);
      } else if (target === "steering") {
        this.steer(`${n} errore nei tool`);
      }
    } else {
      this.consecutiveErrors = 0;
      if (this.state === "steering" || this.state === "constrained") {
        this.state = "healthy";
      }
    }
    return this.state;
  }

  /** Porta lo stato a `target` solo se è un'escalation; restituisce true se è transitato. */
  _escala(target) {
    if (LIVELLO[target] <= LIVELLO[this.state]) return false;
    this.state = target;
    return true;
  }

  steer(motivo) {
    if (this._escala("steering")) this.onSteer(motivo);
  }

  constrain(motivo) {
    if (this._escala("constrained")) this.onConstrain(motivo);
  }

  trip(motivo) {
    if (this.state === "stopped") return;
    this.state = "stopped";
    this.motivoArresto = motivo;
    this.onTrip(motivo);
  }
}

export function parsaRigaNdjson(riga) {
  const rigaPulita = riga.replace(/\r$/, "");
  const trimmed = rigaPulita.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  try {
    const ev = JSON.parse(trimmed);
    return ev && typeof ev === "object" && (ev.type || ev.event) ? ev : null;
  } catch {
    return null;
  }
}

export function formattaRigaNdjson(riga) {
  const rigaPulita = riga.replace(/\r$/, "");
  const ev = parsaRigaNdjson(rigaPulita);
  if (!ev) {
    return rigaPulita + "\n";
  }

  const prefix = "[Claude]";
  const out = [];
  const contents = Array.isArray(ev.message?.content) ? ev.message.content.filter(Boolean) : [];

  if (ev.type === "assistant") {
    for (const item of contents) {
      if (item.type === "tool_use") {
        const name = item.name || "tool";
        let detail = "";
        if (item.input) {
          if (item.input.command) {
            detail = ` -> ${item.input.command}`;
          } else if (item.input.file_path) {
            detail = ` -> ${item.input.file_path}`;
          } else if (item.input.pattern) {
            detail = ` -> pattern: ${item.input.pattern}`;
          } else if (item.input.query) {
            detail = ` -> query: ${item.input.query}`;
          } else {
            try {
              detail = ` -> ${JSON.stringify(item.input)}`;
            } catch {}
          }
        }
        out.push(`${prefix} 🔧 Tool: ${name}${detail}`);
      } else if (item.type === "text" && item.text) {
        const txt = item.text.trim();
        if (txt) {
          out.push(`${prefix} 💬 ${txt}`);
        }
      }
    }
  } else if (ev.type === "user") {
    for (const item of contents) {
      if (item.type === "tool_result") {
        if (item.is_error) {
          const errText = typeof item.content === "string" ? item.content : JSON.stringify(item.content) ?? "";
          const firstLine = errText.split(/\r?\n/)[0] || "";
          out.push(`${prefix} ❌ Errore Tool: ${firstLine.slice(0, 200)}`);
        } else if (item.content) {
          const resText = typeof item.content === "string" ? item.content : JSON.stringify(item.content);
          const righe = resText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          if (righe.length === 1) {
            out.push(`${prefix} 📄 Esito: ${righe[0].slice(0, 160)}`);
          } else if (righe.length > 1) {
            out.push(`${prefix} 📄 Esito: ${righe[0].slice(0, 120)} (+ ${righe.length - 1} righe)`);
          }
        }
      }
    }
  } else if (ev.type === "result") {
    const dur = ev.duration_ms ? ` (durata: ${(ev.duration_ms / 1000).toFixed(1)}s` : "";
    const costo = typeof ev.total_cost_usd === "number" ? `, costo: $${ev.total_cost_usd.toFixed(4)})` : dur ? ")" : "";
    const resSummary = typeof ev.result === "string" ? ev.result.trim().split(/\r?\n/)[0] : "";
    if (ev.is_error) {
      out.push(`${prefix} ❌ Errore agente${dur}${costo}${resSummary ? `: ${resSummary.slice(0, 150)}` : ""}`);
    } else {
      out.push(`${prefix} ✅ Completato${dur}${costo}${resSummary ? `: ${resSummary.slice(0, 150)}` : ""}`);
    }
  } else if (ev.type === "rate_limit_event") {
    const fiveH = ev.rate_limit_info?.unifiedWindows?.five_hour?.utilization;
    const sevenD = ev.rate_limit_info?.unifiedWindows?.seven_day?.utilization;
    if (fiveH !== undefined || sevenD !== undefined) {
      const pct5 = fiveH !== undefined ? `${Math.round(fiveH * 100)}%` : "N/D";
      const pct7 = sevenD !== undefined ? `${Math.round(sevenD * 100)}%` : "N/D";
      out.push(`${prefix} ⏱️ Quota: 5h ${pct5}, 7d ${pct7}`);
    }
  } else if (ev.type === "system") {
    if (ev.subtype === "init") {
      out.push(`${prefix} 🚀 Sessione avviata (modello: ${ev.model || "default"})`);
    } else if (
      ev.subtype === "thinking_tokens" ||
      ev.subtype === "hook_started" ||
      ev.subtype === "hook_response" ||
      ev.subtype === "status"
    ) {
      return "";
    }
  }

  if (out.length === 0) {
    if (typeof ev === "object" && ev !== null && ev.type) {
      const payload = ev.payload || ev.message || ev.text || JSON.stringify(ev);
      return `${prefix} ℹ️ [${ev.type}] ${String(payload).slice(0, 160)}\n`;
    }
    return "";
  }
  return out.join("\n") + "\n";
}

export function creaGestoreStream(suChunkFormattato, onEvent = null, {
  parse = parsaRigaNdjson, format = formattaRigaNdjson, onRaw = null,
} = {}) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  function elabora(riga) {
    onRaw?.(riga);
    const eventi = parse(riga);
    if (onEvent && eventi) {
      for (const evento of Array.isArray(eventi) ? eventi : [eventi]) onEvent(evento);
    }
    const formattata = format(riga, eventi);
    if (formattata) suChunkFormattato(formattata);
  }

  return {
    scrivi(chunk) {
      buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
      const righe = buffer.split(/\r?\n/);
      buffer = righe.pop();
      for (const riga of righe) elabora(riga);
    },
    chiudi() {
      buffer += decoder.end();
      if (buffer.trim()) elabora(buffer);
      buffer = "";
    },
  };
}

/** Formato ammesso per `--dispatch-id`: alfanumerico iniziale, poi [A-Za-z0-9_.:-], max 64 caratteri. */
export const REGEX_DISPATCH_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

/** Errore di validazione degli argomenti CLI del runner. */
export class ErroreArgomenti extends Error {
  constructor(messaggio) {
    super(messaggio);
    this.name = "ErroreArgomenti";
  }
}

function valoreOpzione(opzioni, i, nome) {
  const v = opzioni[i];
  if (v === undefined || v === "" || v.startsWith("-")) {
    throw new ErroreArgomenti(`L'opzione ${nome} richiede un valore`);
  }
  return v;
}

export function analizzaArgomenti(argv) {
  let taskId = "generale";
  let dirCoord = process.env.DIR_COORD || ".coord";
  let cmd = "";
  let cmdTokens = [];
  let promptFile = null;
  let worktree = null;
  let dispatchId = null;
  let profile = "workspace-write";
  let resume = null;
  let timeoutMs = null;
  let directorOverride = false;

  const args = argv.slice(2);
  const doppioTrattino = args.indexOf("--");

  let opzioni = args;
  if (doppioTrattino !== -1) {
    opzioni = args.slice(0, doppioTrattino);
    cmdTokens = args.slice(doppioTrattino + 1);
    cmd = cmdTokens.join(" ");
  }

  let agent = "claude";
  let model = "";

  for (let i = 0; i < opzioni.length; i++) {
    const a = opzioni[i];
    if (a === "--task" || a === "-t") {
      taskId = opzioni[++i] || taskId;
    } else if (a === "--coord" || a === "-c") {
      dirCoord = opzioni[++i] || dirCoord;
    } else if (a === "--cmd") {
      cmd = valoreOpzione(opzioni, ++i, "--cmd");
      cmdTokens = separaComando(cmd);
    } else if (a === "--prompt-file" || a === "-f") {
      promptFile = opzioni[++i] || promptFile;
    } else if (a === "--agent" || a === "-a") {
      agent = (opzioni[++i] || agent).toLowerCase();
    } else if (a === "--model" || a === "-m") {
      model = opzioni[++i] || model;
    } else if (a === "--worktree" || a === "-w") {
      worktree = valoreOpzione(opzioni, ++i, "--worktree");
    } else if (a === "--profile") {
      profile = valoreOpzione(opzioni, ++i, a);
      if (!PROFILI.has(profile)) throw new ErroreArgomenti(`--profile non valido: ${profile}`);
    } else if (a === "--resume") {
      const successivo = opzioni[i + 1];
      resume = successivo && !successivo.startsWith("-") ? opzioni[++i] : true;
    } else if (a === "--timeout-ms") {
      const valore = valoreOpzione(opzioni, ++i, a);
      timeoutMs = Number(valore);
      if (!/^\d+$/.test(valore) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
        throw new ErroreArgomenti(`--timeout-ms non valido: ${valore}`);
      }
    } else if (a === "--director-override") {
      directorOverride = true;
    } else if (a === "--dispatch-id" || a === "-d") {
      dispatchId = valoreOpzione(opzioni, ++i, "--dispatch-id");
      if (!REGEX_DISPATCH_ID.test(dispatchId)) {
        throw new ErroreArgomenti(
          `--dispatch-id non valido: "${dispatchId}" (ammessi [A-Za-z0-9_.:-], iniziale alfanumerica, max 64 caratteri)`
        );
      }
    }
  }

  if (!Object.hasOwn(ADATTATORI, agent)) throw new ErroreArgomenti(`--agent non valido: ${agent}`);
  if (cmdTokens.length && resume) throw new ErroreArgomenti("--resume richiede un adattatore nativo");
  if (!cmd && (promptFile || resume || agent === "codex") && doppioTrattino === -1) {
    const { exe, args: argsProvider } = ADATTATORI[agent].buildCommand({
      profile, model, directorOverride, resumeId: typeof resume === "string" ? resume : null,
    });
    cmd = [exe, ...argsProvider.filter(arg => arg !== "")].join(" ");
  }

  return { taskId, dirCoord, cmd, cmdTokens, promptFile, agent, model, worktree, dispatchId, profile, resume, timeoutMs, directorOverride };
}

// --cmd accetta un eseguibile e i suoi argomenti quotati. Dopo -- i token sono già separati.
function separaComando(cmd) {
  const tokens = [];
  let token = "";
  let quote = null;
  let iniziato = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "\\" && quote !== "'" && (cmd[i + 1] === '"' || !quote && cmd[i + 1] === "'")) {
      token += cmd[++i];
    } else if (c === quote) {
      quote = null;
    } else if (!quote && (c === '"' || c === "'")) {
      quote = c;
    } else if (!quote && /\s/.test(c)) {
      if (iniziato) tokens.push(token);
      token = "";
      iniziato = false;
      continue;
    } else {
      token += c;
    }
    iniziato = true;
  }
  if (quote) throw new ErroreArgomenti("Virgolette non chiuse in --cmd");
  if (iniziato) tokens.push(token);
  if (!tokens[0]) throw new ErroreArgomenti("--cmd richiede un eseguibile");
  return tokens;
}

/** Variabili d'ambiente del processo figlio: TASK_ATTIVO sempre, DISPATCH_ID se fornito. */
export function costruisciEnvFiglio(baseEnv, taskId, dispatchId) {
  const env = { ...baseEnv, TASK_ATTIVO: taskId };
  if (dispatchId) env.DISPATCH_ID = dispatchId;
  return env;
}

/** Cartella di esecuzione del figlio: il worktree (risolto rispetto alla radice) o la radice stessa. */
export function risolviCwdEsecuzione(radice, worktree) {
  return worktree ? resolve(radice, worktree) : radice;
}

function stessoPercorso(primo, secondo) {
  return process.platform === "win32" ? primo.toLowerCase() === secondo.toLowerCase() : primo === secondo;
}

function verificaWorktree(cwd) {
  if (!existsSync(cwd)) throw new ErroreArgomenti(`la cartella --worktree non esiste: ${cwd}`);
  if (!statSync(cwd).isDirectory()) throw new ErroreArgomenti(`--worktree non è una cartella: ${cwd}`);

  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^GIT_(DIR|WORK_TREE|COMMON_DIR)$/i.test(name)) delete env[name];
  }
  const args = ["rev-parse", "--is-inside-work-tree", "--show-toplevel"];
  const options = { cwd, env, encoding: "utf8", windowsHide: true };
  let { error, status, stdout } = spawnSync("git", args, options);
  if (process.platform === "win32" && error?.code === "EPERM") {
    const capture = creaFileTemporanei();
    try {
      const fd = capture.apri("git");
      ({ status } = spawnSync("git", args, { ...options, stdio: ["ignore", fd, "ignore"] }));
      stdout = readFileSync(join(capture.dir, "git"), "utf8");
    } finally {
      capture.chiudi();
    }
  }
  const [inside, root] = (stdout ?? "").trimEnd().split(/\r?\n/);
  if (status !== 0 || inside !== "true" || !root || !stessoPercorso(realpathSync(root), realpathSync(cwd))) {
    throw new ErroreArgomenti(`--worktree deve indicare la radice Git di un albero di lavoro: ${cwd}`);
  }
}

function leggiSessioni(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
  const sessions = JSON.parse(raw);
  if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) {
    throw new Error(`Archivio sessioni non valido: ${path}`);
  }
  return sessions;
}

export function risolviSessione(dirCoord, taskId, resume, { provider, cwd, profile }) {
  if (!resume) return null;
  const sessions = leggiSessioni(join(dirCoord, "state", "sessions.json"));
  const trovata = Object.hasOwn(sessions, taskId) ? sessions[taskId] : null;
  if (!trovata || typeof trovata.sessionId !== "string" || !trovata.sessionId.trim() || trovata.sessionId.startsWith("-")) {
    throw new ErroreArgomenti(`Nessuna sessione registrata per ${taskId}`);
  }
  if (resume !== true && resume !== trovata.sessionId) throw new ErroreArgomenti("sessionId diverso da quello registrato");
  if (trovata.provider !== provider) throw new ErroreArgomenti("provider diverso da quello della sessione");
  if (typeof trovata.cwd !== "string" || !stessoPercorso(trovata.cwd, cwd)) {
    throw new ErroreArgomenti("cwd diverso da quello della sessione");
  }
  if (trovata.profile !== profile) throw new ErroreArgomenti("profile diverso da quello della sessione");
  return trovata.sessionId;
}

function salvaSessione(dirCoord, taskId, context, sessionId) {
  const dir = join(dirCoord, "state");
  const path = join(dir, "sessions.json");
  const lock = `${path}.lock`;
  const temp = `${path}.${randomUUID()}.tmp`;
  mkdirSync(dir, { recursive: true });
  // Serializza il read-modify-write tra runner con task diversi.
  const attesa = new Int32Array(new SharedArrayBuffer(4));
  const scadenza = Date.now() + 1000;
  let fd;
  while (fd === undefined) {
    try {
      fd = openSync(lock, "wx", 0o600);
    } catch (err) {
      if (err.code !== "EEXIST" || Date.now() >= scadenza) throw err;
      Atomics.wait(attesa, 0, 0, 10);
    }
  }
  try {
    const sessions = leggiSessioni(path);
    const aggiornate = { ...sessions, [taskId]: { ...context, sessionId, updatedAt: new Date().toISOString() } };
    writeFileSync(temp, JSON.stringify(aggiornate, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    renameSync(temp, path);
  } finally {
    closeSync(fd);
    rmSync(lock, { force: true });
    rmSync(temp, { force: true });
  }
}

function verificaHandover(dirCoord, taskId) {
  const path = join(dirCoord, "handover", `${taskId}.md`);
  try {
    const contratto = JSON.parse(readFileSync(path, "utf8"));
    const { errori } = validaHandover(contratto);
    if (contratto?.task_id !== taskId) errori.push(`handover.task_id: atteso ${taskId}`);
    return errori;
  } catch (err) {
    return [err.code === "ENOENT" ? `Handover assente: ${path}` : `Handover illeggibile: ${err.message}`];
  }
}

/**
 * Promuove deterministicamente lo stato del task a CONSEGNATO al termine con successo dell'esecutore.
 * Cerca il file in .coord/tasks/<ID>.md (o con prefisso/suffisso canonico) e, se lo stato è IN CORSO o PRONTO,
 * lo aggiorna a CONSEGNATO per allineare telemetria e dashboard.
 */
export function promuoviTaskAConsegnato(dirCoord, taskId, suHandoverInvalido = () => {}) {
  if (!dirCoord || !taskId || taskId === "generale" || !/^[a-zA-Z0-9_-]+$/.test(taskId)) return false;
  const errori = verificaHandover(dirCoord, taskId);
  if (errori.length) {
    suHandoverInvalido(errori);
    return false;
  }
  const dirTasks = join(dirCoord, "tasks");
  if (!existsSync(dirTasks)) return false;

  const targetId = canonicalTaskId(taskId);
  try {
    const files = readdirSync(dirTasks).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const stem = f.replace(/\.md$/, "");
      if (canonicalTaskId(f) === targetId || stem === taskId || stem.startsWith(`${taskId}-`) || f.startsWith(`${taskId}.`)) {
        const fullPath = join(dirTasks, f);
        const content = readFileSync(fullPath, "utf8");
        const regexStato = /^([\s*-]*\**Stato[\*:]*\s*:?\s*)(IN CORSO|PRONTO)(\b.*)$/im;
        if (regexStato.test(content)) {
          const updated = content.replace(regexStato, "$1CONSEGNATO$3");
          writeFileSync(fullPath, updated, "utf8");
          return true;
        }
      }
    }
  } catch {}
  return false;
}

const USO = [
  "Uso: node runner.mjs --task <ID> [--coord <DIR>] [--worktree <PATH>] [--dispatch-id <ID>]",
  "     [--profile read-only|workspace-write] [--timeout-ms <MS>] [--prompt-file <FILE>]",
  "     [--agent claude|codex|agy] [--model <MODELLO>] [--resume [SESSION_ID]] [--director-override]",
  "     oppure: node runner.mjs [opzioni] -- <ESEGUIBILE> [ARGOMENTI] (o --cmd \"<ESEGUIBILE> [ARGOMENTI]\")",
].join("\n") + "\n";

function creaFileTemporanei() {
  const dir = mkdtempSync(join(tmpdir(), "runner-stdio-"));
  const fds = [];
  return {
    dir,
    apri(name, mode = "w+") {
      const fd = openSync(join(dir, name), mode, 0o600);
      fds.push(fd);
      return fd;
    },
    chiudi() {
      for (const fd of fds) closeSync(fd);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function risolviComandoWindows(command, cwd) {
  const { exe, args } = command;
  const esplicito = /[\\/]/.test(exe);
  const directories = esplicito ? [cwd] : (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const extensions = extname(exe) ? [""] : [".exe", ".com", ".cmd", ".bat"];

  for (const dir of directories) {
    for (const ext of extensions) {
      const path = resolve(cwd, dir.replace(/^"|"$/g, ""), exe + ext);
      if (!existsSync(path) || !statSync(path).isFile()) continue;
      if (!/\.(cmd|bat)$/i.test(path)) return { ...command, exe: path };

      // Gli shim npm indicano il binario o lo script Node a cui inoltrano %*.
      const shim = readFileSync(path, "utf8");
      const target = shim.match(/"%dp0%[\\/]([^"\r\n]+\.(?:exe|[cm]?js))"\s+%\*/i)?.[1];
      if (!target) throw new Error(`Shim Windows non supportato: ${path}. Indicare l'eseguibile nativo.`);
      const executable = resolve(dirname(path), target);
      if (!existsSync(executable)) throw new Error(`Destinazione shim Windows assente: ${executable}`);
      return /\.exe$/i.test(executable)
        ? { ...command, exe: executable }
        : { ...command, exe: process.execPath, args: [executable, ...args] };
    }
  }
  return command;
}

function avviaProcesso(command, cwd, env, stdout, stderr, onIoError) {
  const { exe, args, stdinText } = process.platform === "win32" ? risolviComandoWindows(command, cwd) : command;
  const options = { cwd, env, shell: false, detached: process.platform !== "win32", windowsHide: true };
  const input = stdinText !== undefined ? "pipe" : process.stdin.isTTY ? "inherit" : "ignore";
  let child;
  try {
    child = spawn(exe, args, { ...options, stdio: [input, "pipe", "pipe"] });
  } catch (err) {
    if (process.platform !== "win32" || err.code !== "EPERM") throw err;

    // Alcuni ambienti Windows vietano le pipe del figlio ma consentono handle ereditati.
    const files = creaFileTemporanei();
    let timer;
    try {
      let stdin = input;
      if (input === "pipe") {
        writeFileSync(join(files.dir, "stdin"), stdinText, { mode: 0o600 });
        stdin = files.apri("stdin", "r");
      }
      const streams = [["stdout", stdout], ["stderr", stderr]].map(([name, handler]) => ({
        fd: files.apri(name),
        handler,
        position: 0,
      }));
      child = spawn(exe, args, { ...options, stdio: [stdin, ...streams.map(stream => stream.fd)] });
      const buffer = Buffer.allocUnsafe(64 * 1024);
      function leggi() {
        for (const stream of streams) {
          let size;
          while ((size = readSync(stream.fd, buffer, 0, buffer.length, stream.position)) > 0) {
            stream.position += size;
            stream.handler.scrivi(buffer.subarray(0, size));
          }
        }
      }
      timer = setInterval(() => {
        try {
          leggi();
        } catch (errLettura) {
          clearInterval(timer);
          onIoError(errLettura);
        }
      }, 25);
      child.once("close", () => {
        clearInterval(timer);
        try {
          leggi();
        } catch (errLettura) {
          onIoError(errLettura);
        } finally {
          files.chiudi();
        }
      });
      return child;
    } catch (errAvvio) {
      files.chiudi();
      throw errAvvio;
    }
  }

  child.stdout.on("data", chunk => stdout.scrivi(chunk));
  child.stderr.on("data", chunk => stderr.scrivi(chunk));
  if (input === "pipe") {
    child.stdin.on("error", err => {
      if (err.code !== "EPIPE" && err.code !== "ERR_STREAM_DESTROYED") onIoError(err);
    });
    child.stdin.end(stdinText, "utf8");
  }
  return child;
}

function terminaAlbero(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    const exe = join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    const fallback = () => child.kill("SIGKILL");
    const taskkill = spawn(exe, ["/T", "/F", "/PID", String(child.pid)], {
      shell: false, stdio: "ignore", windowsHide: true,
    });
    taskkill.once("error", fallback);
    taskkill.once("close", code => { if (code !== 0) fallback(); });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (err) {
      if (err.code !== "ESRCH") throw err;
    }
  }
}

const ETICHETTE_PROVIDER = { claude: "Claude", codex: "Codex", agy: "AGY" };

function formattaEventoProvider(riga, eventi) {
  if (eventi.length === 0) return parsaRigaNdjson(riga) ? "" : riga + "\n";
  return eventi.map(evento => {
    const prefix = `[${ETICHETTE_PROVIDER[evento.provider]}]`;
    switch (evento.type) {
      case "session": return `${prefix} 🚀 Sessione avviata: ${evento.sessionId}\n`;
      case "tool_call": return `${prefix} 🔧 Tool: ${evento.name ?? "tool"} ${descrivi(evento.input)}\n`;
      case "tool_result": return `${prefix} ${evento.isError ? "❌ Errore Tool" : "📄 Esito"}: ${descrivi(evento.detail)}\n`;
      case "text": return `${prefix} 💬 ${evento.text}\n`;
      case "error": return `${prefix} ❌ Errore agente: ${descrivi(evento.detail)}\n`;
      case "done": return `${prefix} ✅ Completato ${descrivi(evento.detail)}\n`;
      default: return "";
    }
  }).join("");
}

function descrivi(value) {
  return (typeof value === "string" ? value : JSON.stringify(value) ?? "").slice(0, 200);
}

export function eseguiRunner(argv = process.argv) {
  let argomenti;
  let radice;
  let cwd;
  let dirCoord;
  let taskId;
  let command;
  try {
    argomenti = analizzaArgomenti(argv);
    const { taskId: rawTaskId, dirCoord: rawCoord, cmd, cmdTokens, worktree, profile, resume, agent, model, promptFile, directorOverride } = argomenti;
    if (!cmd) throw new ErroreArgomenti("Specificare un comando o un prompt.");
    taskId = rawTaskId.replace(/[^a-zA-Z0-9_-]/g, "") || "generale";
    radice = process.cwd();
    cwd = risolviCwdEsecuzione(radice, worktree);
    if (worktree) verificaWorktree(cwd);
    cwd = realpathSync(cwd);
    dirCoord = resolve(radice, rawCoord);
    const resumeId = risolviSessione(dirCoord, taskId, resume, { provider: agent, cwd, profile });
    const prompt = promptFile ? readFileSync(resolve(radice, promptFile), "utf8") : undefined;

    if (cmdTokens.length) {
      const [exe, ...args] = cmdTokens;
      command = { exe, args, stdinText: prompt };
    } else {
      const allowlistPath = agent === "claude" && !directorOverride
        ? claude.assicuraAllowlistClaude(cwd, profile) : undefined;
      command = ADATTATORI[agent].buildCommand({
        prompt, profile, model, cwd, resumeId, allowlistPath, directorOverride, nativeCli: true,
      });
    }
  } catch (err) {
    process.stderr.write(`Errore: ${err.message}\n${err instanceof ErroreArgomenti ? USO : ""}`);
    process.exitCode = 1;
    return;
  }

  const { agent, cmd, dispatchId, profile, promptFile, timeoutMs, worktree } = argomenti;
  const dirLogs = join(dirCoord, "logs");
  mkdirSync(dirLogs, { recursive: true });
  const log = createWriteStream(join(dirLogs, `${taskId}.log`), { flags: "a", encoding: "utf8" });
  const raw = createWriteStream(join(dirLogs, `${taskId}.jsonl`), { flags: "a", encoding: "utf8" });
  log.write(`\n=== [${new Date().toISOString()}] Inizio esecuzione task ${taskId} ===\n`);
  log.write(`Comando: ${cmd}${promptFile ? ` (da file prompt: ${promptFile})` : ""}\n`);
  log.write(`Provider: ${agent} | Profilo: ${profile}\n`);
  if (dispatchId) log.write(`Dispatch ID: ${dispatchId}\n`);
  if (worktree) log.write(`Worktree: ${worktree} (cwd: ${cwd})\n`);
  log.write("\n");

  function aggiornaTelemetria() {
    try {
      raccogliTelemetria(radice, dirCoord);
    } catch {}
  }
  aggiornaTelemetria();
  const timerTelemetria = setInterval(aggiornaTelemetria, 2000);
  let child;
  let timeout;
  let stopCode;
  let sessionId;
  let finalizzato = false;

  function avvisa(message) {
    process.stderr.write(message);
    if (!log.destroyed) log.write(message);
  }
  function interrompi(code) {
    if (stopCode !== undefined) return;
    stopCode = code;
    terminaAlbero(child);
  }
  function erroreIO(err) {
    avvisa(`[Runner] Errore I/O: ${err.message}\n`);
    interrompi(1);
  }

  const breaker = new CircuitBreaker({
    onTrip(motivo) {
      avvisa(`\n[CircuitBreaker] 🛑 TRIP: ${motivo}. Arresto immediato del processo per protezione cantiere.\n`);
      interrompi(1);
    },
    onSteer: motivo => avvisa(`\n[CircuitBreaker] ⚠️ STEERING: ${motivo}.\n`),
    onConstrain: motivo => avvisa(`\n[CircuitBreaker] 🚧 CONSTRAINED: ${motivo}. Prossima anomalia = arresto.\n`),
  });

  function onEvent(evento) {
    if (evento.type === "tool_call") breaker.registraToolCall(evento.name ?? "tool", evento.input);
    if (evento.type === "tool_result") breaker.registraToolResult(evento.isError, descrivi(evento.detail));
    if (evento.type === "session" && typeof evento.sessionId === "string" && evento.sessionId !== sessionId) {
      try {
        salvaSessione(dirCoord, taskId, { provider: agent, cwd, profile }, evento.sessionId);
        sessionId = evento.sessionId;
      } catch (err) {
        erroreIO(err);
      }
    }
  }
  const streamOptions = {
    parse: ADATTATORI[agent].parseEvent,
    format: agent === "claude" ? formattaRigaNdjson : formattaEventoProvider,
    onRaw(riga) {
      if (parsaRigaNdjson(riga)) raw.write(riga + "\n");
    },
  };
  function gestorePer(destinazione) {
    return creaGestoreStream(testo => {
      destinazione.write(testo);
      log.write(testo);
    }, onEvent, streamOptions);
  }
  const stdout = gestorePer(process.stdout);
  const stderr = gestorePer(process.stderr);
  const onSigint = () => interrompi(130);
  const onSigterm = () => interrompi(143);
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  log.on("error", erroreIO);
  raw.on("error", erroreIO);

  function finalizza(code, signal) {
    if (finalizzato) return;
    finalizzato = true;
    clearInterval(timerTelemetria);
    clearTimeout(timeout);
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    stdout.chiudi();
    stderr.chiudi();
    const exitCode = stopCode ?? code ?? (signal ? 128 + (constants.signals[signal] ?? 15) : 1);
    log.write(`\n=== [${new Date().toISOString()}] Fine esecuzione task ${taskId} (exit code: ${exitCode}${signal ? `, segnale: ${signal}` : ""}) ===\n`);
    if (exitCode === 0) {
      const promosso = promuoviTaskAConsegnato(dirCoord, taskId, errori => {
        log.write(`[Runner] CONSEGNA_INCOMPLETA: ${errori.join(" | ")}\n`);
      });
      if (promosso) log.write(`[Runner] Transizione automatica: task ${taskId} -> CONSEGNATO\n`);
    }
    raw.end();
    log.end(aggiornaTelemetria);
    process.exitCode = exitCode;
  }

  try {
    child = avviaProcesso(command, cwd, costruisciEnvFiglio(process.env, taskId, dispatchId), stdout, stderr, erroreIO);
    child.once("error", err => {
      avvisa(`[Runner] Errore avvio processo: ${err.message}\n`);
    });
    child.once("close", finalizza);
    if (timeoutMs !== null) {
      timeout = setTimeout(() => {
        avvisa(`[Runner] TIMEOUT dopo ${timeoutMs} ms. Arresto dell'albero processi.\n`);
        interrompi(124);
      }, timeoutMs);
    }
  } catch (err) {
    avvisa(`[Runner] Errore avvio processo: ${err.message}\n`);
    finalizza(1);
  }
}

// Avvio CLI se eseguito direttamente
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) eseguiRunner();
