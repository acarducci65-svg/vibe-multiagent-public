#!/usr/bin/env node
// Runner universale: incanala stdout/stderr su console e su .coord/logs/<ID_TASK>.log,
// aggiornando la telemetria in tempo reale per la Dashboard.
// Include parser intelligente per formattare gli eventi NDJSON di Claude Code (--output-format stream-json).
import { spawn } from "node:child_process";
import { createWriteStream, createReadStream, mkdirSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:os";
import { raccogliTelemetria } from "./telemetry.mjs";

export function formattaRigaNdjson(riga) {
  const rigaPulita = riga.replace(/\r$/, "");
  const trimmed = rigaPulita.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return rigaPulita + "\n";
  }

  let ev;
  try {
    ev = JSON.parse(trimmed);
  } catch {
    return rigaPulita + "\n";
  }

  if (!ev || typeof ev !== "object" || !ev.type) {
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
    out.push(`${prefix} ✅ Completato${dur}${costo}${resSummary ? `: ${resSummary.slice(0, 150)}` : ""}`);
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
    }
  }

  if (out.length === 0) {
    return "";
  }
  return out.join("\n") + "\n";
}

export function creaGestoreStream(suChunkFormattato) {
  let buffer = "";
  return {
    scrivi(chunk) {
      buffer += chunk.toString("utf8");
      const righe = buffer.split(/\r?\n/);
      buffer = righe.pop();
      for (const riga of righe) {
        const formattata = formattaRigaNdjson(riga);
        if (formattata) {
          suChunkFormattato(formattata);
        }
      }
    },
    chiudi() {
      if (buffer.length > 0) {
        const formattata = formattaRigaNdjson(buffer);
        if (formattata) {
          suChunkFormattato(formattata);
        }
        buffer = "";
      }
    },
  };
}

export function analizzaArgomenti(argv) {
  let taskId = "generale";
  let dirCoord = process.env.DIR_COORD || ".coord";
  let cmd = "";
  let promptFile = null;

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
      if (/[\s"'$`\\!&;*?~<>|^#]/.test(tok)) {
        return `"${tok.replace(/(["\\$`])/g, "\\$1")}"`;
      }
      return tok;
    };
    cmd = cmdTokens.map(quoteArg).join(" ");
  }

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
    }
  }

  if (!cmd && promptFile) {
    cmd = "claude -p - --output-format stream-json --verbose";
  }

  return { taskId, dirCoord, cmd, promptFile };
}

export function eseguiRunner(argv = process.argv) {
  const { taskId: rawTaskId, dirCoord: rawCoord, cmd, promptFile } = analizzaArgomenti(argv);

  // Sanitizza taskId contro path traversal ed escape da .coord/logs/
  let safeTaskId = (rawTaskId || "generale").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeTaskId) safeTaskId = "generale";

  if (!cmd || cmd.trim().length === 0) {
    process.stderr.write("Uso: node runner.mjs --task <ID_TASK> [--coord <DIR_COORD>] [--prompt-file <FILE>] --cmd \"<COMANDO>\"\n");
    process.stderr.write("     oppure: node runner.mjs --task <ID_TASK> [--coord <DIR_COORD>] --prompt-file <FILE>\n");
    process.stderr.write("     oppure: node runner.mjs --task <ID_TASK> [--coord <DIR_COORD>] -- <COMANDO>\n");
    process.exit(1);
  }

  const radice = process.cwd();
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
  streamLog.write(`Comando: ${cmd}${promptFile ? ` (da file prompt: ${promptFile})` : ""}\n\n`);

  // Telemetria iniziale
  try {
    raccogliTelemetria(radice, dirCoordAssoluta);
  } catch {}

  // Timer periodico per aggiornare la telemetria durante l'esecuzione
  const timerTelemetria = setInterval(() => {
    try {
      raccogliTelemetria(radice, dirCoordAssoluta);
    } catch {}
  }, 2000);

  const absPromptFile = promptFile ? (isAbsolute(promptFile) ? promptFile : join(radice, promptFile)) : null;

  const child = spawn(cmd, {
    shell: true,
    stdio: [absPromptFile ? "pipe" : (process.stdin.isTTY ? "inherit" : "ignore"), "pipe", "pipe"],
    cwd: radice,
    env: { ...process.env, TASK_ATTIVO: safeTaskId },
  });

  if (absPromptFile && existsSync(absPromptFile)) {
    const rs = createReadStream(absPromptFile);
    rs.pipe(child.stdin);
  }

  const gestoreStdout = creaGestoreStream((testoFormattato) => {
    process.stdout.write(testoFormattato);
    streamLog.write(testoFormattato);
  });

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
