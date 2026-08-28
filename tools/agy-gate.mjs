#!/usr/bin/env node
// PreToolUse di Antigravity: nega ciò che AGENTS.md vieta, invece di sperare che il modello lo ricordi.
let grezzo = "";
for await (const c of process.stdin) grezzo += c;
const esci = (decision, reason) => { process.stdout.write(JSON.stringify({ decision, reason })); process.exit(0); };

let p; try { p = JSON.parse(grezzo); } catch { esci("allow", ""); }
const nome = p?.toolCall?.name ?? "";
const cmd = String(p?.toolCall?.args?.CommandLine ?? "");

if (nome !== "run_command") esci("allow", "");

// Vietato sempre: pubblicazione, distribuzione, migrazione, installazione globale, permessi saltati.
const VIETATI = [
  [/\bgit\s+push\b/i,                       "git push è una pubblicazione: la autorizza il Direttore"],
  [/\bnpm\s+(publish|deploy)\b/i,           "pubblicazione di pacchetto"],
  [/\b(vercel|netlify|fly|heroku|gcloud|aws|az)\b.*\b(deploy|publish|up)\b/i, "deploy verso un servizio esterno"],
  [/\b(prisma|knex|alembic|rails)\b.*\bmigrat/i, "migrazione di schema"],
  [/\bnpm\s+(i|install)\b[^|;]*\s-g\b/i,    "installazione globale, fuori dal repository"],
  [/\bcurl\b[^|;]*\|\s*(ba)?sh\b/i,         "scaricare ed eseguire uno script in un colpo solo"],
  [/--dangerously-skip-permissions/i,       "disattiva i permessi per conto del Direttore"],
  [/--dangerously-bypass-approvals/i,       "disattiva le approvazioni per conto del Direttore"],
];
for (const [re, motivo] of VIETATI) if (re.test(cmd)) esci("deny", `Vietato dal protocollo: ${motivo}. Chiedi al Direttore.`);

// Cancellazioni su percorsi assoluti fuori dal workspace: si chiede, non si nega — a volte sono legittime.
const radici = (p.workspacePaths ?? []).map((x) => x.replace(/\\/g, "/").toLowerCase());
const assoluto = /(^|\s|;|\|)(rm|mv|cp|del|rmdir)\s+[^|;]*(\s|["'])([a-z]:\/|\/)/i.test(cmd.replace(/\\/g, "/"));
if (assoluto && radici.length) {
  const dentro = radici.some((r) => cmd.replace(/\\/g, "/").toLowerCase().includes(r));
  if (!dentro) esci("ask", "Il comando sembra toccare percorsi fuori dal workspace. Conferma.");
}

esci("allow", "");
