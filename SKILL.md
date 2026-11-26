---
name: vibe-multiagent
description: >-
  Usa questa skill per avviare, configurare o gestire ed eseguire sessioni di sviluppo in un progetto multi-agente v3.0 (con Claude Code, Codex e Antigravity). Guida l'orchestratore nel dispatching dei task tramite il runner multi-provider con profili di permesso espliciti (read-only / workspace-write), resume nativo cross-provider e preflight CLI, impedisce il self-coding non autorizzato di Antigravity, presidia i contratti formali di governance (TASK v2, HANDOVER v2 con schema JSON e validatore deterministico, FINDINGS.md), applica il Circuit Breaker a 4 livelli, la Mailbox FIPA-lite per concorrenza single-writer, coordina ruoli, log in streaming (.coord/logs/), Control Room visiva con Memory Graph SVG offline (.coord/dashboard.html, anche come MCP App), handover e verifiche di integrazione. Trigger tipici: "multi-agente", "vibe-multiagent", "coordina", "dispaccia", "task", "handover", "nuovo progetto", "setup multi-agente", "sviluppo con claude e codex", "control room".
---

# Vibe Multiagent v3.0 — Framework & Setup Progetto Multi-Agente

Leggi integralmente [setup_skill.md](setup_skill.md), poi segui il protocollo nell'ordine in cui è scritto: scelta dell'ambiente, intervista, verifica della disponibilità degli agenti (preflight), proposta, approvazione esplicita, generazione dei file.

Questa skill è universale: genera configurazioni nel progetto scelto, ma non contiene decisioni specifiche di alcun progetto. Include la Control Room visiva interattiva (`dashboard.html`) con Memory Graph relazionale SVG offline, monitoraggio Circuit Breaker e pannello Sessioni Resume & Worktree; la stessa Control Room è esposta anche come **MCP App** (`mcp.json` → `tools/mcp-control-room.mjs`, risorsa `ui://vibe-multiagent/control-room.html`, tool `open_control_room` e `get_fleet_state`). Completano il kit la telemetria di flotta in tempo reale, il runner multi-provider (`runner.mjs`) con Circuit Breaker a 4 livelli, isolamento worktree, profili `--profile read-only|workspace-write` e resume nativo (`--resume` + `.coord/state/sessions.json`), il preflight CLI (`tools/preflight.mjs`), la messaggistica asincrona FIPA-lite single-writer (`tools/mail-router.mjs`), i contratti formali di governance (TASK v2 con 4 livelli di verifica e HANDOVER v2 con schema JSON machine-readable `tools/validate-handover.mjs`), il registro immutabile del debito tecnico e blocker (`FINDINGS.md`), gli script operativi (`scripts/`), i presidi meccanici di sicurezza (hook AGY 2.0 e Claude Mod v3) e una suite di test a 12 moduli deterministici 100% offline.

## Regole v3.0 da applicare sempre

- **Permessi**: nessun `--dangerously-*` nei dispatch ordinari. Si usano i profili `read-only` / `workspace-write` / `host-tools` del runner: per Claude il runner applica in merge l'allowlist scoped + `deny` guardrails in `.claude/settings.local.json`; per Codex, `host-tools` (quando subentra su task con eseguibili Windows/browser/rete come `msedge.exe`, Playwright, `nlm`) usa `--sandbox danger-full-access` protetto dal guardrail `PreToolUse` `tools/codex-gate.mjs` (`.codex/hooks.json`) e dal monitor streaming attivo del runner. Il bypass (`--director-override`) è ammesso solo con un `DIRECTOR_OVERRIDE` firmato dal Direttore in `.coord/DECISIONS.md`.
- **Comandi nativi generati dal runner**: `claude -p --output-format stream-json --verbose --permission-mode <plan|acceptEdits>`; `codex exec --json --sandbox <profile> -` (prompt via stdin, indispensabile su Windows; `-C <repo>` e `--skip-git-repo-check` solo fuori da un repository Git); `agy -p --output-format stream-json`.
- **Resume nativo cross-provider**: `--resume` riprende la sessione registrata in `.coord/state/sessions.json` solo se provider, cwd e profilo coincidono.
- **Preflight**: `node tools/preflight.mjs [--json]` prima del primo dispatch (Claude Code `2.1.318+`, Codex `0.171.0+`, AGY `1.5.16+`).
- **Presidi**: Claude Mod v3 intercetta `Bash`, `PowerShell` e `PreSkillShellCommand`, registra il checkpoint dopo l'esecuzione riuscita, gestisce `PreCompact` e `WorktreeCreate` / `WorktreeRemove` (`.coord/state/worktrees.json`). `agy-gate.mjs` copre anche `write_file` / `edit_file` di Antigravity 2.0.
- **Modelli**: Gemini 4 (`Neon`, `Hydrogen`, `Carbon` e `Orchestrator`) solo con i nomi esatti restituiti da `agy models`; Codex `gpt-6.2-sol` con `--model` esplicito; Claude Code `2.1.318+`.
- **`.agents/` è la convenzione canonica** (hook, regole e skill di Antigravity, e discovery globale cross-tool in `~/.agents/skills/`). Un `.agent/` al singolare va segnalato e non usato.

`setup_skill.md` include anche i casi in cui questa skill **non** va usata: leggili prima di iniziare l'intervista.

I template sono nella sottocartella `templates/` di questa skill. Gli strumenti meccanici (hook per Antigravity, runner, preflight, mailbox, validatori, telemetria e server MCP della Control Room) sono nella sottocartella `tools/`.
