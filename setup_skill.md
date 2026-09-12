# Skill: setup di un progetto multi-agente con scelta dell'ambiente

## Esito

Conduci un'intervista iniziale per configurare un singolo progetto di sviluppo. L'intervista determina l'ambiente di lavoro, l'orchestratore, gli agenti collaborativi, i ruoli e le limitazioni. L'integratore coincide sempre con l'orchestratore dell'ambiente selezionato: Claude Code in Ambiente A e C, Antigravity (AGY) in Ambiente B.

Al termine, con l'approvazione esplicita dell'utente, crea o aggiorna nel repository selezionato `AGENTS.md` e i file della cartella di coordinamento, derivati dai template di questa skill.

## Quando non usare questa skill

- Il repository ha già un `AGENTS.md` con protocollo di coordinamento completo e l'utente non vuole rifarlo: proponi solo la modifica puntuale richiesta, senza intervista.
- L'utente vuole aggiungere o rimuovere un singolo agente da un setup già esistente: aggiorna la sezione `Ruoli` di `AGENTS.md` e il file di ruolo, senza rieseguire le dodici domande.
- Progetto mono-file, script usa-e-getta, o prototipo che non sopravvive alla sessione: il costo del protocollo supera il beneficio. Dillo e proponi di lavorare senza.
- Serve solo un passaggio di consegne tra sessioni dello stesso agente e non un setup multi-agente: usa una procedura standard di handoff o una skill esterna dedicata (es. `handoff-hardened` se installata).

## Confini e sicurezza

- Questa è una skill globale: non assumere stack, dominio, deploy, dati, lingua, policy o comandi da un progetto precedente.
- Non usare API a pagamento. Ogni agente esterno usa la propria CLI e autenticazione in abbonamento.
- Gli agenti si possono invocare da riga di comando, anche in modo non interattivo (`agy -p`, `claude -p`, `codex exec`), ma il coordinamento passa da Git e dalla cartella di coordinamento, per scelta: un artefatto su disco è verificabile e sopravvive alla sessione.
- Non eseguire deploy, migrazioni, pubblicazioni, installazioni o scritture fuori dal repository senza un'autorizzazione specifica.
- Prima di qualunque modifica, controlla `git status` e leggi le istruzioni già presenti: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.codex/`, `.agents/` (convenzione Antigravity: hook, skill e regole), `.claude/agents/`. Le istruzioni esistenti prevalgono; non sovrascriverle.
- Se trovi `.agent/` al singolare, segnalalo: non è la radice di nulla di documentato, e ciò che contiene non viene letto da nessuno dei tre agenti. Non scriverci dentro e non cancellarlo di tua iniziativa.
- Se la cartella non è un repository, chiedi se inizializzarlo: non farlo in modo implicito.

## Cartella di coordinamento

Tutti i file generati, tranne `AGENTS.md`, vivono in una sola cartella. Il suo nome è il segnaposto `{{DIR_COORD}}` e va deciso in Domanda 0 con questa regola, in quest'ordine:

1. Se il repository contiene già `.coord/` o `.claude/agents/` da un avvio precedente, riusa quella.
2. Altrimenti usa `.coord/`.
3. **`.agents/` è riservata e non è mai un candidato.** È il percorso in cui Antigravity cerca hook, skill e regole: usarla per il protocollo significa mescolare due cose che appartengono a proprietari diversi. Non è una preferenza di stile, è dove il prodotto guarda.
4. `.agent/` al singolare non è la radice di niente. Se esiste, segnalala al Direttore e lasciala stare.

Registra il valore scelto: compare dentro i file generati e i futuri agenti lo useranno per trovare il contesto.

## Sede, orchestrazione ed esecuzione

Tre assi distinti. Confonderli è l'errore che questa sezione previene.

| Asse | Domanda | Risposte possibili |
|---|---|---|
| **Sede** | dove gira la sessione | terminali separati · VS Code con Claude Extension · Antigravity IDE |
| **Orchestrazione & Integrazione** | chi assegna, sorveglia, verifica e integra | Claude Code (Ambiente A/C) · Antigravity AGY (Ambiente B) |
| **Esecuzione** | chi tocca i file di un task | Claude Code · Codex · esecutore AGY |

### I tre ambienti

| # | Ambiente | Sede | Orchestratore & Integratore | Agenti collaborativi |
|---|----------|------|-----------------------------|----------------------|
| **A** | VS Code + Claude Extension | VS Code | Claude Code (capocantiere / integratore) | Codex CLI, AGY CLI |
| **B** | Antigravity IDE | Antigravity IDE | AGY (dispatcher / integratore) | Claude CLI, Codex CLI |
| **C** | Terminali separati | Terminali indipendenti | Claude Code (capocantiere / integratore) | Codex CLI, AGY CLI |

### Perché l'orchestratore può non essere Claude

I tre agenti attingono a **tre quote indipendenti**: Claude Code a quella Anthropic, Codex a quella OpenAI, Antigravity a quella Google — e Antigravity vi attinge **anche quando gira su modelli Claude**, perché a pagare è l'abbonamento di Antigravity. Il lavoro di orchestrazione è costante e a basso costo; quello di esecuzione è variabile e caro. Mettere l'orchestratore sul bucket che non si sta bruciando non è architettura, è aritmetica: è l'unico modo perché chi deve scrivere il punto di ripresa non si spenga insieme a chi lavora.

### Chi assegna `INTEGRATO` (Regola di Integrazione)

Solo l'**Orchestratore dell'ambiente selezionato** assegna lo stato `INTEGRATO` a un task, e solo dopo aver rieseguito personalmente le verifiche e i test:
- **In Ambiente A e C**: **Claude Code** è l'unico proprietario dell'integrazione e assegna `INTEGRATO`.
- **In Ambiente B**: **Antigravity (AGY)** è l'unico proprietario dell'integrazione e assegna `INTEGRATO`.

Nessun collaboratore/esecutore dichiara concluso o integrato il proprio task: consegna l'handover con stato `CONSEGNATO`, e l'orchestratore verifica e integra.

### Rischio del working tree condiviso (Ambienti A e B)

Tre agenti nella stessa finestra o nello stesso terminale condividono **un solo working tree**. La regola «un solo proprietario per file» nasceva per terminali separati, dove violarla richiedeva uno sforzo; qui basta una distrazione, e le politiche di auto-esecuzione dei tre agenti sono diverse fra loro. Se due esecutori devono lavorare in parallelo, servono **worktree distinti** (`git worktree add`), non soltanto file riservati dichiarati.

## Intervista

Poni le domande in italiano e non fare assunzioni sulle risposte mancanti. Registra le risposte in una bozza finché l'utente non approva la configurazione.

**Formato.** Per le domande a dominio chiuso (0, 0-bis, 2, 4, 9) usa `AskUserQuestion` o `ask_question` con opzioni, raggruppando fino a quattro domande per chiamata. Per le domande aperte (1, 3, 5, 6, 7, 8, 10) chiedi a testo libero, una per messaggio. Se nessuna funzione di domanda interattiva è disponibile nel runtime corrente, fai tutte le domande a testo libero, una per messaggio.

Ordine delle domande:

0. Quale cartella ospita il progetto, qual è il suo nome, ed è già un repository Git? Se non sei già nella cartella giusta, fattela indicare per percorso assoluto prima di continuare.

0-bis. Da quale ambiente lavorerai?
   - **VS Code con Claude Extension** (Ambiente A): Claude Code è il capocantiere e integratore. AGY CLI e Codex CLI sono agenti collaborativi lanciati dal terminale.
   - **Antigravity IDE** (Ambiente B): l'agente Antigravity (AGY) è il dispatcher e integratore. Claude CLI e Codex CLI sono agenti collaborativi lanciati dal terminale integrato.
   - **Terminali separati** (Ambiente C): Claude Code è il capocantiere e integratore, come nell'Ambiente A, ma ciascun agente gira nel proprio terminale. Il coordinamento passa esclusivamente da Git e dalla cartella di coordinamento.

1. Qual è il problema da risolvere, per chi, e quale risultato osservabile definisce il successo della prima versione?

2. Quali piattaforme deve servire (web, mobile, desktop, locale, VPS) e quale esperienza utente è prioritaria?

3. Quali dati tratta? Indica dati personali o sensibili, provenienza, conservazione, autenticazione e vincoli di privacy.

4. Quali tecnologie sono obbligatorie, preferite o vietate? Includi runtime, framework, database, servizi esterni e limiti di costo.

5. Quali sono da tre a cinque entità principali e le relazioni o flussi di dati indispensabili?

6. Quali integrazioni esterne, file, device o fonti devono esserci nella prima versione? Quali possono restare fuori?

7. Quale stile architetturale, livello di modularità, strategia di test e verifiche minime desideri?

8. Come si sviluppa e si pubblica: ambiente locale, repository, branch, CI/CD, hosting, backup e autorizzazioni di deploy?

9. Quali agenti e abbonamenti sono disponibili in questo progetto: Claude Code, Antigravity IDE/CLI, Codex CLI? Se uno esaurisce il proprio limite, chi subentra e quale lavoro invece **non** va sostituito, ma aspetta il reset? E infine: ci sono dati che non devono passare per un certo **fornitore**? Attenzione, sono due domande distinte: un modello Claude eseguito dentro Antigravity passa dal percorso dati Google e dal modello di permessi di Antigravity, non da quelli di Anthropic. La risposta non dipende solo da quale agente, ma da quale agente attraverso quale fornitore.

10. Qual è la prima milestone, quali file o componenti la compongono, e quali decisioni devono restare sempre all'utente?

Se una risposta rivela un rischio materiale (dati sensibili, normativa, pagamento, produzione, integrazione non autorizzata), chiedi subito il chiarimento necessario prima di proseguire.

## Verifica della disponibilità degli agenti

La Domanda 9 raccoglie un'intenzione, non un fatto. Prima di applicare la matrice, verifica sul sistema.

### Comandi di verifica

| Agente | Comando | Esito negativo |
|---|---|---|
| Claude Code (in VS Code) | Nessuna: è il runtime corrente. | — |
| Claude CLI (in AGY / terminali) | `claude --version` | Vedi la regola sul PATH qui sotto. |
| AGY | `agy --version` | Vedi la regola sul PATH qui sotto. |
| Codex | `codex --version` | Vedi la regola sul PATH qui sotto. |

### PATH stantio su Windows — prima regola

**Un comando che non risolve non è una prova di assenza.** Una CLI installata di recente non compare nel PATH di una sessione già aperta: il processo in corso ha ereditato l'ambiente com'era all'avvio. Prima di dichiarare un agente non disponibile, controlla il percorso di installazione noto:

- AGY: `%LOCALAPPDATA%\agy\bin\agy.exe` (su Windows).
- Claude: `%USERPROFILE%\.claude\local\claude.exe` o `%LOCALAPPDATA%\Programs\claude-code\claude.exe`.
- Codex: installazione npm globale o `~/.codex/`.

Se l'eseguibile c'è ma il nome non risolve, l'agente **è** disponibile: usa il percorso completo per questa sessione e indica all'utente come sistemare il PATH.

Su Windows la causa quasi sempre è un ambiente ereditato: il registro è già corretto, ma il processo in corso porta la copia vecchia. Chiudere la scheda del terminale non basta, perché eredita dal processo padre; va riavviato l'IDE che lo ospita. Rimedio immediato per la finestra aperta, senza riavviare nulla:

```powershell
$env:PATH = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
```

Per AGY, `agy install` riconfigura percorsi e profili di shell in modo permanente.

Solo se l'eseguibile non esiste l'agente è davvero assente. Dichiaralo e prosegui senza: non generare ruoli, task o file per un agente non verificato.

Non confondere `agy` con `antigravity-ide`: il secondo è il launcher dell'IDE, in stile VS Code, e il suo `chat -m agent` apre una sessione grafica senza restituire l'esito. L'agente da riga di comando è `agy`.

### Preflight per Ambiente A (VS Code con Claude Extension)

| Controllo | Comando | Esito da segnalare |
|---|---|---|
| Claude Code disponibile | (è il runtime) | — |
| AGY disponibile (se scelto) | `agy --version` e `agy models` | PATH stantio / verifica nomi modelli |
| Codex disponibile (se scelto) | `codex --version` + check path | PATH stantio |
| `.gitattributes` presente | `Get-Content .gitattributes` / `cat .gitattributes` | Rischio CRLF su Windows: suggerisci `* text=auto eol=lf` |
| Contaminazione ambiente | `$env:ELECTRON_RUN_AS_NODE` (PS) / `echo $ELECTRON_RUN_AS_NODE` (Bash) | Se `1`, la sessione è contaminata: riavvia il terminale |

### Preflight per Ambiente B (Antigravity IDE)

| Controllo | Comando | Esito da segnalare |
|---|---|---|
| Radice personalizzazioni | `Get-ChildItem -Force .agents,.agent -ErrorAction SilentlyContinue` (PS) / `ls -d .agents .agent 2>/dev/null` (Bash) | `.agent/` presente: segnala, non è letta da nessuno |
| Hook globali vivi | `node -e "const h=require(require('os').homedir()+'/.gemini/config/hooks.json'); for(const[n,c]of Object.entries(h)) console.log(n, c.enabled!==false?'attivo':'disattivo')"` | Un hook attivo che punta a un file inesistente fallisce a ogni turno |
| Claude CLI disponibile | `claude --version` + check path | PATH stantio |
| Codex CLI disponibile (se scelto) | `codex --version` + check path | PATH stantio |
| AGY CLI disponibile (se scelto) | `agy --version` e `agy models` | PATH stantio / verifica modelli disponibili |
| `.gitattributes` presente | `Get-Content .gitattributes` / `cat .gitattributes` | Rischio CRLF su Windows |
| Contaminazione ambiente | `$env:ELECTRON_RUN_AS_NODE` (PS) / `echo $ELECTRON_RUN_AS_NODE` (Bash) | Se `1`, la sessione è contaminata |

Le estensioni VS Code di Claude Code e Codex **non sono su OpenVSX**, che è il marketplace di Antigravity IDE. Vanno installate da VSIX, oppure — ed è la strada che il protocollo assume — si usano le due CLI dal terminale integrato, che funzionano comunque. Non promettere al Direttore le estensioni nel pannello prima di averle viste girare.

### Preflight per Ambiente C (terminali separati)

| Controllo | Comando | Esito da segnalare |
|---|---|---|
| Claude Code disponibile | `claude --version` | PATH stantio |
| AGY disponibile (se scelto) | `agy --version` e `agy models` | PATH stantio / verifica nomi modelli |
| Codex disponibile (se scelto) | `codex --version` + check path | PATH stantio |
| `.gitattributes` presente | `Get-Content .gitattributes` / `cat .gitattributes` | Rischio CRLF su Windows |

### Come si avvia un task su ciascun agente

**Claude Code (come esecutore):**
```bash
claude -p "Esegui {{DIR_COORD}}/tasks/<ID>.md. Leggi prima AGENTS.md. Scrivi tassativamente i deliverable sui file assegnati e l'handover in {{DIR_COORD}}/handover/<ID>.md come ultima tool call prima di terminare." --output-format json
```
*Nota*: Non chiedere mai a Claude headless di "rispondere in markdown a video" (su stdout). Claude emette l'output su stdout solo alla fine dell'intera sessione: un task di audit o codice richiede 15-30 tool call (3-8 minuti); se la sessione viene interrotta prematuramente a 90s, l'output va perso e la quota Anthropic è sprecata. Imponi sempre la scrittura diretta su file e applica la **Regola Anti-Thrashing** (mai rilanciare in loop compulsivo o accorciare il prompt).

**AGY CLI (come esecutore):**
```bash
agy -p "Leggi AGENTS.md, {{DIR_COORD}}/PROJECT.md e {{DIR_COORD}}/tasks/<ID>.md. Esegui SOLO le attività e verifiche richieste; non eseguire comandi shell o test non dichiarati nel task. La compilazione dell'handover in {{DIR_COORD}}/handover/<ID>.md e l'aggiornamento del task devono essere le ultime tool call obbligatorie prima di uscire." --add-dir <percorso repository>
```
*Nota*: Se si specifica `--model`, verificare sempre i nomi reali con `agy models` (es. `gemini-3.1-pro-high`, `gemini-3.8-flash-*`). Prima di lanciare AGY in headless, pre-approva in `~/.gemini/antigravity-cli/settings.json` (`permissions.allow`) i comandi esatti delle verifiche del task: `command(...)` richiede corrispondenza esatta token per token. Se l'agente esce con codice 0 ma errore `"jetski: no output produced"`, ispeziona il transcript in `~/.gemini/antigravity-cli/brain/<conv-id>/.system_generated/logs/transcript.jsonl` (metodo verificato e confermato sul campo) per risalire al comando o file negato in un minuto.

**Codex CLI:**
```bash
codex exec -m <MODELLO_NOTO> --sandbox workspace-write "Leggi AGENTS.md, {{DIR_COORD}}/PROJECT.md e {{DIR_COORD}}/tasks/<ID>.md. Sei in modalità headless/non-interattiva: procedi direttamente con l'implementazione e i test senza chiedere conferme intermedie."
```
*Nota*: Forza sempre `-m` esplicito per evitare blocchi da drift in `~/.codex/config.toml`. La sandbox di Codex non ha accesso di rete (niente `npm install` di nuovi pacchetti) e blocca i sottoprocessi (`spawn EPERM`). Per i test Vitest, specifica nel task `npx vitest run --configLoader runner <file>`.

**AGY sotto-agente (dall'interno di AGY come dispatcher, Ambiente B):**
```
invoke_subagent con TypeName: self e prompt che rimanda al task
```

Restano due regole fondamentali:
1. **Mai usare permessi pericolosi**: non usare mai `--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox` o equivalenti.
2. **Consegna verificabile su disco**: la consegna di un task passa da `{{DIR_COORD}}/handover/` e commit Git. Se un agente esce con errore o codice non zero alla fine del turno (es. per limite quota scattato all'ultimo), **controlla prima lo stato effettivo su disco e Git**: se codice e test sono completi, procedi alla verifica e integrazione invece di buttare il lavoro!

## Scelta degli agenti

Applica questa matrice dopo l'intervista e dopo la verifica. Dichiara scelta, ragione e costo di un eventuale errore.

| Agente | Regola di selezione | Perimetro consentito |
|---|---|---|
| Claude Code | Sempre in Ambiente A/C (capocantiere e integratore). In Ambiente B come esecutore: implementazione, pianificazione, refactoring, test complessi. | Intervista, piano, task, implementazione, integrazione, verifiche, documentazione e commit. |
| AGY | Sempre in Ambiente B (dispatcher e integratore). In Ambiente A/C: solo se verificato e servono UI/UX, browser testing, esplorazione separabile o compiti i cui input sono file statici sul disco (`read_file`). Sconsigliato per compiti che richiedono tool o comandi shell dinamici liberi. | Artefatti, test, analisi o file riservati nel task; in Ambiente B possiede l'integrazione. |
| Codex | Solo se verificato e serve diagnosi tecnica, implementazione di un modulo indipendente, refactoring delimitato o verifica separata. | Task con confini e file riservati; nessun deploy, migrazione o modifica concorrente. Nessun `npm install` o generazione di migrazioni DB in sandbox. |

Non scegliere AGY o Codex per abitudine. Un solo agente possiede i file di produzione di un task. Se servono entrambi, dividili per artefatto o usa worktree distinti e l'orchestratore integra dopo la verifica.

### Coordinamento Git nel Working Tree Condiviso
- Mentre un esecutore delegato lavora nel working tree, l'Integratore **non deve eseguire comandi Git in scrittura** (`commit`, `add`, `switch`, `merge`), neppure su file o rami diversi (previene `index.lock: Permission denied`).
- Posiziona il repository sul ramo corretto prima del lancio e istruisci l'esecutore a non eseguire comandi Git di switch/commit: l'esecutore scrive solo i file e l'handover, l'integrazione spetta all'integratore.

### Dispatch nell'Ambiente B (AGY come dispatcher & integratore)

Nell'Ambiente B, AGY è sia il dispatcher che l'integratore: assegna, lancia, sorveglia e registra, poi verifica e integra. Gira sulla quota Google, indipendente da quella degli esecutori. Come lanciare e monitorare gli esecutori:

| Esecutore | Comando (via `run_command`) | Monitoraggio | Quota consumata |
|---|---|---|---|
| Claude CLI | `claude -p "Esegui {{DIR_COORD}}/tasks/<ID>.md. Leggi prima AGENTS.md. Scrivi tassativamente i deliverable sui file assegnati e l'handover in {{DIR_COORD}}/handover/<ID>.md prima di terminare." --output-format json` | `manage_task` con `status` e `kill` | Anthropic |
| Codex CLI | `codex exec -m <MODELLO> --sandbox workspace-write "Esegui {{DIR_COORD}}/tasks/<ID>.md. Leggi prima AGENTS.md. Sei in headless: procedi senza chiedere conferme."` | `manage_task` con `status` e `kill` | OpenAI |
| Esecutore AGY | `invoke_subagent` con `TypeName: self` | `manage_subagents` e `send_message` | Google (la propria) |

Il dispatcher lancia un esecutore con `run_command`, impostando `WaitMsBeforeAsync` a 500ms perché l'agente resti in background. Il sistema notifica automaticamente il completamento. Per controllare lo stato intermedio, usare `manage_task` con `status`.

**Non lanciare due esecutori sullo stesso insieme di file riservati** finché il primo non ha consegnato. Se devono lavorare in parallelo, servono worktree distinti.

Le istruzioni operative complete del dispatcher sono nel template `DISPATCH.md.template`, generato come `{{DIR_COORD}}/DISPATCH.md`.

## Esaurimento e sostituzione di un agente

**Per Claude Code la quota è osservabile prima di consumarla; per gli altri due no.** Il client interroga `GET /api/oauth/usage` e ne ricava l'utilizzo per finestra. Lo strumento è `tools/quota-anthropic.mjs` in questa skill. `agy` e `codex` invece non espongono nulla: `agy --help` non ha comandi di quota e `codex doctor` riporta solo che l'autenticazione è configurata. Per loro l'esaurimento si scopre ancora quando accade, da un'uscita diversa da zero.

L'endpoint è interno e non documentato. Se cambia, il sensore degrada da solo a `source: "stale"` e le soglie tornano manuali: **dichiaralo al Direttore invece di far finta che il sensore funzioni.**

### Soglie di quota

| Finestra | Soglia | Cosa fare |
|---|---|---|
| `five_hour` | 70% | Annuncio. Nessun task di taglia `L` sul bucket in questione. Verifica che il task `IN CORSO` abbia il punto di ripresa aggiornato. |
| `five_hour` | 85% | Chiudi il blocco corrente, commit, aggiorna il punto di ripresa. Instrada il resto su un altro bucket. |
| `five_hour` | 95% | Nessun lavoro nuovo su quel bucket. Handover e riferisci l'ora del reset. |
| `seven_day` | 70% | Sposta subito il lavoro meccanico su modello ed effort inferiori. |
| `seven_day` | 85% | Delega ciò che è delegabile a un altro fornitore, o ferma la fase. |
| `seven_day` | 95% | Stop. La ripresa si pianifica come giorno, non come ora. |

Le percentuali hanno margine perché il sensore dà una percentuale, non «quanti token mancano». Non stringerle.

### I tre casi di esaurimento

Non sono equivalenti:

| Chi si esaurisce | Come lo rilevi | Cosa puoi fare |
|---|---|---|
| AGY o Codex invocati da te (`agy -p`, `codex exec`, `claude -p`) | Uscita diversa da zero e messaggio di errore su stderr. | Applica il protocollo di sostituzione qui sotto. |
| AGY o Codex avviati dall'utente in sessione interattiva | Non lo vedi: te ne accorgi solo perché l'handover non arriva. | Fissa una scadenza nel task; scaduta, chiedi all'utente prima di riassegnare. |
| L'orchestratore / integratore in carica | La sessione si interrompe: non puoi reagire dopo. | Solo prevenzione, con il punto di ripresa. |

### Punto di ripresa, contro il terzo caso

Quando inizi a lavorare su un task, compi **un gesto solo** che comprende due cose: porta `Stato:` a `IN CORSO` e compila il `Punto di ripresa` con data e ora, cosa stai per fare, quali file toccherai e qual è l'ultimo passo completato. Ripeti l'aggiornamento prima di ogni blocco successivo, sempre **prima** e non dopo.

I due campi vanno insieme perché servono a lettori diversi e si controllano a vicenda. Lo stato dice a una sessione nuova *dove guardare*; il punto di ripresa le dice *da dove ripartire*. Un punto di ripresa compilato su un task ancora `PRONTO` è la peggiore delle combinazioni: la sessione nuova legge cinque task «pronti», conclude che nessuno era in corso, e non apre mai il file dove la traccia esisteva.

Vale soprattutto per te come proprietario: sei l'unico agente che, esaurendosi, non può consegnare un handover.

**Chiudi il punto di ripresa quando il task esce da `IN CORSO`**, verso `CONSEGNATO`, `INTEGRATO` o `SOSPESO`. Riscrivi `Sto per:` con ciò che vale adesso — «nulla, il task è chiuso, esito in `handover/<ID>.md`», oppure per un task sospeso il motivo e cosa serve per riprenderlo.

Nell'Ambiente B, l'hook `agy-checkpoint.mjs` scrive automaticamente la riga `Fatti:` (data, file modificati, ultimo commit) nel punto di ripresa del task `IN CORSO`. `Sto per:` resta del modello — è intenzione, nessun hook la può dedurre.

### Ripresa dopo interruzione

Quando entri in un repository che ha già una cartella di coordinamento, **prima di qualunque altra cosa**, anche prima di rispondere a ciò che ti è stato chiesto, controlla se c'è lavoro interrotto:

```bash
# Bash / macOS / Linux:
grep -l '^Stato: IN CORSO' {{DIR_COORD}}/tasks/*.md

# PowerShell (Windows):
Get-ChildItem "{{DIR_COORD}}/tasks/*.md" | Select-String "^Stato:\s*IN CORSO" | Select-Object -ExpandProperty Path
```

Se trovi un task `IN CORSO`, leggine il `Punto di ripresa` e riferisci all'utente cosa era in corso, quale fu l'ultimo passo completato e cosa proponi di fare, prima di iniziare qualsiasi lavoro nuovo. Un task lasciato `IN CORSO` non significa che qualcuno ci stia lavorando adesso: significa che qualcuno si è fermato senza chiudere.

Se lo stato e il punto di ripresa si contraddicono — task `PRONTO` con un punto di ripresa compilato, oppure `IN CORSO` con «ultimo passo completato: nessuno» — credi al punto di ripresa, che descrive dei fatti, e non allo stato, che è un'etichetta. Poi correggi lo stato e dillo all'utente.

Se sono presenti sia `Sto per:` sia `Fatti:` e si contraddicono, **credi a `Fatti:`**: lo scrive un hook e descrive lo stato del disco. `Sto per:` lo scrive un modello e descrive un'intenzione che può non essersi avverata.

### Protocollo di sostituzione

1. Porta il task allo stato `SOSPESO` e annota nel task l'errore ricevuto, per intero.
2. Leggi `Costo — capacità` e `Costo — garanzia` nel task. Se il costo in garanzia non è accettabile, fermati e riferisci all'utente: aspettare il reset è la scelta corretta, non un fallimento.
3. Se la sostituzione è prevista, valuta cosa decade. Un ripiego non è mai neutro: se Codex possedeva i test proprio per renderli indipendenti dall'implementazione, farli scrivere a chi implementa chiude il task ma cancella la garanzia. Il risultato è peggiore di un task fermo, perché sembra completo.
4. Registra la sostituzione in `DECISIONS.md` con la garanzia perduta, il costo se fosse sbagliata e una **data o condizione esplicita di riverifica del ripiego** (i ripieghi temporanei non vanno ereditati per sempre). **Nessuna sostituzione silenziosa**: un progetto che sembra verificato senza esserlo è il danno peggiore che questo protocollo possa produrre.
5. Riassegna la proprietà dei file nel task. Non lasciare due proprietari sullo stesso insieme.
6. **Rileggi i task toccati e verifica che stato e proprietario corrispondano alla decisione appena registrata.** Il controllo è: `grep -h '^Stato:\|^Proprietario:' {{DIR_COORD}}/tasks/*.md` (Bash) oppure `Get-ChildItem "{{DIR_COORD}}/tasks/*.md" | Select-String "^(Stato|Proprietario):"` (PowerShell).
7. **Un cambio di esecutore dettato dalla quota è una sostituzione a tutti gli effetti.** Vale anche quando il ripiego sembra equivalente — per esempio Claude Code sostituito da un esecutore Antigravity che gira su un modello Claude. Cambia il fornitore, cambiano i permessi, e soprattutto la garanzia di indipendenza non si recupera cambiando fattura.

Se l'utente ha già detto quale agente subentra a quale, applicalo senza richiedere conferma a ogni occorrenza; ma i punti 4 e 6 restano obbligatori ogni volta.

## Proposta e approvazione

Prima di creare file, presenta una sintesi che includa:

- ambiente scelto (A, B o C) con orchestratore/integratore e agenti collaborativi;
- specifiche e confini della prima milestone;
- stack, dati, vincoli e strategia di verifica;
- agenti selezionati con ruoli, fornitore e motivazione, e agenti scartati con la ragione;
- nome della cartella di coordinamento scelta e struttura dei file da creare o aggiornare;
- file condizionali: `DISPATCH.md` e `hooks.json` solo per l'Ambiente B;
- rischi, assunzioni e verifiche previste.

Chiedi l'approvazione esplicita. Se l'utente modifica la proposta, aggiornala e chiedi nuovamente approvazione. Non generare configurazioni finché non ricevi un sì.

## Destinazione dei template

Ogni template ha una sola destinazione. `{{DIR_COORD}}` è il valore deciso in Domanda 0. `{{DIR_SKILL}}` è il percorso assoluto di questa skill.

| Template | Destinazione | Quando |
|---|---|---|
| `AGENTS.md.template` | `AGENTS.md` nella radice del repository | Sempre. |
| `PROJECT.md.template` | `{{DIR_COORD}}/PROJECT.md` | Sempre. |
| `CURRENT_SPRINT.md.template` | `{{DIR_COORD}}/CURRENT_SPRINT.md` | Sempre. |
| `DECISIONS.md.template` | `{{DIR_COORD}}/DECISIONS.md` | Sempre; alla creazione contiene l'intestazione e la prima decisione reale, se ce n'è una. |
| `AGENT_ROLE.md.template` | `{{DIR_COORD}}/agents/<ruolo>/agent.md` | Un file per ogni ruolo effettivamente selezionato e verificato. Nessun ruolo fittizio. |
| `TASK.md.template` | `{{DIR_COORD}}/tasks/<ID_TASK>.md` | Un file per task, alla creazione del task. |
| `HANDOVER.md.template` | `{{DIR_COORD}}/handover/<ID_TASK>.md` | Alla consegna di un task da parte del suo proprietario. |
| `dashboard.html.template` | `{{DIR_COORD}}/dashboard.html` | Sempre. Control Room visiva interattiva per monitoraggio flotta, quote e log streaming. |
| `CLAUDE.md.template` | `CLAUDE.md` nella radice del repository | Quando tra gli agenti è presente Claude Code CLI: istruzioni operative e sincronizzazione telemetria. |
| `apri-dashboard.cmd.template` | `{{DIR_COORD}}/apri-dashboard.cmd` | Su ambienti Windows: avviatore one-click che avvia il watcher in background e apre la Control Room. |
| `DISPATCH.md.template` | `{{DIR_COORD}}/DISPATCH.md` | **Solo Ambiente B.** |
| `hooks.json.template` | `.agents/hooks.json` nella radice del repository | **Solo Ambiente B.** Se il file esiste già, aggiungi la chiave `protocollo-multi-agente` senza toccare le altre: gli hook con nomi diversi si fondono. |
| `multiagent-rule.md.template` | `.agents/rules/multiagent-coordinator.md` nella radice del repository | **Solo Ambiente B.** Regola permanente di workspace che mantiene il modello nel ruolo di Coordinatore/Integratore ad ogni interazione. |

Per il passaggio di consegne fra sessioni diverse dello stesso modello (invece che fra agenti distinti su un task specifico), usa una procedura di handoff dedicata. `HANDOVER.md.template` copre la consegna e verifica di un task formale dentro questo protocollo.

## Mappatura risposte e segnaposto

Compila i segnaposto da queste fonti. Non lasciarne nessuno non sostituito.

| Segnaposto | Fonte |
|---|---|
| `{{NOME_PROGETTO}}`, `{{DIR_COORD}}` | Domanda 0. |
| `{{AMBIENTE}}` | Domanda 0-bis. Valore: `A`, `B` o `C`. Non compare nei template ma governa **quali** file si generano. |
| `{{AGENTE_INTEGRATORE}}` | Domanda 0-bis. Valore: `Claude Code` in Ambiente A e C; `Antigravity (AGY)` in Ambiente B. |
| `{{SCOPO_E_VALORE}}` | Domanda 1, per esteso. |
| `{{SCOPO_UNA_RIGA}}` | Derivato: una riga dalla Domanda 1. |
| `{{UTENTI_E_PIATTAFORME}}` | Domanda 2. |
| `{{DATI_E_PRIVACY}}` | Domanda 3. |
| `{{STACK_E_ARCHITETTURA}}` | Domande 4 e 7, parte architetturale. |
| `{{ENTITA_E_FLUSSI}}` | Domanda 5. |
| `{{INTEGRAZIONI}}` | Domanda 6, incluse ed escluse. |
| `{{STRATEGIA_TEST}}` | Domanda 7, parte di test e verifiche. |
| `{{STRATEGIA_RILASCIO}}` | Domanda 8. |
| `{{VINCOLI_NON_NEGOZIABILI}}` | Divieti e autorizzazioni dalle Domande 3, 4, 8, 10. Solo obblighi, non descrizioni. |
| `{{RUOLI_OPZIONALI}}` | Domanda 9 più la verifica di disponibilità e la matrice. |
| `{{RUOLO_DISPATCHER}}` | Domanda 0-bis. Vuoto fuori dall'Ambiente B. Nell'Ambiente B: `- Dispatcher & Integratore — agente Antigravity: assegna, lancia, sorveglia, verifica e integra. Gira sulla quota Google. Istruzioni operative in {{DIR_COORD}}/DISPATCH.md.` |
| `{{PRIMA_MILESTONE}}`, `{{AUTORIZZAZIONI}}` | Domanda 10. |
| `{{CRITERIO_DI_COMPLETAMENTO}}`, `{{PRIMO_TASK}}`, `{{RISCHI_E_DIPENDENZE}}` | Derivati: proponili tu e falli approvare esplicitamente. |
| `{{ID_TASK}}`, `{{ID_DECISIONE}}`, `{{DATA}}` | Derivati: `T-001`, `D-001`, data odierna. |
| `{{DIR_SKILL}}` | Percorso assoluto di questa skill (es. `~/.claude/skills/vibe_multiagent` su Linux/macOS o `%USERPROFILE%\.claude\skills\vibe_multiagent` su Windows). Serve agli hook generati, che hanno per working directory `.agents/` e non possono usare percorsi relativi. |

Segnaposto compilati più tardi, alla creazione di un ruolo, di un task o di una decisione:

| Segnaposto | File | Fonte |
|---|---|---|
| `{{RUOLO}}`, `{{AGENTE}}`, `{{FORNITORE}}`, `{{MOTIVAZIONE_DEL_RUOLO}}`, `{{PERIMETRO_CONSENTITO}}`, `{{PERIMETRO_VIETATO}}`, `{{VERIFICHE_OBBLIGATORIE}}` | `AGENT_ROLE.md` | Domanda 9 e matrice di selezione, uno per ruolo verificato. |
| `{{COMANDO_DI_AVVIO}}` | `AGENT_ROLE.md` | Il comando che avvia la sessione di quell'agente avvolto nel runner della telemetria: `node "{{DIR_SKILL}}/tools/runner.mjs" --task <ID> --coord "{{DIR_COORD}}" -- <comando>` (es. per AGY `node "{{DIR_SKILL}}/tools/runner.mjs" --task <ID> --coord "{{DIR_COORD}}" -- agy -p "<prompt>" --add-dir <percorso>`, per Codex `node "{{DIR_SKILL}}/tools/runner.mjs" --task <ID> --coord "{{DIR_COORD}}" -- codex exec ...`, per Claude CLI `node "{{DIR_SKILL}}/tools/runner.mjs" --task <ID> --coord "{{DIR_COORD}}" -- claude -p "<prompt>" --output-format json`). Se il nome non risolve sul PATH, scrivi il percorso completo dell'eseguibile. |
| `{{TITOLO}}`, `{{PROPRIETARIO}}`, `{{OBIETTIVO}}`, `{{INCLUSO}}`, `{{ESCLUSO}}`, `{{FILE_RISERVATI}}`, `{{DIPENDENZE}}`, `{{CRITERI_ACCETTAZIONE}}`, `{{VERIFICHE}}`, `{{AUTORIZZAZIONI_O_BLOCCHI}}` | `TASK.md` | Domanda 10 per il primo task; i successivi alla loro creazione. |
| `{{ESECUTORE_E_MODELLO}}`, `{{COSTO_STIMATO}}` | `TASK.md` | Alla nascita del task. La taglia governa le soglie: sopra il 70% non si assegnano task `L`. |
| `{{AGENTE_DI_RIPIEGO}}`, `{{COSTO_CAPACITA}}`, `{{COSTO_GARANZIA}}` | `TASK.md` | Domanda 9, parte sull'esaurimento. Si decidono quando il task nasce, non quando l'agente si ferma. Se la garanzia perduta non è accettabile, scrivi «nessuna sostituzione, attendere il reset» in `{{AGENTE_DI_RIPIEGO}}`. |
| `{{STATO}}`, `{{AGENTE_USCENTE}}`, `{{AGENTE_DESTINATARIO}}`, `{{STATO_ATTUALE}}`, `{{PROSSIMO_OBIETTIVO}}`, `{{VERIFICHE_E_RISULTATO}}`, `{{FILE_TOCCATI}}`, `{{DECISIONI_LIMITI_RISCHI}}` | `HANDOVER.md` | Il proprietario del task, alla consegna. |
| `{{DECISORE}}`, `{{CONTESTO}}`, `{{DECISIONE}}`, `{{RAGIONE_E_ALTERNATIVE}}`, `{{COSTO_ERRORE}}`, `{{CONSEGUENZE_E_VERIFICHE}}` | `DECISIONS.md` | Al momento della decisione, non a posteriori. |

Ogni informazione ha un solo file di riferimento: `AGENTS.md` porta il protocollo, `PROJECT.md` il contesto, `CURRENT_SPRINT.md` lo stato. Non ricopiare un contenuto in due file: rinvia al file che lo possiede.

## Generazione nel progetto

Dopo l'approvazione:

1. Crea `{{DIR_COORD}}/` con le sottocartelle `agents/`, `tasks/`, `handover/`, `logs/` che servono.
2. Copia i template alle destinazioni della tabella (incluso `{{DIR_COORD}}/dashboard.html`), sostituendo i segnaposto secondo la mappatura.
3. Se `AGENTS.md` non esiste, genera il file dal template. Se esiste, conserva tutto il contenuto e aggiungi o aggiorna solo la sezione delimitata da `<!-- INIZIO CONFIGURAZIONE MULTI-AGENTE -->` e `<!-- FINE CONFIGURAZIONE MULTI-AGENTE -->`.
4. Crea `CURRENT_SPRINT.md` con una prima milestone ancora pianificata, non dichiarata completata.
5. Scomponi prima di creare task: se la milestone tocca più di cinque file di produzione, o più di un dominio applicativo, o non ha un criterio di accettazione verificabile con un comando, proponi la scomposizione e fatti approvare le parti prima di generare `tasks/`.
6. **Solo Ambiente B**:
   - Genera `.agents/hooks.json` dal template, sostituendo `{{DIR_SKILL}}` con il percorso assoluto di questa skill. Se `.agents/hooks.json` esiste già, fondi la chiave `protocollo-multi-agente` con le chiavi esistenti.
   - Genera `.agents/rules/multiagent-coordinator.md` dal template `multiagent-rule.md.template`.
   - Genera `{{DIR_COORD}}/DISPATCH.md` dal template.
7. Integra `.gitignore` nella radice del repository (crealo se non esiste) aggiungendo le righe per escludere i dati volatili di telemetria e i log:
   ```gitignore
   {{DIR_COORD}}/state.json
   {{DIR_COORD}}/state.js
   {{DIR_COORD}}/logs/
   ```
8. Genera lo snapshot iniziale di telemetria eseguendo:
   `node "{{DIR_SKILL}}/tools/telemetry.mjs" --coord "{{DIR_COORD}}"`
9. Rileggi i file prodotti, cerca i segnaposto residui con:
   - Bash/macOS: `grep -rn "{{" AGENTS.md {{DIR_COORD}}/ .agents/`
   - PowerShell: `Get-ChildItem -Recurse -Path AGENTS.md, {{DIR_COORD}}, .agents -File | Select-String "\{\{"`
   e mostra `git status` e `git diff --check`.

## Protocollo operativo per i task futuri e manutenzione post-rilascio

Anche dopo la conclusione della prima milestone o a progetto ultimato, **il protocollo multi-agente resta attivo e permanente per qualsiasi interazione successiva**:
- **Nessuna modifica "a mano libera"**: per qualsiasi segnalazione di bug, nuova funzionalità, refactor o modifica richiesta dall'utente, il coordinatore/integratore **non implementa direttamente il codice applicativo**.
- **Canalizzazione tramite Task**: ogni nuova richiesta viene trasformata in un task in `{{DIR_COORD}}/tasks/<ID>.md`, viene aggiornato `{{DIR_COORD}}/CURRENT_SPRINT.md`, e il lavoro viene instradato all'esecutore appropriato secondo la matrice in `AGENTS.md` e `DISPATCH.md`.
- L'orchestratore/integratore (Claude Code in A/C, Antigravity in B) integra il risultato e riesegue personalmente le verifiche pertinenti prima di dichiarare concluso il task con `INTEGRATO`.

Se un agente si esaurisce, applica il protocollo di sostituzione: stato `SOSPESO`, verifica di cosa decade, decisione registrata. Mai una sostituzione silenziosa.

Usa `DECISIONS.md` per le decisioni che cambiano architettura, dati, confini o coordinamento; la ragione deve restare accanto alla decisione, non solo nella chat.

## Control Room Visiva & Runner Telemetrico

Per eliminare l'effetto "scatola nera" e consentire a utente e coordinatore di visualizzare in tempo reale l'attività degli agenti:
- **`{{DIR_COORD}}/dashboard.html`**: dashboard reattiva dark-mode standalone. Mostra lo stato della flotta (Claude Code, Codex, AGY), l'avanzamento milestone/sprint, il mini-kanban dei task e un terminale di streaming log.
- **`tools/runner.mjs`**: wrapper per i comandi shell degli esecutori che incanala contemporaneamente l'output su terminale e su `{{DIR_COORD}}/logs/<ID_TASK>.log`, aggiornando `{{DIR_COORD}}/state.json` ogni 2 secondi.
- **`tools/telemetry.mjs`**: generatore di telemetria cross-platform che alimenta `state.json` con lo stato di task, quote e log.
- **`tools/quota-anthropic.mjs`**: sensore opzionale di quota Anthropic, disattivato di default per privacy e attivabile esplicitamente con `VIBE_ANTHROPIC_QUOTA=1`.

### Installare la Control Room in un progetto esistente (senza ripetere il setup)

Se un progetto ha già la struttura di coordinamento (`AGENTS.md`, `{{DIR_COORD}}/tasks/`, `CURRENT_SPRINT.md`), non serve rifare l'intervista né rigenerare i file di contesto. Segui questi 5 passi:

1. **Esclusioni Git**: aggiungi a `.gitignore` nella radice del progetto:
   ```gitignore
   {{DIR_COORD}}/state.json
   {{DIR_COORD}}/state.js
   {{DIR_COORD}}/logs/
   ```
2. **Cartella log**: crea la cartella `{{DIR_COORD}}/logs/` se non esiste.
3. **Copia Dashboard**: copia `templates/dashboard.html.template` in `{{DIR_COORD}}/dashboard.html`, sostituendo eventuali occorrenze di `{{NOME_PROGETTO}}` con il nome reale del progetto (o il nome della cartella).
4. **Primo Snapshot Telemetria**: genera lo stato iniziale eseguendo:
   ```bash
   node "{{DIR_SKILL}}/tools/telemetry.mjs" --coord "{{DIR_COORD}}"
   ```
   Verifica che vengano generati `{{DIR_COORD}}/state.json` e `{{DIR_COORD}}/state.js`.
5. **Adozione del Runner (opzionale ma consigliata)**: quando lanci un esecutore per un task, incapsula il comando nel runner per catturare i log in streaming:
   ```bash
   node "{{DIR_SKILL}}/tools/runner.mjs" --task <ID> --coord "{{DIR_COORD}}" -- <comando abituale>
   ```
   Aggiungi in `AGENTS.md` (nella sezione coordinamento) l'istruzione:
   `Control Room: apri {{DIR_COORD}}/dashboard.html nel browser. Se non usi il runner, aggiorna lo stato a mano con: node "{{DIR_SKILL}}/tools/telemetry.mjs" --coord "{{DIR_COORD}}"`

## Consegna

Riporta: file creati o aggiornati con i percorsi, ambiente scelto, agenti scelti e scartati con la ragione, verifiche eseguite e loro esito, decisioni prese per conto dell'utente con il costo se fossero errate, e limiti ancora aperti.
