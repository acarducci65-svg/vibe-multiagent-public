---
name: vibe-multiagent
description: >-
  Usa questa skill per avviare, configurare o gestire ed eseguire sessioni di sviluppo in un progetto multi-agente v2.1 (con Claude Code, Codex e Antigravity). Guida l'orchestratore nel dispatching dei task, impedisce il self-coding non autorizzato di Antigravity, presidia i contratti formali di governance (TASK v2, HANDOVER v2 con schema JSON e validatore deterministico, FINDINGS.md), applica il Circuit Breaker a 4 livelli, la Mailbox FIPA-lite per concorrenza single-writer, coordina ruoli, log in streaming (.coord/logs/), Control Room visiva con Memory Graph SVG offline (.coord/dashboard.html), handover e verifiche di integrazione. Trigger tipici: "multi-agente", "vibe-multiagent", "coordina", "dispaccia", "task", "handover", "nuovo progetto", "setup multi-agente", "sviluppo con claude e codex".
---

# Vibe Multiagent v2.1 — Framework & Setup Progetto Multi-Agente

Leggi integralmente [setup_skill.md](setup_skill.md), poi segui il protocollo nell'ordine in cui è scritto: scelta dell'ambiente, intervista, verifica della disponibilità degli agenti, proposta, approvazione esplicita, generazione dei file.

Questa skill è universale: genera configurazioni nel progetto scelto, ma non contiene decisioni specifiche di alcun progetto. Include la Control Room visiva interattiva (`dashboard.html`) con Memory Graph relazionale SVG offline e monitoraggio Circuit Breaker, telemetria di flotta in tempo reale, runner con Circuit Breaker a 4 livelli e isolamento worktree (`runner.mjs`), sistema di messaggistica asincrona FIPA-lite single-writer (`tools/mail-router.mjs`), contratti formali di governance (TASK v2 con 4 livelli di verifica e HANDOVER v2 con schema JSON machine-readable `tools/validate-handover.mjs`), registro immutabile del debito tecnico e blocker (`FINDINGS.md`), script operativi (`scripts/`), presidi meccanici di sicurezza (hook) e una suite di test a 10 moduli deterministici 100% offline.

`setup_skill.md` include anche i casi in cui questa skill **non** va usata: leggili prima di iniziare l'intervista.

I template sono nella sottocartella `templates/` di questa skill. Gli strumenti meccanici (hook per Antigravity, runner, mailbox, validatori e telemetria) sono nella sottocartella `tools/`.
