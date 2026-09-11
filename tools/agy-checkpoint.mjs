#!/usr/bin/env node
// PostToolUse: scrive i fatti nel Punto di ripresa del task IN CORSO. Nessuna intenzione, solo cose verificabili.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, isAbsolute } from "node:path";
import { raccogliTelemetria } from "./telemetry.mjs";

let grezzo = ""; for await (const c of process.stdin) grezzo += c;
const fine = () => { process.stdout.write("{}"); process.exit(0); };

let p; try { p = JSON.parse(grezzo); } catch { fine(); }
const radice = (p.workspacePaths ?? [])[0];
if (!radice) fine();

// Supporto per flag opzionale --coord <dir> passato da riga di comando
let argCoord = null;
const idxCoord = process.argv.indexOf("--coord");
if (idxCoord !== -1 && process.argv[idxCoord + 1]) {
  const custom = process.argv[idxCoord + 1];
  argCoord = isAbsolute(custom) ? join(custom, "tasks") : join(radice, custom, "tasks");
}

const possibili = [
  argCoord,
  process.env.DIR_COORD ? join(radice, process.env.DIR_COORD, "tasks") : null,
  join(radice, ".coord", "tasks"),
  join(radice, ".claude", "agents", "tasks"),
].filter(Boolean);

const dirTask = possibili.find((d) => existsSync(d));
if (!dirTask) fine();

let inCorso = null;
try {
  const files = readdirSync(dirTask).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    try {
      const fullPath = join(dirTask, f);
      const content = readFileSync(fullPath, "utf8");
      if (/^Stato:\s*IN CORSO\s*$/m.test(content)) {
        inCorso = fullPath;
        break;
      }
    } catch {}
  }
} catch {}

if (inCorso) {
  const git = (...a) => { try { return execFileSync("git", ["-C", radice, ...a], { encoding: "utf8" }).trim(); } catch { return ""; } };
  const sporchi = git("status", "--short").split("\n").filter(Boolean).map((l) => l.slice(3)).join(", ") || "nessuno";
  const ultimo = git("log", "-1", "--format=%h %s") || "nessun commit";
  const ora = new Date().toISOString().replace("T", " ").slice(0, 16);

  const riga = `- Fatti: ${ora} — modificati: ${sporchi} — ultimo commit: ${ultimo}`;
  try {
    const testo = readFileSync(inCorso, "utf8");
    let nuovoTesto = testo;
    if (/^- Fatti:.*$/m.test(testo)) {
      nuovoTesto = testo.replace(/^- Fatti:.*$/m, riga);
    } else if (/(^- Ultimo passo completato:.*$)/m.test(testo)) {
      nuovoTesto = testo.replace(/(^- Ultimo passo completato:.*$)/m, `$1\n${riga}`);
    } else if (/^## Punto di ripresa/m.test(testo)) {
      nuovoTesto = testo.replace(/^## Punto di ripresa\s*$/m, `## Punto di ripresa\n\n${riga}`);
    }
    if (nuovoTesto !== testo) {
      writeFileSync(inCorso, nuovoTesto);
    }
  } catch {}
}

try {
  const coordDir = dirTask.replace(/[\\/]tasks$/, "");
  raccogliTelemetria(radice, coordDir);
} catch {}

fine();
