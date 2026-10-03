/**
 * Claude Mod per Vibe Multiagent (compatibile con Claude Code v2.1.287+)
 * 
 * Fornisce presidi meccanici in-process:
 * 1. Gate Guardrail: blocca comandi di pubblicazione, deploy e bypass permessi non autorizzati dal Direttore.
 * 2. Auto-Checkpoint: registra automaticamente le modifiche ai file nel "Punto di ripresa" del task IN CORSO.
 * 3. Terminal Status Band: renderizza una riga di stato con sprint e task attivo sopra il prompt CLI.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, normalize, join } from "node:path";

// Regole dei comandi vietati (analogo a agy-gate.mjs)
export const COMANDI_VIETATI = [
  [/\bgit(\.exe)?\b.*\bpush\b/i, "git push è una pubblicazione: la autorizza il Direttore"],
  [/\b(npm|pnpm|yarn|bun)(\.cmd|\.exe|\.ps1|\.bat)?\s+(publish|deploy)\b/i, "pubblicazione di pacchetto"],
  [/\b(vercel|netlify|flyctl|fly|heroku|gcloud|aws|az)(\.cmd|\.exe|\.ps1|\.bat)?\b.*\b(deploy|publish|up)\b/i, "deploy verso un servizio esterno"],
  [/\b(prisma|knex|alembic|rails)(\.cmd|\.exe|\.ps1|\.bat)?\b.*\bmigrat/i, "migrazione di schema"],
  [/\b(npm|pnpm|yarn|bun)(\.cmd|\.exe|\.ps1|\.bat)?\b.*(-g\b|--global\b|\bglobal\s+add\b)/i, "installazione globale, fuori dal repository"],
  [/\b(curl|iwr|irm|wget)(\.exe)?\b[^|;]*\|\s*(ba)?sh\b/i, "scaricare ed eseguire uno script in un colpo solo"],
  [/\b(curl|iwr|irm|wget)(\.exe)?\b[^|;]*\|\s*(powershell|pwsh|iex)\b/i, "scaricare ed eseguire uno script in un colpo solo"],
  [/--dangerously-skip-permissions/i, "disattiva i permessi per conto del Direttore"],
  [/--dangerously-bypass-approvals/i, "disattiva le approvazioni per conto del Direttore"],
];

/**
 * Valuta un comando Bash per verificare se viola i guardrail del cantiere.
 * @param {string} cmd - Comando da verificare
 * @param {string} [cwd] - Directory di lavoro corrente
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function valutaComando(cmd, cwd = process.cwd()) {
  if (!cmd || typeof cmd !== "string") return { allowed: true };

  // Verifica override del Direttore
  const overrideFile = resolve(cwd, ".coord", "EMERGENCY_OVERRIDE");
  const directEditFile = resolve(cwd, ".coord", "DIRECTOR_OVERRIDE");
  if (process.env.DIRECTOR_OVERRIDE === "1" || existsSync(overrideFile) || existsSync(directEditFile)) {
    return { allowed: true };
  }

  for (const [re, motivo] of COMANDI_VIETATI) {
    if (re.test(cmd)) {
      return {
        allowed: false,
        reason: `Vietato dal protocollo Vibe Multiagent: ${motivo}. Riservato al Direttore umano.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Registra un checkpoint automatico nel task IN CORSO.
 * @param {string} filePath - File modificato
 * @param {string} [cwd] - Cartella di lavoro
 */
export function registraCheckpoint(filePath, cwd = process.cwd()) {
  try {
    const dirTasks = resolve(cwd, ".coord", "tasks");
    if (!existsSync(dirTasks)) return false;

    let targetTaskFile = null;

    // Controllo task prioritario da env
    const taskAttivoEnv = process.env.TASK_ATTIVO?.replace(/[^a-zA-Z0-9_-]/g, "");
    if (taskAttivoEnv) {
      const p = join(dirTasks, `${taskAttivoEnv}.md`);
      if (existsSync(p)) targetTaskFile = p;
    }

    // Scansione task IN CORSO
    if (!targetTaskFile) {
      const files = readdirSync(dirTasks).filter((f) => f.endsWith(".md"));
      for (const f of files) {
        const fullPath = join(dirTasks, f);
        const content = readFileSync(fullPath, "utf8");
        if (/^Stato:\s*IN CORSO\s*$/m.test(content)) {
          targetTaskFile = fullPath;
          break;
        }
      }
    }

    if (!targetTaskFile) return false;

    let content = readFileSync(targetTaskFile, "utf8");
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const cleanPath = String(filePath).replace(/\\/g, "/");
    const nuovaRiga = `- Fatti: ${timestamp} - modificato: ${cleanPath}\n`;

    const puntoRipresaRegex = /(## Punto di ripresa\s*\n)([\s\S]*?)(?=\n## |\n*$)/i;
    if (puntoRipresaRegex.test(content)) {
      content = content.replace(puntoRipresaRegex, (match, header, body) => {
        return `${header}${nuovaRiga}${body}`;
      });
      writeFileSync(targetTaskFile, content, "utf8");
      return true;
    }
  } catch {
    // I checkpoint falliscono pacificamente senza interrompere l'agente
  }
  return false;
}

/**
 * Estrae lo stato attuale per la barra terminale
 * @param {string} [cwd]
 * @returns {string|null}
 */
export function formattaStatoTerminale(cwd = process.cwd()) {
  try {
    const dirCoord = resolve(cwd, ".coord");
    if (!existsSync(dirCoord)) return null;

    let sprintNum = "1";
    const sprintFile = join(dirCoord, "CURRENT_SPRINT.md");
    if (existsSync(sprintFile)) {
      const m = readFileSync(sprintFile, "utf8").match(/Sprint\s+(\d+)/i);
      if (m) sprintNum = m[1];
    }

    let taskId = "In attesa";
    const dirTasks = join(dirCoord, "tasks");
    if (existsSync(dirTasks)) {
      const files = readdirSync(dirTasks).filter((f) => f.endsWith(".md"));
      for (const f of files) {
        const full = join(dirTasks, f);
        const c = readFileSync(full, "utf8");
        if (/^Stato:\s*IN CORSO\s*$/m.test(c)) {
          const matchId = c.match(/ID:\s*([A-Za-z0-9_-]+)/i);
          taskId = matchId ? matchId[1] : f.replace(/\.md$/, "");
          break;
        }
      }
    }

    return `[VIBE] Sprint ${sprintNum} | Task: ${taskId} | Control Room: .coord/dashboard.html`;
  } catch {
    return null;
  }
}

/**
 * Funzione di registrazione principale per l'API Claude Mods (v2.1.287+)
 * @param {Function} on - Registro degli eventi fornito da Claude Code
 */
export function register(on) {
  // 1. Hook su tool.call: Gate su comandi bash & Checkpoint su modifiche file
  on("tool.call", async ($, e, next) => {
    const toolName = e?.tool ?? e?.name ?? "";

    // Intercettazione comandi Bash
    if (toolName === "Bash" || toolName === "bash") {
      const cmd = e?.command ?? e?.input?.command ?? "";
      const val = valutaComando(cmd);
      if (!val.allowed) {
        return {
          deny: val.reason,
          block: true,
          reason: val.reason,
        };
      }
    }

    // Intercettazione modifiche file per auto-checkpoint
    if (toolName === "Edit" || toolName === "Write" || toolName === "FileEdit") {
      const target = e?.path ?? e?.file_path ?? e?.input?.path ?? e?.input?.file_path ?? "";
      if (target) {
        registraCheckpoint(target);
      }
    }

    return next(e);
  });

  // 2. Hook su ui.render: Visualizzazione status bar nel terminale
  on("ui.render", async ($, e, next) => {
    const statusText = formattaStatoTerminale();
    if (statusText && $?.ui?.banner) {
      $?.ui?.banner(statusText);
    }
    return next(e);
  });
}
