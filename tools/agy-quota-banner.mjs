#!/usr/bin/env node
// PreInvocation: inietta semaforo di quota se sopra soglia o se lo stato quota è sconosciuto.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

let grezzo = ""; for await (const c of process.stdin) grezzo += c;
const esci = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0); };

let q;
try {
  q = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, "quota-anthropic.mjs")], { encoding: "utf8", timeout: 8000 }));
} catch { esci({}); }

if (!q.ok || q.source === "unknown") {
  esci({ injectSteps: [{ ephemeralMessage:
    `[QUOTA ANTHROPIC] Stato quota non determinabile (fonte: ${q?.source ?? "errore"}). Procedi con cautela, mantieni aggiornati i Punti di ripresa.` }] });
}

const five = q.fiveHourPct ?? 0;
const seven = q.sevenDayPct ?? 0;

if (five < 70 && seven < 70) esci({});

let reset = "ignoto";
if (q.resetsAt) {
  const d = typeof q.resetsAt === "number" ? new Date(q.resetsAt * 1000) : new Date(q.resetsAt);
  if (!isNaN(d.getTime())) {
    reset = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }
}

let azione = "";
if (seven >= 95) {
  azione = "STOP SETTIMANALE: Quota 7 giorni al 95%. La ripresa si pianifica a giorni, non a ore.";
} else if (five >= 95) {
  azione = "FERMATI: Quota 5 ore al 95%. Non assegnare nuovo lavoro a Claude Code. Fai scrivere l'handover.";
} else if (seven >= 85) {
  azione = "ATTENZIONE 7 GIORNI: Quota settimanale all'85%. Delega a Codex o esecutore AGY.";
} else if (five >= 85) {
  azione = "ATTENZIONE 5 ORE: Quota 5 ore all'85%. Chiudi il blocco corrente, commit, sposta il resto su altro bucket.";
} else if (seven >= 70) {
  azione = "Quota 7 giorni al 70%: sposta il lavoro meccanico su modello ed effort inferiori.";
} else {
  azione = "Quota 5 ore al 70%: non assegnare a Claude Code task di taglia L. Verifica il Punto di ripresa.";
}

esci({ injectSteps: [{ ephemeralMessage:
  `[QUOTA ANTHROPIC] 5 ore: ${q.fiveHourPct ?? "?"}% · 7 giorni: ${q.sevenDayPct ?? "?"}% · reset ${reset} (fonte: ${q.source}). ${azione}` }] });
