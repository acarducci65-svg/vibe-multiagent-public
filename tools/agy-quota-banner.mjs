#!/usr/bin/env node
// PreInvocation: inietta ad ogni turno il promemoria del protocollo multi-agente e il semaforo di quota se pertinente.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

let grezzo = ""; for await (const c of process.stdin) grezzo += c;
const esci = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0); };

let p;
try { p = JSON.parse(grezzo); } catch { p = {}; }

let q = { ok: false, source: "unknown" };
try {
  q = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, "quota-anthropic.mjs")], { encoding: "utf8", timeout: 8000 }));
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

const promemoriaRuolo = `[PROTOCOLLO MULTI-AGENTE ATTIVO] Sei il Coordinatore/Dispatcher & Integratore. Per QUALSIASI nuova richiesta dell'utente (bugfix, nuove feature, refactor, manutenzione): NON implementare direttamente i file applicativi! Crea/aggiorna prima il task in .coord/tasks/, aggiorna CURRENT_SPRINT.md e instrada all'esecutore appropriato secondo AGENTS.md e DISPATCH.md.`;

esci({
  injectSteps: [
    {
      ephemeralMessage: `${promemoriaRuolo}${messaggioQuota}`,
    },
  ],
});
