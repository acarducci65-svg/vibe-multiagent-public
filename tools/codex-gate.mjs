#!/usr/bin/env node
// Hook PreToolUse per OpenAI Codex CLI (v0.117+ / v0.171+): guardrail meccanico
// equivalente a agy-gate.mjs e claude-mod/hooks/register.js.
// Consente l'uso sicuro di `--profile host-tools` (`--sandbox danger-full-access`)
// su Windows per eseguibili complessi (msedge.exe, Playwright, nlm, rete),
// bloccando preventivamente (exit 2) comandi di pubblicazione, deploy, migrazioni
// o bypass permessi non autorizzati dal Direttore.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

export const COMANDI_VIETATI = [
  [/\bgit(\.exe)?\b.*\bpush\b/i, "git push è una pubblicazione: la autorizza il Direttore"],
  [/\b(npm|pnpm|yarn|bun)(\.cmd|\.exe|\.ps1|\.bat)?\s+(publish|deploy)\b/i, "pubblicazione di pacchetto"],
  [/\b(vercel|netlify|flyctl|fly|heroku|gcloud|aws|az)(\.cmd|\.exe|\.ps1|\.bat)?\b.*\b(deploy|publish|up)\b/i, "deploy verso un servizio esterno"],
  [/\b(prisma|knex|alembic|rails)(\.cmd|\.exe|\.ps1|\.bat)?\b.*\bmigrat/i, "migrazione di schema"],
  [/\b(npm|pnpm|yarn|bun)(\.cmd|\.exe|\.ps1|\.bat)?\b.*(-g\b|--global\b|\bglobal\s+add\b)/i, "installazione globale, fuori dal repository"],
  [/\b(curl|iwr|irm|wget)(\.exe)?\b[^|;]*\|\s*(ba)?sh\b/i, "scaricare ed eseguire uno script in un colpo solo"],
  [/\b(curl|iwr|irm|wget)(\.exe)?\b[^|;]*\|\s*(powershell|pwsh|iex)\b/i, "scaricare ed eseguire uno script in un colpo solo"],
  [/\b(ssh|scp)(\.exe)?\b/i, "accesso shell remoto non autorizzato"],
  [/\bdocker(-compose|\.exe)?\s+(compose\s+)?(down|rm)\b/i, "arresto o rimozione container di produzione"],
  [/\brclone(\.exe)?\s+delete\b/i, "cancellazione remota di backup su cloud"],
  [/\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\/(?:\s|$)/i, "rimozione distruttiva della root"],
  [/--dangerously-skip-permissions/i, "disattiva i permessi per conto del Direttore"],
  [/--dangerously-bypass-approvals/i, "disattiva le approvazioni per conto del Direttore"],
];

const LUNGHEZZA_MINIMA_TOKEN = 8;
const CONTESTO_FIRMA_OVERRIDE = "vibe-multiagent:director-override:v1";

function firmaOverride(token) {
  const hex = createHmac("sha256", String(token)).update(CONTESTO_FIRMA_OVERRIDE).digest("hex");
  return `AUTORIZZATO_DA_DIRETTORE:${hex}`;
}

function ugualeCostante(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function overrideFirmato(cwd = process.cwd()) {
  const token = process.env.DIRECTOR_TOKEN ?? "";
  if (token.length < LUNGHEZZA_MINIMA_TOKEN) return false;
  for (const nome of ["DIRECTOR_OVERRIDE", "EMERGENCY_OVERRIDE"]) {
    const p = resolve(cwd, ".coord", nome);
    if (!existsSync(p)) continue;
    try {
      const contenuto = readFileSync(p, "utf8").trim();
      if (ugualeCostante(contenuto, token) || ugualeCostante(contenuto, firmaOverride(token))) return true;
    } catch {}
  }
  return false;
}

export function estraiComandoDaPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  const cand = [
    payload.command,
    payload.cmd,
    payload.tool_input?.command,
    payload.tool_input?.cmd,
    payload.tool_input?.CommandLine,
    payload.input?.command,
    payload.input?.cmd,
    payload.toolCall?.args?.command,
    payload.toolCall?.args?.CommandLine,
  ];
  for (const c of cand) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return "";
}

export function valutaComandoCodex(cmd, cwd = process.cwd()) {
  if (!cmd || typeof cmd !== "string") return { allowed: true };
  if (process.env.DIRECTOR_OVERRIDE === "1" || overrideFirmato(cwd)) {
    return { allowed: true };
  }
  for (const [re, motivo] of COMANDI_VIETATI) {
    if (re.test(cmd)) {
      return {
        allowed: false,
        reason: `Vietato dal protocollo Vibe Multiagent (Codex Gate): ${motivo}. Riservato al Direttore umano.`,
      };
    }
  }
  return { allowed: true };
}

async function main() {
  let grezzo = "";
  for await (const chunk of process.stdin) grezzo += chunk;
  const trimmed = grezzo.trim();
  if (!trimmed) {
    process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
    process.exit(0);
  }
  let payload;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    const reason = "Guardrail Codex: payload JSON non valido (fail-closed).";
    process.stderr.write(reason + "\n");
    process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\n");
    process.exit(2);
  }

  const cwd = typeof payload?.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  const cmd = estraiComandoDaPayload(payload);
  const esito = valutaComandoCodex(cmd, cwd);
  if (!esito.allowed) {
    process.stderr.write(esito.reason + "\n");
    process.stdout.write(JSON.stringify({ decision: "block", reason: esito.reason }) + "\n");
    process.exit(2);
  }
  process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
  process.exit(0);
}

const isCli = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isCli) {
  main().catch((err) => {
    const reason = `Guardrail Codex: errore interno (${err?.message ?? err}). Blocco fail-closed.`;
    process.stderr.write(reason + "\n");
    process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\n");
    process.exit(2);
  });
}
