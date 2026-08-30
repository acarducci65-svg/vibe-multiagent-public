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
// Gestisce anche estensioni (.exe, .cmd, .ps1, .bat) e flag intermedi (es. git -C repo push)
const VIETATI = [
  [/\bgit(\.exe)?\b.*\bpush\b/i,                       "git push è una pubblicazione: la autorizza il Direttore"],
  [/\bnpm(\.cmd|\.exe|\.ps1|\.bat)?\s+(publish|deploy)\b/i, "pubblicazione di pacchetto"],
  [/\bpnpm(\.cmd|\.exe|\.ps1|\.bat)?\s+publish\b/i,     "pubblicazione di pacchetto"],
  [/\byarn(\.cmd|\.exe|\.ps1|\.bat)?\s+publish\b/i,     "pubblicazione di pacchetto"],
  [/\b(vercel|netlify|flyctl|fly|heroku|gcloud|aws|az)(\.cmd|\.exe|\.ps1|\.bat)?\b.*\b(deploy|publish|up)\b/i, "deploy verso un servizio esterno"],
  [/\b(prisma|knex|alembic|rails)(\.cmd|\.exe|\.ps1|\.bat)?\b.*\bmigrat/i, "migrazione di schema"],
  [/\bnpm(\.cmd|\.exe|\.ps1|\.bat)?\s+(i|install)\b[^|;]*\s(-g|--global)\b/i, "installazione globale, fuori dal repository"],
  [/\bcurl(\.exe)?\b[^|;]*\|\s*(ba)?sh\b/i,            "scaricare ed eseguire uno script in un colpo solo"],
  [/--dangerously-skip-permissions/i,                   "disattiva i permessi per conto del Direttore"],
  [/--dangerously-bypass-approvals/i,                   "disattiva le approvazioni per conto del Direttore"],
];
for (const [re, motivo] of VIETATI) if (re.test(cmd)) esci("deny", `Vietato dal protocollo: ${motivo}. Chiedi al Direttore.`);

// Cancellazioni su percorsi assoluti fuori dal workspace: si chiede, non si nega — a volte sono legittime.
const radici = (p.workspacePaths ?? []).map((x) => x.replace(/\\/g, "/").toLowerCase());
const matchRimozione = cmd.replace(/\\/g, "/").match(/(?:^|\s|;|\|)(?:rm|del|rmdir|Remove-Item)\s+([^|;]+)/i);
if (matchRimozione && radici.length) {
  const targetTokens = matchRimozione[1].split(/\s+/).filter((t) => !t.startsWith("-") && !t.startsWith("/"));
  for (const token of targetTokens) {
    const pulito = token.replace(/["']/g, "").toLowerCase();
    if (/^(?:[a-z]:\/|\/)/i.test(pulito)) {
      const dentro = radici.some((r) => pulito.startsWith(r) || pulito.includes(r));
      if (!dentro) esci("ask", `Il comando cancella un percorso fuori dal workspace (${token}). Conferma.`);
    }
  }
}

esci("allow", "");
