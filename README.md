# Vibe Multiagent 🤖⚡

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude Code Skill](https://img.shields.io/badge/Claude_Code-skill-d97757?logo=anthropic)](https://docs.anthropic.com/en/docs/claude-code)
[![Antigravity Skill](https://img.shields.io/badge/Antigravity-skill-4285F4?logo=google)](https://github.com/google)
[![Claude CLI](https://img.shields.io/badge/Claude_CLI-%E2%89%A5_2.0-d97757)](https://docs.anthropic.com/en/docs/claude-code)
[![Codex CLI](https://img.shields.io/badge/Codex_CLI-%E2%89%A5_0.130-10a37f?logo=openai)](https://github.com/openai/codex)
[![Antigravity CLI](https://img.shields.io/badge/Antigravity_CLI-%E2%89%A5_1.1-4285F4?logo=google)](https://github.com/google)
[![VS Code IDE](https://img.shields.io/badge/VS_Code-IDE-007ACC?logo=visualstudiocode)](https://code.visualstudio.com/)
[![Antigravity IDE](https://img.shields.io/badge/Antigravity-IDE-4285F4?logo=google)](https://github.com/google)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5_20.11-339933?logo=nodedotjs)](https://nodejs.org)

> **Framework e Skill per l'avvio, coordinamento e orchestrazione di progetti di sviluppo multi-agente con Claude Code, Antigravity (AGY) e Codex CLI.**

`vibe_multiagent` è una skill universale per lo sviluppo software assistito da AI, progettata per orchestrare team di agenti di codifica locali in abbonamento (senza costi API a consumo per token). Fornisce una rigida separazione dei ruoli, presidi meccanici di sicurezza (hook) e una completa tracciabilità su disco tramite filesystem e Git.

---

## 🎯 Obiettivi Chiave

1. **Multi-Ambiente Flessibile**: Supporto nativo per lavorare dentro **VS Code**, dentro **Antigravity IDE** o da **terminali indipendenti**.
2. **Tre Quote Indipendenti**: Separazione delle risorse tra Anthropic (Claude), Google (AGY/Antigravity) e OpenAI (Codex) per non bloccare lo sviluppo in caso di esaurimento di un singolo fornitore.
3. **Garanzia di Integrazione Intoccabile**: Solo l'**Orchestratore dell'ambiente selezionato** (Claude Code in Ambiente A/C, Antigravity in Ambiente B) valida e porta i task allo stato `INTEGRATO` dopo aver rieseguito personalmente i test e le verifiche.
4. **Presidi Meccanici su Antigravity**: Hook automatici per bloccare comandi distruttivi (`git push`, deploy, migrazioni), checkpoint automatici su disco ad ogni modifica e semaforo di quota preventivo.
5. **Lezioni di Produzione Integrate**: Risoluzione automatica di problemi tipici su Windows (PATH stantio delle CLI, normalizzazione CRLF/LF, conflitti di working tree condivisi).

---

## 🏗️ I Tre Ambienti di Sviluppo

Durante la fase di setup iniziale, scegli l'ambiente operativo del progetto:

| # | Ambiente | Sede Operativa | Orchestratore & Integratore | Agenti Collaborativi | Caratteristiche & Presidi |
|---|---|---|---|---|---|
| **A** | **VS Code + Claude Extension** | VS Code | **Claude Code** *(Capocantiere & Integratore)* | Codex CLI, AGY CLI | Ideale se il flusso primario vive nell'estensione Claude di VS Code. |
| **B** | **Antigravity IDE** | Antigravity IDE | **AGY** *(Dispatcher & Integratore)* | Claude CLI, Codex CLI | AGY lancia gli esecutori in background, verifica e integra; presidi attivi via `.agents/hooks.json`. |
| **C** | **Terminali Separati** | Shell indipendenti | **Claude Code** *(Capocantiere & Integratore)* | Codex CLI, AGY CLI | Massimo isolamento visivo, coordinamento rigorosamente asincrono via file. |

---

## 🚀 Come Avviare il Setup

Puoi avviare la procedura di setup in qualsiasi nuovo progetto o repository esistente:

### Su Claude Code
Digita nel terminale o nella chat dell'estensione:
```text
avvia progetto con vibe_multiagent
```
*(o trigger equivalenti: "nuovo progetto multi-agente", "setup multiagente", "configura repo multi-agente")*

### Su Antigravity IDE (AGY)
Nella chat agentica di Antigravity, digita:
```text
avvia setup progetto con vibe_multiagent
```

L'agente leggerà il protocollo `setup_skill.md` e avvierà immediatamente l'intervista guidata.

---

## 🗣️ Guida Completa all'Intervista di Setup

L'intervista è il cuore della configurazione: raccoglie le decisioni architetturali, stabilisce i confini di sicurezza e mappa i ruoli e le limitazioni di ogni agente prima di creare qualsiasi file.

### Formato delle Domande
- **Domande a dominio chiuso (0, 0-bis, 2, 4, 9)**: Vengono poste con opzioni interattive a scelta multipla / singola (`AskUserQuestion` / `ask_question`).
- **Domande aperte (1, 3, 5, 6, 7, 8, 10)**: Vengono poste a testo libero, una per messaggio, per approfondire le specifiche.

---

### Le 12 Domande dell'Intervista

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             LE 12 DOMANDE DI SETUP                                │
├──────┬──────────────────────┬────────────────────────────────────────────────────┤
│  0   │ Cartella e Git       │ Dove risiede il progetto e se è già inizializzato   │
│0-bis │ Ambiente di Lavoro   │ Scelta tra Ambiente A, Ambiente B o Ambiente C     │
│  1   │ Problema e Valore    │ Problema da risolvere e criterio di successo V1    │
│  2   │ Utenti e Piattaforme │ Target (web, desktop, mobile, CLI) ed esperienza UX│
│  3   │ Dati e Privacy       │ Dati personali/sensibili, confini e GDPR           │
│  4   │ Stack Tecnologico    │ Linguaggi, framework, database, librerie ammesse   │
│  5   │ Entità e Flussi      │ Da 3 a 5 entità cardine e relazioni principali     │
│  6   │ Integrazioni         │ API terze, device, servizi inclusi ed esclusi      │
│  7   │ Architettura e Test  │ Pattern architetturali e strategia di test         │
│  8   │ Rilascio e CI/CD     │ Branching, hosting, deploy e autorizzazioni utente │
│  9   │ Agenti & Fornitori   │ CLI disponibili, quote, fornitore e sostituzioni   │
│  10  │ Prima Milestone      │ Primo sprint, task iniziali e decisioni riservate  │
└──────┴──────────────────────┴────────────────────────────────────────────────────┘
```

#### Dettaglio delle Domande:

1. **Domanda 0 — Cartella & Git**: Identifica il percorso assoluto del progetto e il nome della cartella di coordinamento (default `.coord/`). Se Git non è presente, chiede se inizializzarlo.
2. **Domanda 0-bis — Sede & Orchestrazione**:
   - `Ambiente A`: VS Code con Claude Code capocantiere e integratore.
   - `Ambiente B`: Antigravity IDE con AGY dispatcher e integratore (con presidi hook).
   - `Ambiente C`: Terminali separati con Claude Code capocantiere e integratore.
3. **Domanda 1 — Scopo & Valore**: Qual è il problema da risolvere, per chi, e quale risultato osservabile definisce il successo della prima versione?
4. **Domanda 2 — Utenti & Piattaforme**: Piattaforme target (web, desktop Electron, mobile, CLI) ed esperienza utente prioritaria.
5. **Domanda 3 — Dati & Confini di Privacy**: Presenza di dati sensibili/personali, conservazione locale vs cloud, e vincoli inderogabili di privacy.
6. **Domanda 4 — Stack & Vincoli Tecnologici**: Tecnologie obbligatorie, preferite o vietate (runtime, DB, librerie) e budget di costo.
7. **Domanda 5 — Entità & Flussi**: Le 3-5 entità cardine dell'applicazione e come i dati fluiscono tra esse.
8. **Domanda 6 — Integrazioni**: Quali servizi esterni o file entrano nella prima versione e quali restano esplicitamente fuori.
9. **Domanda 7 — Architettura & Strategia di Test**: Stile architetturale, livello di disaccoppiamento, harness di test e verifiche minime necessarie prima del rilascio.
10. **Domanda 8 — Ciclo di Sviluppo & Deploy**: Politica di branch, pipeline CI/CD, ambienti di staging/produzione e permessi di deploy riservati all'utente.
11. **Domanda 9 — Agenti, Fornitori e Politica di Quota**:
    - Quali CLI sono autenticate (`claude`, `agy`, `codex`).
    - **Fornitore vs Modello**: Valutazione dei confini dati (es. Sonnet eseguito dentro Antigravity passa dall'infrastruttura Google, non Anthropic).
    - Politica di esaurimento: chi subentra a chi, e quale lavoro invece **non** va sostituito ma aspetta il reset.
12. **Domanda 10 — Prima Milestone & Confini Riservati**: Definizione dello Sprint 1, dei task iniziali e delle decisioni che devono rimanere sempre in capo all'utente umano (Direttore).

---

## 🔍 Preflight Tecnico del Sistema

Prima di confermare l'intervista, la skill esegue verifiche diagnostiche sull'ambiente locale:

```text
[Preflight Check]
├── 1. Risoluzione eseguibili CLI (path fisso vs PATH d'ambiente)
├── 2. Rilevamento sessioni terminali contaminate (ELECTRON_RUN_AS_NODE)
├── 3. Verifica configurazione .gitattributes (normalizzazione LF su Windows)
└── 4. (Ambiente B) Verifica integrità hook globali e cartelle .agents/
```

- **Risoluzione PATH Stantio**: Su Windows, se una CLI è stata installata di recente ma non compare nella sessione aperta, la skill verifica i percorsi noti (`%LOCALAPPDATA%\agy\bin`, `%USERPROFILE%\.claude\...`, npm global) evitando falsi allarmi di assenza.
- **Normalizzazione EOL**: Verifica che `.gitattributes` contenga `* text=auto eol=lf` per evitare fallimenti di test dovuti a conversioni CRLF involontarie.

---

## 📝 Proposta, Approvazione e Generazione File

Al termine dell'intervista, l'agente presenta un **documento di sintesi** contenente:
- Ambiente operativo scelto (A, B o C) e ruoli degli agenti.
- Perimetro consentito e vietato per ciascun ruolo.
- Sintesi architetturale e vincoli non negoziabili.
- Elenco dei file che verranno generati.

> **Regola Aurea**: Nessun file viene scritto su disco finché l'utente non fornisce **approvazione esplicita** ("Sì" o modifiche).

### File Generati nel Progetto:
```text
mio-progetto/
├── AGENTS.md                 # Protocollo operativo e vincoli non negoziabili
├── .agents/
│   └── hooks.json           # (Solo Ambiente B) Hook per gate, checkpoint e quota
└── .coord/                   # Cartella di coordinamento (configurabile)
    ├── PROJECT.md            # Fonte unica del contesto di business e architettura
    ├── CURRENT_SPRINT.md     # Milestone attiva, criteri di completamento e rischi
    ├── DECISIONS.md          # Registro decisionale progressivo (D-001, D-002, ...)
    ├── DISPATCH.md           # (Solo Ambiente B) Manuale per il dispatcher AGY
    ├── agents/
    │   ├── verifica-tecnica/agent.md   # Ruolo Codex (se abilitato)
    │   └── verifica-ui/agent.md        # Ruolo AGY (se abilitato)
    ├── tasks/
    │   └── T-001.md          # Specifica del primo task con proprietario e punto di ripresa
    └── handover/             # Cartella di consegna report di fine task
```

---

## 🛡️ Presidi Meccanici (Ambiente B — Antigravity Hooks)

Quando si sviluppa in Antigravity IDE, i divieti e le regole non sono affidati alla "memoria" del modello, ma presidiati da script Node.js eseguiti negli eventi del ciclo di vita:

- **`agy-gate.mjs` (`PreToolUse`)**: Intercetta ed esegue un `deny` immediato per comandi di pubblicazione (`git push`, `npm publish`), deploy cloud (Vercel, AWS, GCP), migrazioni database e flag che bypassano i permessi (`--dangerously-skip-permissions`). Chiede conferma (`ask`) per cancellazioni fuori dal workspace.
- **`agy-checkpoint.mjs` (`PostToolUse`)**: Ad ogni scrittura o modifica di file, scrive automaticamente la riga `- Fatti: <data> — modificati: <file> — ultimo commit: <hash>` nel `Punto di ripresa` del task `IN CORSO`.
- **`quota-anthropic.mjs` & `agy-quota-banner.mjs` (`PreInvocation`)**: Interroga periodicamente l'utilizzo residuo della quota Anthropic e inietta istruzioni al dispatcher sopra il 70%, 85% e 95% (sotto soglia non consuma token).

---

## 🔄 Ciclo di Vita del Task e Gestione Quote

```text
       ┌──────────┐
       │  PRONTO  │
       └────┬─────┘
            │  (Assegna proprietario + compila Punto di Ripresa)
            ▼
       ┌──────────┐      (Errore / Quota esaurita)      ┌──────────┐
       │ IN CORSO ├────────────────────────────────────►│ SOSPESO  │
       └────┬─────┘                                     └────┬─────┘
            │                                                │ (Sostituzione o reset)
            │ (Lavoro ultimato + Handover scritto)           │
            ▼                                                │
        ┌────────────┐                                        │
       │ CONSEGNATO │◄───────────────────────────────────────┘
       └────┬───────┘
            │  (SOLO l'Orchestratore dell'ambiente riesegue verifiche e test)
            ▼
       ┌───────────┐
       │ INTEGRATO │
       └───────────┘
```

### Gestione dell'Esaurimento Quota
Nei file task (`TASK.md`), il costo di sostituzione è suddiviso in due dimensioni distinte:
1. **Costo — Capacità**: Quanto si perde in velocità/qualità delegando a un modello secondario.
2. **Costo — Garanzia**: Quale promessa metodologica decade (es. indipendenza tra chi scrive il codice e chi scrive i test). Se la perdita di garanzia non è accettabile, il task impone:
   ```text
   Agente di ripiego: nessuna sostituzione, attendere il reset
   ```

---

## 🔒 Privacy, Sicurezza e Note Legali

### 1. Modello di Sicurezza e Privacy dei Dati
- **Nessuna Telemetria Nascosta**: `vibe_multiagent` non invia alcun dato a server proprietari, cloud terzi o backend di tracciamento. Tutto viene elaborato e salvato **esclusivamente sul filesystem locale**.
- **Nessun Segreto nel Repository**: Il codice e i template non contengono credenziali, password, chiavi API o dati personali. L'accesso alle quote avviene leggendo i token di autenticazione già presenti sul profilo utente locale (`.credentials.json`), senza mai stamparli né trasmetterli.
- **Confini Dati Fornitore**: La Domanda 9 dell'intervista distingue esplicitamente tra *modello* e *fornitore*, assicurando che dati aziendali riservati non vengano instradati su canali cloud non approvati.

### 2. Disclaimer sui Marchi Registrati (Trademarks)
- **Anthropic®**, **Claude®** e **Claude Code®** sono marchi registrati di Anthropic PBC.
- **OpenAI®**, **ChatGPT®** e **Codex®** sono marchi registrati di OpenAI, Inc.
- **Google®** e **Antigravity®** sono marchi registrati di Google LLC.
- **Microsoft®**, **Windows®** e **Visual Studio Code / VS Code®** sono marchi registrati di Microsoft Corporation.

*`vibe_multiagent` è un progetto open-source indipendente sviluppato dalla community e non è affiliato, approvato, sponsorizzato o supportato ufficialmente da Anthropic, Google, OpenAI o Microsoft.*

### 3. Limitazione di Responsabilità
Il software viene fornito "così com'è" (*AS IS*), senza garanzie di alcun tipo, espresse o implicite. L'utente finale mantiene il pieno controllo e la responsabilità delle azioni, dei comandi shell eseguiti dalle CLI orchestrate e delle modifiche apportate ai propri repository.

---

## 🧪 Esecuzione dei Test Unitari dei Tool

Per verificare la suite di strumenti:
```bash
# Dalla cartella principale della skill (o da tools/):
cd tools
node test/agy-gate.test.mjs
node test/agy-checkpoint.test.mjs
node test/quota-anthropic.test.mjs
node test/agy-quota-banner.test.mjs
```

---

## 📂 Struttura del Repository

```text
vibe_multiagent/
├── .gitignore
├── LICENSE                       # Licenza MIT (Alessandro Carducci)
├── README.md                     # Presentazione, guida completa e note legali
├── SKILL.md                      # Entry point principale per Claude Code
├── setup_skill.md                # Protocollo completo di intervista e setup
├── templates/                    # Template per i file di progetto
│   ├── AGENTS.md.template
│   ├── AGENT_ROLE.md.template
│   ├── CURRENT_SPRINT.md.template
│   ├── DECISIONS.md.template
│   ├── DISPATCH.md.template      # Guida operativa Dispatcher AGY (Ambiente B)
│   ├── HANDOVER.md.template
│   ├── hooks.json.template       # Configurazione hook Antigravity (Ambiente B)
│   ├── PROJECT.md.template
│   └── TASK.md.template
└── tools/                        # Script per hook Antigravity & monitoraggio
    ├── agy-gate.mjs
    ├── agy-checkpoint.mjs
    ├── agy-quota-banner.mjs
    ├── quota-anthropic.mjs
    └── test/                     # Suite di test automatizzati per i tool
```

---

## 📄 Licenza

Distribuito sotto licenza **MIT** © 2026 Alessandro Carducci. Consulta il file [LICENSE](LICENSE) per maggiori dettagli.
