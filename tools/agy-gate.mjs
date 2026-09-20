#!/usr/bin/env node
// Hook PreToolUse di Antigravity: guardrail meccanico per agenti cooperativi.
// Previene disattenzioni del modello (push, deploy, migrazioni non autorizzate, o self-coding non autorizzato).
// NOTA DI SICUREZZA: è un presidio per mantenere il protocollo di cantiere ordinato,
// non un perimetro impenetrabile di sandbox contro codice malevolo intenzionale.
import { resolve, normalize, relative } from "node:path";
import { existsSync } from "node:fs";

let grezzo = "";
for await (const c of process.stdin) grezzo += c;
const esci = (decision, reason) => { process.stdout.write(JSON.stringify({ decision, reason })); process.exit(0); };

let p; try { p = JSON.parse(grezzo); } catch { esci("allow", ""); }
const nome = p?.toolCall?.name ?? "";

// 1. Intercettazione modifiche file sorgente (No Self-Coding senza autorizzazione del Direttore)
const STRUMENTI_SCRITTURA = new Set([
  "write_to_file",
  "replace_file_content",
  "multi_replace_file_content",
]);

if (STRUMENTI_SCRITTURA.has(nome)) {
  const targetFile = p?.toolCall?.args?.TargetFile ?? p?.toolCall?.args?.targetFile ?? "";
  if (targetFile) {
    const normTarget = normalize(resolve(targetFile));
    const normLower = normTarget.toLowerCase();

    // Permesso libero per file di coordinamento, regole agenti e documentazione di root
    const isCoord = /[\\/]\.coord([\\/]|$)/i.test(normTarget);
    const isAgents = /[\\/]\.agents?([\\/]|$)/i.test(normTarget);
    const isGemini = /[\\/]\.gemini([\\/]|$)/i.test(normTarget);
    const isRootDoc = /[\\/][^\\/]+\.(md|markdown|txt|json|ya?ml|env.*)$/i.test(normTarget) &&
      !/[\\/](src|lib|components|app|test|pages|server|routes)[\\/]/i.test(normTarget);

    if (isCoord || isAgents || isGemini || isRootDoc) {
      esci("allow", "");
    }

    // Se è un file sorgente applicativo, controlla se è attivo un marker di emergenza autorizzato dal Direttore
    const radici = (p.workspacePaths ?? []).map((x) => normalize(resolve(x)));
    let overridePresente = false;
    for (const r of radici) {
      if (existsSync(resolve(r, ".coord", "AGY_DIRECT_EDIT")) ||
          existsSync(resolve(r, ".coord", "EMERGENCY_OVERRIDE"))) {
        overridePresente = true;
        break;
      }
    }

    if (overridePresente) {
      esci("allow", "");
    }

    let pathMostrato = normTarget;
    for (const r of radici) {
      if (normLower.startsWith(r.toLowerCase())) {
        pathMostrato = relative(r, normTarget) || normTarget;
        break;
      }
    }

    esci("force_ask", `ATTENZIONE PROTOCOLLO MULTI-AGENTE: Antigravity sta modificando direttamente il file sorgente (${pathMostrato}) invece di delegare il task a Claude Code o Codex CLI. Conferma SOLO se hai esplicitamente autorizzato l'intervento diretto di AGY per blocchi temporanei o quote esaurite di Claude o Codex.`);
  }
  esci("allow", "");
}

if (nome !== "run_command") esci("allow", "");

const cmd = String(p?.toolCall?.args?.CommandLine ?? "");

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
