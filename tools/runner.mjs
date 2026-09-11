#!/usr/bin/env node
// Runner universale: incanala stdout/stderr su console e su .coord/logs/<ID_TASK>.log,
// aggiornando la telemetria in tempo reale per la Dashboard.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { constants } from "node:os";
import { raccogliTelemetria } from "./telemetry.mjs";

function analizzaArgomenti(argv) {
  let taskId = "generale";
  let dirCoord = process.env.DIR_COORD || ".coord";
  let cmd = "";

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
    }
  }

  return { taskId, dirCoord, cmd };
}

const { taskId: rawTaskId, dirCoord: rawCoord, cmd } = analizzaArgomenti(process.argv);

// Sanitizza taskId contro path traversal ed escape da .coord/logs/
let safeTaskId = (rawTaskId || "generale").replace(/[^a-zA-Z0-9_-]/g, "");
if (!safeTaskId) safeTaskId = "generale";

if (!cmd || cmd.trim().length === 0) {
  process.stderr.write("Uso: node runner.mjs --task <ID_TASK> [--coord <DIR_COORD>] --cmd \"<COMANDO>\"\n");
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
streamLog.write(`Comando: ${cmd}\n\n`);

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

const child = spawn(cmd, {
  shell: true,
  stdio: ["inherit", "pipe", "pipe"],
  cwd: radice,
  env: { ...process.env, TASK_ATTIVO: safeTaskId },
});

if (child.stdout) {
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    streamLog.write(chunk);
  });
}

if (child.stderr) {
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    streamLog.write(chunk);
  });
}

child.on("error", (err) => {
  clearInterval(timerTelemetria);
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
  child.kill("SIGINT");
});

process.on("SIGTERM", () => {
  clearInterval(timerTelemetria);
  child.kill("SIGTERM");
});
