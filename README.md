# Vibe Multiagent 🤖⚡

> **Framework e Skill per l'avvio, coordinamento e orchestrazione di progetti di sviluppo multi-agente con Claude Code, Antigravity (AGY) e Codex CLI.**

`vibe_multiagent` è una skill globale (compatibile sia con **Claude Code** che con **Antigravity IDE**) progettata per orchestrare team di agenti di codifica locali in abbonamento (senza API a pagamento per token), garantendo separazione delle responsabilità, presidi meccanici di sicurezza e tracciabilità rigorosa tramite filesystem e Git.

---

## 🎯 Obiettivi Chiave

1. **Multi-Ambiente Flessibile**: Supporto nativo per lavorare dentro **VS Code**, dentro **Antigravity IDE** o da **terminali indipendenti**.
2. **Tre Quote Indipendenti**: Separazione delle risorse tra Anthropic (Claude), Google (AGY/Antigravity) e OpenAI (Codex) per non bloccare lo sviluppo in caso di esaurimento di un singolo fornitore.
3. **Garanzia di Integrazione Intoccabile**: Solo **Claude Code** valida e porta i task allo stato `INTEGRATO` dopo aver rieseguito personalmente i test e le verifiche.
4. **Presidi Meccanici su Antigravity**: Hook automatici per bloccare comandi distruttivi (`git push`, deploy, migrazioni), checkpoint automatici su disco ad ogni modifica e semaforo di quota preventivo.
5. **Lezioni di Produzione Integrate**: Risoluzione automatica di problemi tipici su Windows (PATH stantio delle CLI, normalizzazione CRLF/LF, conflitti di working tree condivisi).

---

## 🏗️ I Tre Ambienti di Sviluppo

Durante l'intervista iniziale (Domanda `0-bis`), scegli l'ambiente operativo del progetto:

| # | Ambiente | Sede Operativa | Orchestratore | Agenti Collaborativi | Caratteristiche & Presidi |
|---|---|---|---|---|---|
| **A** | **VS Code + Claude Extension** | VS Code | **Claude Code** *(Capocantiere)* | Codex CLI, AGY CLI | Ideale se il flusso primario vive nell'estensione Claude di VS Code. |
| **B** | **Antigravity IDE** | Antigravity IDE | **AGY** *(Dispatcher)* | Claude CLI, Codex CLI | AGY lancia gli esecutori in background; presidi attivi via `.agents/hooks.json`. |
| **C** | **Terminali Separati** | Shell indipendenti | **Claude Code** *(Capocantiere)* | Codex CLI, AGY CLI | Massimo isolamento visivo, coordinamento rigorosamente asincrono via file. |

---

## 🛡️ Presidi Meccanici (Ambiente B — Antigravity Hooks)

Quando si sviluppa in Antigravity IDE, i divieti e le regole non sono affidati alla "memoria" del modello, ma presidiati da script Node.js eseguiti negli eventi del ciclo di vita:

- **`agy-gate.mjs` (`PreToolUse`)**: Intercetta ed esegue un `deny` immediato per comandi di pubblicazione (`git push`, `npm publish`), deploy cloud (Vercel, AWS, GCP), migrazioni database e flag che bypassano i permessi (`--dangerously-skip-permissions`). Chiede conferma (`ask`) per cancellazioni fuori dal workspace.
- **`agy-checkpoint.mjs` (`PostToolUse`)**: Ad ogni scrittura o modifica di file, scrive automaticamente la riga `- Fatti: <data> — modificati: <file> — ultimo commit: <hash>` nel `Punto di ripresa` del task `IN CORSO`.
- **`quota-anthropic.mjs` & `agy-quota-banner.mjs` (`PreInvocation`)**: Interroga periodicamente l'utilizzo residuo della quota Anthropic e inietta istruzioni al dispatcher sopra il 70%, 85% e 95% (sotto soglia non consuma token).

---

## 📋 Il Protocollo Operativo

### 1. Intervista Iniziale (12 domande)
Viene raccolta la specifica completa del progetto: cartella di lavoro, ambiente (A/B/C), obiettivi, vincoli privacy/dati, stack tecnologico, architettura, strategie di test e disponibilità degli abbonamenti/agenti.

### 2. Preflight e Verifica Disponibilità
- Verifica effettiva della presenza delle CLI (`claude`, `agy`, `codex`).
- **Rimedio PATH stantio**: rilevamento dell'eseguibile fisico se la sessione terminale ha ereditato un ambiente non aggiornato.
- Controllo configurazione `.gitattributes` per prevenire errori CRLF su Windows.

### 3. Generazione Struttura di Coordinamento
Nel repository del progetto target vengono generati:
```text
mio-progetto/
├── AGENTS.md                 # Protocollo operativo, ruoli e vincoli non negoziabili
├── .agents/
│   └── hooks.json           # (Solo Ambiente B) Hook attivi per il gate, checkpoint e quota
└── .coord/                   # Cartella di coordinamento del progetto
    ├── PROJECT.md            # Contesto operativo unico di business e architettura
    ├── CURRENT_SPRINT.md     # Obiettivo e stato della milestone corrente
    ├── DECISIONS.md          # Registro decisionale progressivo (D-001, D-002, ...)
    ├── DISPATCH.md           # (Solo Ambiente B) Istruzioni per il dispatcher AGY
    ├── agents/               # Ruolo, perimetro consentito e vietato per ciascun agente
    ├── tasks/                # Specifiche dei singoli task (T-001.md, T-002.md, ...)
    └── handover/             # Report di consegna firmati dall'agente uscente
```

### 4. Ciclo di Vita del Task
Ogni task attraversa rigorosamente questi stati:
```text
PRONTO ──► IN CORSO ──► CONSEGNATO ──► INTEGRATO
   │           ▲
   ▼           │
SOSPESO ───────┘ (in caso di esaurimento quota o blocco)
```
- **Punto di ripresa**: un task non può essere portato a `IN CORSO` senza compilare data, cosa si sta per fare e file toccati.
- **Doppio costo di sostituzione**: nei task, il costo di passaggio ad altro agente è scisso in:
  - *Costo Capacità*: perdita qualitativa (spesso trascurabile).
  - *Costo Garanzia*: perdita di indipendenza (es. test scritti dallo stesso che implementa). Se inaccettabile, il task attende il reset della quota (`nessuna sostituzione, attendere il reset`).

---

## 🚀 Installazione della Skill

### Per Claude Code
La skill è situata in:
```text
C:\Users\<utente>\.claude\skills\vibe_multiagent\
```
*Attivazione automatica su Claude Code al trigger di comandi come "avvia progetto multi-agente", "nuovo progetto", "setup vibe_multiagent".*

### Per Antigravity IDE (AGY)
L'entry point è situato in:
```text
C:\Users\<utente>\.gemini\config\skills\vibe_multiagent\
```
*Viene scoperta e caricata automaticamente all'avvio delle sessioni Antigravity.*

---

## 🧪 Esecuzione dei Test Unitari dei Tool

Per verificare la suite di strumenti:
```powershell
cd C:\Users\<utente>\.claude\skills\vibe_multiagent\tools
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
├── README.md                     # Presentazione e manuale d'uso
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

Uso privato e interno. Tutti i diritti riservati.
