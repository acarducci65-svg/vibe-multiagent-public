---
name: vibe_multiagent
description: Usa questa skill quando l'utente vuole avviare, inizializzare o impostare da zero un progetto di sviluppo multi-agente scegliendo l'ambiente di lavoro (VS Code con Claude Extension, Antigravity IDE, o terminali separati). Determina orchestratore, agenti collaborativi, ruoli e limitazioni tramite intervista iniziale. Genera AGENTS.md, la cartella di coordinamento, PROJECT.md, CURRENT_SPRINT.md, DECISIONS.md e i task. Trigger tipici: "nuovo progetto", "setup multi-agente", "configura il repo", "ambiente di sviluppo", "coordinare più agenti".
---

# Vibe Multiagent — Setup progetto multi-agente

Leggi integralmente [setup_skill.md](setup_skill.md), poi segui il protocollo nell'ordine in cui è scritto: scelta dell'ambiente, intervista, verifica della disponibilità degli agenti, proposta, approvazione esplicita, generazione dei file.

Questa skill è globale: genera configurazioni nel progetto scelto, ma non contiene decisioni specifiche di alcun progetto.

`setup_skill.md` include anche i casi in cui questa skill **non** va usata: leggili prima di iniziare l'intervista.

I template sono nella sottocartella `templates/` di questa skill. Gli strumenti meccanici (hook per Antigravity) sono nella sottocartella `tools/`.
