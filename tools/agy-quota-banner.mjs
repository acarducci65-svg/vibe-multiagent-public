#!/usr/bin/env node
// PreInvocation: inietta ad ogni turno il promemoria del protocollo multi-agente e il semaforo di quota se pertinente.
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { raccogliTelemetria } from "./telemetry.mjs";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

let grezzo = ""; for await (const c of process.stdin) grezzo += c;
const esci = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0); };

let p;
try { p = JSON.parse(grezzo); } catch { p = {}; }

const radice = (p.workspacePaths ?? [])[0] ?? process.cwd();
try {
  raccogliTelemetria(radice, process.env.DIR_COORD || ".coord");
} catch {}

let q = { ok: false, source: "unknown" };
try {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  const minor = parseInt(process.versions.node.split(".")[1], 10);
  const usaSystemCa = major > 22 || (major === 22 && minor >= 15);
  const execArgs = usaSystemCa ? ["--use-system-ca", join(__dirname, "quota-anthropic.mjs")] : [join(__dirname, "quota-anthropic.mjs")];
  q = JSON.parse(
    execFileSync(process.execPath, execArgs, {
      encoding: "utf8",
      timeout: 8000,
      env: { ...process.env, VIBE_ANTHROPIC_QUOTA: process.env.VIBE_ANTHROPIC_QUOTA || "1" },
    })
  );
} catch {}

const five = q?.fiveHourPct ?? 0;
const seven = q?.sevenDayPct ?? 0;

let reset = "ignoto";
if (q?.resetsAt) {
  const d = typeof q.resetsAt === "number" ? new Date(q.resetsAt * 1000) : new Date(q.resetsAt);
  if (!isNaN(d.getTime())) {
    reset = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }
}

let messaggioQuota = "";
if (q.ok && q.source !== "unknown") {
  if (seven >= 95) {
    messaggioQuota = ` [QUOTA ANTHROPIC] ⚠️ STOP SETTIMANALE: Quota 7 giorni al 95%. La ripresa si pianifica a giorni, non a ore.`;
  } else if (five >= 95) {
    messaggioQuota = ` [QUOTA ANTHROPIC] ⚠️ FERMATI: Quota 5 ore al 95%. Non assegnare nuovo lavoro a Claude Code. Fai scrivere l'handover.`;
  } else if (seven >= 85) {
    messaggioQuota = ` [QUOTA ANTHROPIC] ⚠️ Quota 7 giorni all'85%. Delega a Codex o esecutore AGY.`;
  } else if (five >= 85) {
    messaggioQuota = ` [QUOTA ANTHROPIC] ⚠️ Quota 5 ore all'85%. Chiudi il blocco corrente, commit, sposta il resto su altro bucket.`;
  } else if (seven >= 70 || five >= 70) {
    messaggioQuota = ` [QUOTA ANTHROPIC] 5 ore: ${five}% · 7 giorni: ${seven}% · reset ${reset}.`;
  }
} else if (q.source === "unknown" && q.note && !q.note.includes("ENOENT")) {
  messaggioQuota = ` [QUOTA ANTHROPIC] Stato quota non determinabile (fonte: ${q.source}). Procedi con cautela.`;
}

const dirCoord = process.env.DIR_COORD || ".coord";
const promemoriaRuolo = `[PROTOCOLLO MULTI-AGENTE ATTIVO] Sei il Coordinatore/Dispatcher & Integratore. Per QUALSIASI nuova richiesta dell'utente (bugfix, nuove feature, refactor, manutenzione): NON implementare direttamente i file applicativi! Crea/aggiorna prima il task in ${dirCoord}/tasks/, aggiorna ${dirCoord}/CURRENT_SPRINT.md e instrada all'esecutore appropriato secondo AGENTS.md e ${dirCoord}/DISPATCH.md.`;

esci({
  injectSteps: [
    {
      ephemeralMessage: `${promemoriaRuolo}${messaggioQuota}`,
    },
  ],
});
