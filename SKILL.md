---
name: vibe_multiagent
description: Usa questa skill per avviare, configurare o gestire ed eseguire sessioni di sviluppo in un progetto multi-agente (con Claude Code, Codex e Antigravity). Guida l'orchestratore nel dispatching dei task, impedisce il self-coding non autorizzato di Antigravity, coordina ruoli, log in streaming (.coord/logs/), Control Room visiva (.coord/dashboard.html), handover e verifiche di integrazione. Trigger tipici: "multi-agente", "vibe-multiagent", "coordina", "dispaccia", "task", "handover", "nuovo progetto", "setup multi-agente", "sviluppo con claude e codex".
---

# Vibe Multiagent — Setup progetto multi-agente

Leggi integralmente [setup_skill.md](setup_skill.md), poi segui il protocollo nell'ordine in cui è scritto: scelta dell'ambiente, intervista, verifica della disponibilità degli agenti, proposta, approvazione esplicita, generazione dei file.

Questa skill è globale: genera configurazioni nel progetto scelto, ma non contiene decisioni specifiche di alcun progetto. Include la Control Room visiva interattiva (`dashboard.html`), telemetria di flotta in tempo reale e runner per lo streaming dei log (`runner.mjs`).

`setup_skill.md` include anche i casi in cui questa skill **non** va usata: leggili prima di iniziare l'intervista.

I template sono nella sottocartella `templates/` di questa skill. Gli strumenti meccanici (hook per Antigravity, runner e telemetria) sono nella sottocartella `tools/`.
