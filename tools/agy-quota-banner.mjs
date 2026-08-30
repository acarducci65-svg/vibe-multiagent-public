#!/usr/bin/env node
// PreInvocation: parla solo quando c'è qualcosa da dire. Sotto soglia non costa un token.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

let grezzo = ""; for await (const c of process.stdin) grezzo += c;
const esci = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0); };

let q;
try {
  q = JSON.parse(execFileSync("node", [join(import.meta.dirname, "quota-anthropic.mjs")], { encoding: "utf8", timeout: 8000 }));
} catch { esci({}); }

const peggio = Math.max(q.fiveHourPct ?? 0, q.sevenDayPct ?? 0);
if (!q.ok || peggio < 70) esci({});

let reset = "ignoto";
if (q.resetsAt) {
  const d = typeof q.resetsAt === "number" ? new Date(q.resetsAt * 1000) : new Date(q.resetsAt);
  if (!isNaN(d.getTime())) {
    reset = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }
}
const azione =
  peggio >= 95 ? "FERMATI: non assegnare nuovo lavoro a Claude Code. Fai scrivere l'handover e riferisci al Direttore."
  : peggio >= 85 ? "Chiudi il blocco in corso su Claude Code, fai committare, poi instrada il lavoro restante su Codex o su un esecutore AGY."
  : "Non assegnare a Claude Code task di taglia L. Verifica che il task IN CORSO abbia il Punto di ripresa aggiornato.";

esci({ injectSteps: [{ ephemeralMessage:
  `[QUOTA ANTHROPIC] 5 ore: ${q.fiveHourPct ?? "?"}% · 7 giorni: ${q.sevenDayPct ?? "?"}% · reset ${reset} (fonte: ${q.source}). ${azione}` }] });
