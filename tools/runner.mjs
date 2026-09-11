#!/usr/bin/env node
// Runner universale: incanala stdout/stderr su console e su .coord/logs/<ID_TASK>.log,
// aggiornando la telemetria in tempo reale per la Dashboard.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
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
    cmd = cmdTokens
      .map((tok) => (/[\s"']/.test(tok) ? `"${tok.replace(/"/g, '\\"')}"` : tok))
      .join(" ");
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

const { taskId, dirCoord: rawCoord, cmd } = analizzaArgomenti(process.argv);

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

const pathLog = join(dirLogs, `${taskId}.log`);
const streamLog = createWriteStream(pathLog, { flags: "a", encoding: "utf8" });

const oraInizio = new Date().toISOString();
streamLog.write(`\n=== [${oraInizio}] Inizio esecuzione task ${taskId} ===\n`);
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
  env: { ...process.env, TASK_ATTIVO: taskId },
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

child.on("close", (code) => {
  clearInterval(timerTelemetria);
  const oraFine = new Date().toISOString();
  streamLog.write(`\n=== [${oraFine}] Fine esecuzione task ${taskId} (exit code: ${code ?? 0}) ===\n`);
  streamLog.end(() => {
    try {
      raccogliTelemetria(radice, dirCoordAssoluta);
    } catch {}
    process.exit(code ?? 0);
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
