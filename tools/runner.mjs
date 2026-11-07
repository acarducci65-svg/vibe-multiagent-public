#!/usr/bin/env node
// Runner universale v2.1: incanala stdout/stderr su console e su .coord/logs/<ID_TASK>.log,
// aggiornando la telemetria in tempo reale per la Dashboard.
// Include parser per formattare gli eventi NDJSON di Claude Code (--output-format stream-json),
// gestione worktree isolati, dispatchId, e Circuit Breaker meccanico contro runaway loops.
import { spawn } from "node:child_process";
import { createWriteStream, createReadStream, mkdirSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:os";
import { StringDecoder } from "node:string_decoder";
import { raccogliTelemetria } from "./telemetry.mjs";

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
    return ev && typeof ev === "object" && ev.type ? ev : null;
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

  if (ev.type === "assistant") {
    const contents = ev.message?.content || [];
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
    const contents = ev.message?.content || [];
    for (const item of contents) {
      if (item.type === "tool_result") {
        if (item.is_error) {
          const errText = typeof item.content === "string" ? item.content : JSON.stringify(item.content);
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
    const costo = ev.total_cost_usd !== undefined ? `, costo: $${ev.total_cost_usd.toFixed(4)})` : dur ? ")" : "";
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

export function creaGestoreStream(suChunkFormattato, onEvent = null) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  return {
    scrivi(chunk) {
      buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
      const righe = buffer.split(/\r?\n/);
      buffer = righe.pop();
      for (const riga of righe) {
        if (onEvent) {
          const ev = parsaRigaNdjson(riga);
          if (ev) onEvent(ev);
        }
        const formattata = formattaRigaNdjson(riga);
        if (formattata) {
          suChunkFormattato(formattata);
        }
      }
    },
    chiudi() {
      buffer += decoder.end();
      if (buffer.length > 0) {
        const righe = buffer.split(/\r?\n/);
        for (const riga of righe) {
          if (riga.trim()) {
            if (onEvent) {
              const ev = parsaRigaNdjson(riga);
              if (ev) onEvent(ev);
            }
            const formattata = formattaRigaNdjson(riga);
            if (formattata) {
              suChunkFormattato(formattata);
            }
          }
        }
        buffer = "";
      }
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
  let promptFile = null;
  let worktree = null;
  let dispatchId = null;

  const args = argv.slice(2);
  const doppioTrattino = args.indexOf("--");

  let opzioni = args;
  if (doppioTrattino !== -1) {
    opzioni = args.slice(0, doppioTrattino);
    const cmdTokens = args.slice(doppioTrattino + 1);
    const quoteArg = (tok) => {
      if (process.platform === "win32") {
        if (/[\s"^&|<>]/.test(tok)) {
          return `"${tok.replace(/"/g, '""')}"`;
        }
        return tok;
      }
      if (/[\s"'$`\!&;*?~<>|^#]/.test(tok)) {
        return `"${tok.replace(/(["\$`])/g, "\$1")}"`;
      }
      return tok;
    };
    cmd = cmdTokens.map(quoteArg).join(" ");
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
      cmd = opzioni[++i] || cmd;
    } else if (a === "--prompt-file" || a === "-f") {
      promptFile = opzioni[++i] || promptFile;
    } else if (a === "--agent" || a === "-a") {
      agent = (opzioni[++i] || agent).toLowerCase();
    } else if (a === "--model" || a === "-m") {
      model = opzioni[++i] || model;
    } else if (a === "--worktree" || a === "-w") {
      worktree = valoreOpzione(opzioni, ++i, "--worktree");
    } else if (a === "--dispatch-id" || a === "-d") {
      dispatchId = valoreOpzione(opzioni, ++i, "--dispatch-id");
      if (!REGEX_DISPATCH_ID.test(dispatchId)) {
        throw new ErroreArgomenti(
          `--dispatch-id non valido: "${dispatchId}" (ammessi [A-Za-z0-9_.:-], iniziale alfanumerica, max 64 caratteri)`
        );
      }
    }
  }

  if (!cmd) {
    if (agent === "codex") {
      // Codex: default non interattivo anche senza --prompt-file (il prompt arriva su stdin "-").
      const modelFlag = model ? ` -m ${model}` : "";
      cmd = `codex exec${modelFlag} --dangerously-bypass-approvals-and-sandbox -`;
    } else if (promptFile) {
      if (agent === "agy") {
        const modelFlag = model ? ` -m ${model}` : "";
        cmd = `agy -p -${modelFlag}`;
      } else {
        const modelFlag = model ? ` --model ${model}` : "";
        cmd = `claude -p - --output-format stream-json --verbose${modelFlag}`;
      }
    }
  }

  return { taskId, dirCoord, cmd, promptFile, agent, model, worktree, dispatchId };
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

const USO = [
  "Uso: node runner.mjs --task <ID_TASK> [--coord <DIR_COORD>] [--worktree <PATH>] [--dispatch-id <ID>] [--prompt-file <FILE>] --cmd \"<COMANDO>\"",
  "     oppure: node runner.mjs --task <ID_TASK> [--coord <DIR_COORD>] --prompt-file <FILE> [--agent claude|codex|agy] [--model <MODELLO>]",
  "     oppure: node runner.mjs --task <ID_TASK> [--coord <DIR_COORD>] -- <COMANDO>",
].join("\n") + "\n";

export function eseguiRunner(argv = process.argv) {
  let argomenti;
  try {
    argomenti = analizzaArgomenti(argv);
  } catch (err) {
    if (!(err instanceof ErroreArgomenti)) throw err;
    process.stderr.write(`Errore: ${err.message}\n${USO}`);
    process.exit(1);
  }
  const { taskId: rawTaskId, dirCoord: rawCoord, cmd, promptFile, worktree, dispatchId } = argomenti;

  // Sanitizza taskId contro path traversal ed escape da .coord/logs/
  let safeTaskId = (rawTaskId || "generale").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeTaskId) safeTaskId = "generale";

  if (!cmd || cmd.trim().length === 0) {
    process.stderr.write(USO);
    process.exit(1);
  }

  const radice = process.cwd();
  const executionCwd = risolviCwdEsecuzione(radice, worktree);
  if (worktree && !existsSync(executionCwd)) {
    process.stderr.write(`Errore: la cartella --worktree non esiste: ${executionCwd}\n`);
    process.exit(1);
  }
  const dirCoordAssoluta = isAbsolute(rawCoord) ? rawCoord : join(radice, rawCoord);
  const dirLogs = join(dirCoordAssoluta, "logs");

  if (!existsSync(dirLogs)) {
    try {
      mkdirSync(dirLogs, { recursive: true });
    } catch {}
  }

  const pathLog = join(dirLogs, `${safeTaskId}.log`);
  const streamLog = createWriteStream(pathLog, { flags: "a", encoding: "utf8" });

  const oraInizio = new Date().toISOString();
  streamLog.write(`\n=== [${oraInizio}] Inizio esecuzione task ${safeTaskId} ===\n`);
  streamLog.write(`Comando: ${cmd}${promptFile ? ` (da file prompt: ${promptFile})` : ""}\n`);
  if (dispatchId) streamLog.write(`Dispatch ID: ${dispatchId}\n`);
  if (worktree) streamLog.write(`Worktree: ${worktree} (cwd: ${executionCwd})\n`);
  streamLog.write("\n");

  try {
    raccogliTelemetria(radice, dirCoordAssoluta);
  } catch {}

  const timerTelemetria = setInterval(() => {
    try {
      raccogliTelemetria(radice, dirCoordAssoluta);
    } catch {}
  }, 2000);

  const absPromptFile = promptFile ? (isAbsolute(promptFile) ? promptFile : join(radice, promptFile)) : null;
  const envChild = costruisciEnvFiglio(process.env, safeTaskId, dispatchId);

  let child;
  const breaker = new CircuitBreaker({
    onTrip: (motivo) => {
      const avviso = `\n[CircuitBreaker] 🛑 TRIP: ${motivo}. Arresto immediato del processo per protezione cantiere.\n`;
      process.stderr.write(avviso);
      streamLog.write(avviso);
      try {
        if (child) child.kill("SIGTERM");
      } catch {}
    },
    onSteer: (motivo) => {
      const avviso = `\n[CircuitBreaker] ⚠️ STEERING: ${motivo}.\n`;
      process.stderr.write(avviso);
      streamLog.write(avviso);
    },
    onConstrain: (motivo) => {
      const avviso = `
[CircuitBreaker] 🚧 CONSTRAINED: ${motivo}. Prossima anomalia = arresto.
`;
      process.stderr.write(avviso);
      streamLog.write(avviso);
    },
  });

  const onEvent = (ev) => {
    if (ev.type === "assistant") {
      const contents = ev.message?.content || [];
      for (const item of contents) {
        if (item.type === "tool_use") {
          breaker.registraToolCall(item.name || "tool", item.input);
        }
      }
    } else if (ev.type === "user") {
      const contents = ev.message?.content || [];
      for (const item of contents) {
        if (item.type === "tool_result") {
          breaker.registraToolResult(
            Boolean(item.is_error),
            typeof item.content === "string" ? item.content : JSON.stringify(item.content)
          );
        }
      }
    }
  };

  child = spawn(cmd, {
    shell: true,
    stdio: [absPromptFile ? "pipe" : (process.stdin.isTTY ? "inherit" : "ignore"), "pipe", "pipe"],
    cwd: executionCwd,
    env: envChild,
  });

  if (absPromptFile && existsSync(absPromptFile)) {
    const rs = createReadStream(absPromptFile);
    rs.pipe(child.stdin);
  }

  const gestoreStdout = creaGestoreStream((testoFormattato) => {
    process.stdout.write(testoFormattato);
    streamLog.write(testoFormattato);
  }, onEvent);

  const gestoreStderr = creaGestoreStream((testoFormattato) => {
    process.stderr.write(testoFormattato);
    streamLog.write(testoFormattato);
  });

  if (child.stdout) {
    child.stdout.on("data", (chunk) => {
      gestoreStdout.scrivi(chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      gestoreStderr.scrivi(chunk);
    });
  }

  child.on("error", (err) => {
    clearInterval(timerTelemetria);
    gestoreStdout.chiudi();
    gestoreStderr.chiudi();
    const msg = `[${new Date().toISOString()}] Errore avvio processo: ${err.message}\n`;
    process.stderr.write(msg);
    streamLog.write(msg);
    streamLog.end(() => {
      try {
        raccogliTelemetria(radice, dirCoordAssoluta);
      } catch {}
      process.exit(1);
    });
  });

  child.on("close", (code, signal) => {
    clearInterval(timerTelemetria);
    gestoreStdout.chiudi();
    gestoreStderr.chiudi();
    const oraFine = new Date().toISOString();
    let exitCode = code;
    if (exitCode === null) {
      const sigNum = signal && constants?.signals?.[signal] ? constants.signals[signal] : null;
      exitCode = sigNum ? 128 + sigNum : (signal ? 128 + 15 : 1);
    }
    streamLog.write(`\n=== [${oraFine}] Fine esecuzione task ${safeTaskId} (exit code: ${exitCode}${signal ? `, segnale: ${signal}` : ""}) ===\n`);
    streamLog.end(() => {
      try {
        raccogliTelemetria(radice, dirCoordAssoluta);
      } catch {}
      process.exit(exitCode);
    });
  });

  process.on("SIGINT", () => {
    clearInterval(timerTelemetria);
    gestoreStdout.chiudi();
    gestoreStderr.chiudi();
    child.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    clearInterval(timerTelemetria);
    gestoreStdout.chiudi();
    gestoreStderr.chiudi();
    child.kill("SIGTERM");
  });
}

// Avvio CLI se eseguito direttamente
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  eseguiRunner();
}
