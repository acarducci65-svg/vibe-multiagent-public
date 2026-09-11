#!/usr/bin/env node
// Hook PreToolUse di Antigravity: guardrail meccanico per agenti cooperativi.
// Previene disattenzioni del modello (push, deploy, migrazioni non autorizzate).
// NOTA DI SICUREZZA: è un presidio per mantenere il protocollo di cantiere ordinato,
// non un perimetro impenetrabile di sandbox contro codice malevolo intenzionale.
import { resolve, normalize } from "node:path";

let grezzo = "";
for await (const c of process.stdin) grezzo += c;
const esci = (decision, reason) => { process.stdout.write(JSON.stringify({ decision, reason })); process.exit(0); };

let p; try { p = JSON.parse(grezzo); } catch { esci("allow", ""); }
const nome = p?.toolCall?.name ?? "";
const cmd = String(p?.toolCall?.args?.CommandLine ?? "");

if (nome !== "run_command") esci("allow", "");

// Vietato sempre: pubblicazione, distribuzione, migrazione, installazione globale, script piping, permessi saltati.
const VIETATI = [
  [/\bgit(\.exe)?\b.*\bpush\b/i,                                         "git push è una pubblicazione: la autorizza il Direttore"],
  [/\b(npm|pnpm|yarn|bun)(\.cmd|\.exe|\.ps1|\.bat)?\s+(publish|deploy)\b/i, "pubblicazione di pacchetto"],
  [/\b(vercel|netlify|flyctl|fly|heroku|gcloud|aws|az)(\.cmd|\.exe|\.ps1|\.bat)?\b.*\b(deploy|publish|up)\b/i, "deploy verso un servizio esterno"],
  [/\b(prisma|knex|alembic|rails)(\.cmd|\.exe|\.ps1|\.bat)?\b.*\bmigrat/i, "migrazione di schema"],
  [/\b(npm|pnpm|yarn|bun)(\.cmd|\.exe|\.ps1|\.bat)?\b.*(-g\b|--global\b|\bglobal\s+add\b)/i, "installazione globale, fuori dal repository"],
  [/\b(curl|iwr|irm|wget)(\.exe)?\b[^|;]*\|\s*(ba)?sh\b/i,               "scaricare ed eseguire uno script in un colpo solo"],
  [/\b(curl|iwr|irm|wget)(\.exe)?\b[^|;]*\|\s*(powershell|pwsh|iex)\b/i, "scaricare ed eseguire uno script in un colpo solo"],
  [/--dangerously-skip-permissions/i,                                    "disattiva i permessi per conto del Direttore"],
  [/--dangerously-bypass-approvals/i,                                    "disattiva le approvazioni per conto del Direttore"],
];
for (const [re, motivo] of VIETATI) if (re.test(cmd)) esci("deny", `Vietato dal protocollo: ${motivo}. Chiedi al Direttore.`);

// Cancellazioni su percorsi fuori dal workspace (inclusi percorsi relativi tipo ../ o comandi multipli)
const radici = (p.workspacePaths ?? []).map((x) => normalize(resolve(x)).toLowerCase());
const comandi = cmd.split(/[;&|]+/);
for (const c of comandi) {
  const matchRimozione = c.trim().match(/^(?:rm|del|rmdir|Remove-Item|erase)\b\s*(.*)$/i);
  if (matchRimozione && radici.length) {
    const tokens = matchRimozione[1].split(/\s+/).filter((t) => {
      if (!t || t.startsWith("-")) return false;
      // Su Windows scarta switch DOS tipo /s, /q, /f
      if (process.platform === "win32" && /^\/[a-zA-Z](?:$|[\s"'])/.test(t)) return false;
      return true;
    });
    for (const t of tokens) {
      const pulito = t.replace(/["']/g, "");
      const pathAssoluto = normalize(resolve(pulito)).toLowerCase();
      const dentro = radici.some((r) => pathAssoluto === r || pathAssoluto.startsWith(r + "\\") || pathAssoluto.startsWith(r + "/"));
      if (!dentro) {
        esci("ask", `Il comando cancella un percorso fuori dal workspace (${pulito}). Conferma.`);
      }
    }
  }
}

esci("allow", "");
