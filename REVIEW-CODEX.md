# Revisione open-source: sicurezza, privacy e qualità

Data: 11 settembre 2026. Snapshot: `8e79b22fe4e4e8a26c5e03457f08ce3f2772782c`.

## Valutazione

**Pubblicazione consigliata dopo la correzione di C-01 e la valutazione esplicita dei finding ALTO.** Il repository è piccolo, leggibile, senza dipendenze runtime esterne e già dotato di documentazione e CI. La suite esistente passa, ma non intercetta una XSS nel caricamento JSON della dashboard né diversi difetti di robustezza.

Le categorie esprimono la priorità per questa pubblicazione, come richiesto: **CRITICO = bloccante**, **ALTO = forte raccomandazione**, **MEDIO = miglioramento**, **BASSO = nice to have**, **INFO = punto di forza**. Non sono punteggi CVSS: in particolare C-01 richiede l'apertura/caricamento di dati manipolati nella dashboard locale, non costituisce una compromissione remota automatica del sistema.

| Categoria | Numero |
|---|---:|
| CRITICO | 1 |
| ALTO | 3 |
| MEDIO | 11 |
| BASSO | 3 |
| INFO | 6 |

## Perimetro e metodo

Letti integralmente tutti i **36 file versionati**, compresi i file con estensione finale `.template`: 6 tool `.mjs`, 6 test `.mjs`, una fixture Markdown, 11 template, workflow e tutti i file root. Esaminati anche `.gitignore`, `.gitattributes` e `LICENSE`, oltre alle estensioni richieste. Working tree inizialmente pulito. Nessun `AGENTS.md` operativo presente nel repository; `templates/AGENTS.md.template` è materiale da revisionare.

Eseguiti:

- Lettura del codice e tracciamento dei flussi input → elaborazione → filesystem/HTML/shell.
- Ricerca case-insensitive degli identificativi privati richiesti, dei percorsi personali Windows, di nomi di progetti privati noti e di pattern comuni di credenziali. Ripetuta la ricerca mirata nel contenuto di tutti i commit raggiungibili dalle ref locali: un solo commit.
- `npm test`: **exit 0**, tutti e sei i file di test completati su Windows con **Node v24.15.0**. Il primo tentativo nella sandbox era fallito con `spawnSync node EPERM`; il successivo, autorizzato fuori sandbox, è passato. L'EPERM ambientale non è classificato come difetto del repository.
- `node --check` su tutti i 12 file `.mjs`: nessun errore.
- Prove mirate con codice sorgente eseguito in `node:vm`, DOM minimale e dipendenze simulate: markup XSS, mapping segnali, ricostruzione comando, mock quota, banner, data ISO e scelta del checkpoint. Per il sensore è stato sostituito `process.exit(0)` con il ritorno dalla funzione di prova. Queste prove verificano rami e output del codice, non sostituiscono collaudi browser/OS completi.
- Consultazione di fonti primarie Node.js, GitHub e Contributor Covenant per i rilievi relativi a piattaforma e community.

**Limiti:** nessuna esecuzione reale su Node 18/20/22, Linux o macOS; nessuna esecuzione di agenti a pagamento; nessun accesso a credenziali reali o chiamata live al sensore quota; nessuna verifica delle impostazioni remote GitHub o dei job CI già eseguiti. Non analizzati oggetti Git irraggiungibili, backup o file esterni al repository. La ricerca di segreti è euristica, non una certificazione di assenza. Le prove XSS hanno verificato il markup prodotto, senza eseguire il payload in un browser.

## Risposta ai nove controlli richiesti

| Controllo | Esito |
|---|---|
| 1. Leak privati | Nessun riscontro dei termini e percorsi personali richiesti nel sorgente o nella storia raggiungibile. Nessun nome di progetto privato identificato dalla lettura. Vedi I-01 e A-03. |
| 2. XSS / onclick | `onclick` inline assenti; delegazione eventi corretta. Rimane una classe HTML non escaped: **C-01**. |
| 3. Traversal taskId | Sanitizzazione presente: ammessi solo lettere ASCII, cifre, `_`, `-`, con fallback. Vedi I-02. |
| 4. Exit su segnale | Non restituisce più successo per `code === null`, ma usa **143 per ogni segnale**: M-01. |
| 5. Mock malformato | JSON sintatticamente errato gestito con oggetto errore e exit 0. Schema JSON non validato: M-02. |
| 6. Node 18 | Tutti i 7 usi di `import.meta.dirname` hanno fallback. Compatibilità statica plausibile, non collaudata qui sul runtime 18. Vedi I-03 e M-09. |
| 7. CI | `permissions: contents: read` e `concurrency` con cancellazione presenti e appropriati. Vedi I-04, M-10, B-01. |
| 8. Code of Conduct | Attribuzione Contributor Covenant 2.1 presente; contatto riservato non concretamente indicato: A-02. |
| 9. Quota opt-in | Documentato sia in `DISPATCH.md.template:77` sia in `setup_skill.md:424`. Rimangono incoerenze sullo stato di errore: M-03. |

## CRITICO — bloccante

### C-01 — XSS nel rendering della classe di stato del task

**Riferimenti:** `templates/dashboard.html.template:607-615`, import JSON a `686-700` e `710-727`.

`t.stato` entra in `badgeClass` mediante la sola sostituzione degli spazi e viene interpolato nell'attributo `class` di una stringa assegnata a `innerHTML`. Diversamente dagli altri campi, non passa per `escapeHtml` né per una lista chiusa di stati.

Un JSON caricato attraverso «Carica file» o drag & drop può contenere:

```json
{
  "updatedAt": "2026-09-11T12:00:00Z",
  "tasks": [{ "id": "T-001", "titolo": "Test", "stato": "\"><svg/onload=alert(1)>" }],
  "logs": {}
}
```

La prova sul renderer reale produce l'inizio di markup:

```html
<span class="task-badge badge-"><svg/onload=alert(1)>" title="...
```

La forma senza spazi supera la sostituzione `replace(/\s+/g, '-')`. Il nuovo elemento SVG contiene un handler eseguibile dal browser. L'impatto è esecuzione JavaScript nell'origine della dashboard, con accesso allo stato e ai log disponibili in quella pagina; non si deduce da questo accesso arbitrario all'intero filesystem.

**Distinzione importante:** `telemetry.mjs:52-54` normalizza gli stati a un insieme finito: un normale campo `Stato:` malevolo nel task Markdown non percorre questo exploit. È il caricamento JSON diretto, o uno stato manipolato, a saltare tale normalizzazione.

**Correzione:** mappare gli stati a classi costanti, validare il JSON all'ingresso e preferire API DOM (`textContent`, `classList`) alle stringhe HTML. L'escape dell'attributo è una difesa aggiuntiva. Aggiungere un test browser sul payload, sulle virgolette negli ID e su markup nei log. La rimozione degli `onclick` inline, già corretta, non basta a chiudere questo secondo punto.

## ALTO — forte raccomandazione

### A-01 — La modalità `--` del runner perde la separazione degli argomenti

**Riferimenti:** `tools/runner.mjs:15-23,81-85`.

Il runner riceve argomenti già separati, li ricompone in una stringa e avvia sempre `shell: true`. La funzione di quoting considera solo spazi e virgolette; metacaratteri come `&`, `;`, `$` e backtick possono acquisire significato per la shell. Anche le virgolette doppie non impediscono tutte le espansioni su shell POSIX.

La prova con argomenti `['echo', 'SAFE&echo_INJECTED']` consegna a `spawn` esattamente `echo SAFE&echo_INJECTED`. Su `cmd.exe` l'ampersand separa due comandi. È verificata la trasformazione, non è stato eseguito un comando iniettato.

**Impatto:** argomenti/prompt costruiti da contenuti meno fidati possono diventare comandi con i permessi del processo chiamante; si perdono anche fedeltà e portabilità del quoting. Non è un'escalation se l'utente sceglie consapevolmente di passare una shell completa con `--cmd`.

**Correzione:** conservare executable e array argv nella modalità `--`, usando `shell: false`; riservare `--cmd` a shell esplicitamente fidata. Gestire separatamente gli shim `.cmd` Windows e collaudare percorsi con spazi e metacaratteri. Il rischio di input non sanitizzato con `shell` è esplicitato nella [documentazione Node.js](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options).

### A-02 — Il canale per segnalazioni di condotta non garantisce riservatezza

**Riferimenti:** `CODE_OF_CONDUCT.md:26`; `SECURITY.md:35-39`.

Il codice di condotta menziona una «segnalazione riservata», ma il solo collegamento fornito conduce alle Issues. In un repository pubblico quel flusso non è un recapito privato. Una persona può pubblicare dettagli di molestie o informazioni personali credendo di utilizzare il canale previsto.

**Correzione:** indicare una casella o un modulo riservato realmente disponibile, il responsabile e una promessa esplicita di tutela della riservatezza. La scelta del recapito spetta al maintainer: il report non ne inventa uno. Verificare separatamente il funzionamento del canale Security Advisory citato in `SECURITY.md`; la sua attivazione remota non è provata dal file.

L'attribuzione a Contributor Covenant 2.1 è presente e il collegamento alla fonte funziona. Il testo è un adattamento abbreviato, non il covenant integrale; la fonte contempla contatto, tutela del segnalante, ambito e misure di enforcement. [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

### A-03 — Log e snapshot possono contenere dati sensibili senza una politica di conservazione

**Riferimenti:** `tools/runner.mjs:63-67,88-98`; `tools/telemetry.mjs:164-176,202-209`; `README.md:275`; `setup_skill.md:394-398`.

Il runner conserva il comando completo e tutti gli stdout/stderr senza redazione. La telemetria replica le ultime 40 righe di ogni log in entrambi gli snapshot. Un token passato in CLI, un prompt riservato o un dato personale stampato dal processo finiscono quindi anche nella dashboard. I file non ricevono permessi restrittivi espliciti e i log crescono senza scadenza.

È un rischio di trattamento locale, **non un leak già presente nel repository**. Le esclusioni Git generate sono un buon presidio ma non proteggono backup, cartelle sincronizzate, file già tracciati o server HTTP. Il comando di apertura documentato non specifica il binding a loopback né una politica di esposizione dei file.

**Correzione:** documentare chiaramente quali dati sono registrati; evitare segreti negli argomenti; rendere disattivabile la registrazione del comando e definire redazione, rotazione/scadenza e permessi locali. Per una dashboard HTTP usare esplicitamente loopback, una directory dedicata e una configurazione che non esponga l'intero progetto. Verificare l'assenza di snapshot già versionati, non solo la presenza di `.gitignore`.

## MEDIO — miglioramenti

### M-01 — Segnali tutti tradotti in 143 e terminazione limitata al processo shell

**Riferimenti:** `tools/runner.mjs:115-135`.

`code !== null ? code : (signal ? 128 + 15 : 1)` restituisce 143 per `SIGINT`, `SIGTERM` e `SIGKILL`. La prova con eventi `close(null, signal)` conferma tutti e tre gli esiti; le convenzioni POSIX attese sono rispettivamente 130, 143 e 137. È positivo che l'uscita su segnale non diventi più 0.

Inoltre il runner invia il segnale solo al `child` avviato con shell; non gestisce esplicitamente l'albero dei discendenti o una scadenza dopo la richiesta di stop. Non è stato collaudato l'effettivo arresto di CLI reali su ciascun OS.

**Correzione:** mappare il segnale con le costanti OS o mantenere il segnale di terminazione secondo una politica documentata; gestire il ciclo di vita dell'albero processi per piattaforma e aggiungere prove reali SIGINT/SIGTERM su POSIX e interruzione su Windows.

### M-02 — Mock sintatticamente valido ma semanticamente errato fa cadere il banner

**Riferimenti:** `tools/quota-anthropic.mjs:41-55`; `tools/agy-quota-banner.mjs:20-44`.

Il sensore gestisce correttamente `{bad` con `source: "error"`, campi null ed exit 0. Tuttavia accetta `null`, array o oggetti con campi di tipo errato e li restituisce senza validazione.

Prove del consumatore:

- Mock `null`: `Cannot read properties of null (reading 'ok')` a `q.ok`.
- Mock `{"ok":false,"source":"unknown","note":42}`: `q.note.includes is not a function`.

La perdita del banner riguarda soprattutto configurazioni mock errate; non implica accesso remoto al processo. Anche `agy-checkpoint.mjs:11-12` accetta JSON `null` e poi dereferenzia `p.workspacePaths`.

**Correzione:** validare la struttura comune della quota, intervalli numerici e tipi; normalizzare payload non conformi a un oggetto errore. Rendere difensivi i consumatori e validare lo schema degli input hook. Aggiungere test per sintassi errata, `null`, array e campi di tipo errato.

### M-03 — Errori quota silenziosi, timeout incoerenti e reset ISO errato

**Riferimenti:** `tools/quota-anthropic.mjs:100,111-118,132-138`; `tools/agy-quota-banner.mjs:44`; `tools/telemetry.mjs:183-190`; `templates/dashboard.html.template:570-574`; `setup_skill.md:240`; `templates/DISPATCH.md.template:77`.

Il sensore restituisce `unavailable` per errore rete/schema, mentre il banner avvisa soltanto per `unknown`. Una prova con `source: "unavailable"` e nota `HTTP 401` produce il solo promemoria di ruolo. Il dispatcher può quindi interpretare l'assenza del semaforo come quota bassa o sensore disabilitato. Il setup promette inoltre `source: "stale"`, che il codice non emette.

La telemetria interrompe il sensore dopo 4 secondi, prima del timeout fetch di 5 secondi; il catch lascia l'oggetto iniziale `disabled` anche quando l'opt-in è attivo. Infine il sensore conserva `resets_at` e il banner supporta stringhe/data, ma la dashboard moltiplica sempre per 1000: un timestamp ISO produce `Reset 5h: Invalid Date`, confermato dalla prova.

**Correzione:** contratto unico per `disabled`, `unavailable`, `error`, `cache`, `live`; avviso esplicito se la misura non è disponibile; timeout gerarchicamente coerenti; parsing della data per tipo. Non equiparare assenza del banner a quota disponibile.

### M-04 — Cache quota globale e prevedibile nella directory temporanea

**Riferimenti:** `tools/quota-anthropic.mjs:19,59-64,78-80,129`.

`quota-anthropic-vibe.json` non è separata per account, non valida lo schema e accetta timestamp futuri perché controlla solo che la differenza sia inferiore al TTL. Un cambio account può riutilizzare la quota precedente. Su sistemi con directory temporanea condivisa, un altro utente potrebbe precreare il file o un link e alterare i dati/le scritture, secondo i permessi OS. Questo scenario non è stato sfruttato né riprodotto.

**Correzione:** cache in directory privata dell'utente, permessi appropriati, isolamento per identità senza salvare il token, validazione schema e `0 <= age < TTL`; scrittura atomica e protezione da link. Il token OAuth non è salvato nella cache attuale.

### M-05 — Il checkpoint sceglie il primo task in corso, non il task attivo

**Riferimenti:** `tools/agy-checkpoint.mjs:33-43,49-66`; `tools/runner.mjs:85`; `templates/DISPATCH.md.template:25`.

La scansione si ferma al primo `IN CORSO`, ignorando `TASK_ATTIVO` e l'identità del chiamante. Se resta un task interrotto e ne viene eseguito un altro, i «Fatti» possono essere attribuiti al task sbagliato. La prova con due task e `TASK_ATTIVO=T-002` scrive `T-001.md`.

Anche l'elenco `git status` è globale al workspace e non dimostra che quei file siano stati modificati dal proprietario di quel task. La regola documentale che invita a credere sempre ai «Fatti» amplifica la falsa attribuzione.

**Correzione:** selezione esplicita e validata del task, errore/nessuna scrittura in caso di ambiguità, distinzione tra stato globale del working tree ed evidenza dell'attività specifica. Collaudare più task e formato Markdown dello stato, che la telemetria accetta ma il checkpoint non riconosce.

### M-06 — Errori del file di log non gestiti prima dell'avvio del comando

**Riferimenti:** `tools/runner.mjs:56-63,81-113`.

Gli errori di creazione directory sono ignorati; lo stream non ha un listener `error`. Una destinazione non scrivibile, un componente che è un file o un disco pieno può causare un'eccezione non gestita mentre il processo esecutore è già stato avviato. Il listener su `child` non gestisce gli errori dello stream.

**Correzione:** aprire e verificare il log prima di lanciare il comando; gestire gli errori I/O con una politica esplicita di arresto o continuazione senza log. Finalizzare una sola volta anche se arrivano sia `error` sia `close` del child. Finding da lettura del codice, non da simulazione di disco pieno.

### M-07 — Telemetria legge log interi e il runner ignora la backpressure

**Riferimenti:** `tools/telemetry.mjs:169-176`; `tools/runner.mjs:75-79,88-98`.

Per mostrare 40 righe vengono letti e spezzati tutti i log, ogni 2 secondi per runner. Con sessioni lunghe questo aumenta I/O, CPU e memoria in proporzione all'intera storia. Le scritture su stream ignorano il ritorno di `write()`, quindi un output veloce e un disco lento possono accumulare buffer.

**Correzione:** lettura limitata dalla coda, limite in byte oltre che in righe, rotazione, raccolta condivisa o incrementalità e gestione `drain`. Verificare con log grandi e output sostenuto. Nessun benchmark prestazionale è stato eseguito.

### M-08 — Snapshot non atomici e successo restituito anche quando la scrittura fallisce

**Riferimenti:** `tools/telemetry.mjs:202-223`.

`state.json` e `state.js` vengono sovrascritti direttamente. Il polling può leggere un file parziale; più produttori possono competere. Gli errori sono ignorati e la CLI può comunque emettere `ok: true`, benché la dashboard conservi uno stato vecchio. Il heartbeat torna verde sul rendering senza un controllo dell'età dello snapshot.

**Correzione:** scrittura su file temporaneo e rename per ciascuno snapshot, coordinamento dei produttori, errori di persistenza osservabili e indicatore di stato scaduto. Mantenere esplicita la scelta se un errore telemetrico debba o meno interrompere il lavoro.

### M-09 — Node 18 compatibile per fallback, ma baseline di supporto da aggiornare

**Riferimenti:** `package.json:30-32`; `.github/workflows/ci.yml:23`; badge dei README.

Il codice non dipende obbligatoriamente da `import.meta.dirname`; il fallback è corretto. Alla data della revisione, però, Node 18 e 20 sono EOL, mentre Node 22 e 24 sono LTS. La CI include 18/20/22 ma non 24. [Calendario ufficiale Node.js](https://nodejs.org/en/about/previous-releases).

**Correzione:** distinguere compatibilità legacy da runtime raccomandato e aggiungere Node 24 alla matrice. Se si mantiene `>=18.0.0`, precisare che il supporto funzionale non equivale a manutenzione di sicurezza del runtime; testare la versione minima dichiarata o restringere il minimo alla versione effettivamente verificata.

### M-10 — La suite non copre i casi di sicurezza e non è completamente isolata

**Riferimenti:** tutti i file `tools/test/*.mjs`; `.github/workflows/ci.yml:35`.

Mancano test dashboard, traversal, segnali, modalità argv del runner, mock malformato e schema errato, errori I/O e cache ostile. I test quota leggono una cache dal nome globale: quello con credenziali inesistenti può restituire `cache` se un sensore ha scritto una cache fresca. Diversi altri test ereditano le variabili quota del chiamante e possono attivare letture/chiamate non previste.

La suite è passata con opt-in disabilitato esplicitamente nel processo di test; ciò non dimostra che sia indipendente da qualsiasi ambiente locale. Non è presente un timeout di job personalizzato e diversi sottoprocessi nei test non hanno timeout.

**Correzione:** fixture isolate per HOME/cache e variabili quota, timeout, test di regressione dei finding. Mantenere separati test unitari offline e integrazioni live opzionali.

### M-11 — Risoluzione dei path relativi nel gate dipende dalla cwd dell'hook

**Riferimenti:** `tools/agy-gate.mjs:33-47`; `setup_skill.md:365`.

Il gate risolve i path relativi con `resolve(pulito)`, quindi rispetto alla propria cwd. Il setup dichiara che gli hook lavorano in `.agents/`: se il comando controllato viene eseguito dalla root del progetto, le due basi divergono. Per esempio `../outside` può essere risolto dal gate dentro il repository e dal comando fuori. La corrispondenza reale delle cwd nell'integrazione AGY non è stata verificata: il rischio è condizionato a questa differenza, esplicitamente suggerita dalla documentazione locale.

**Correzione:** usare la directory di esecuzione effettiva del comando; se sconosciuta, non prendere una decisione permissiva per cancellazioni relative ambigue. Coprire questo caso e i path con spazi nei test. I bypass intenzionali di una regex shell restano fuori dal perimetro dichiarato del guardrail e non sono presentati come evasione di una sandbox.

## BASSO — nice to have

### B-01 — Rendere immutabili le Actions utilizzate

**Riferimenti:** `.github/workflows/ci.yml:27,30`.

`actions/checkout@v4` e `actions/setup-node@v4` usano tag mobili. Fissare SHA completi verificati e automatizzare gli aggiornamenti riduce il rischio supply-chain; valutare `persist-credentials: false` perché i test non richiedono push. L'attuale token read-only limita già l'impatto. [Guida di sicurezza GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use).

### B-02 — Completare le regole di rendering dei template e delle directory personalizzate

**Riferimenti:** `templates/dashboard.html.template:6,367-368`; `templates/hooks.json.template:30`; `tools/agy-quota-banner.mjs:48`; `setup_skill.md:365,438`.

La generazione è affidata all'agente: non è specificato l'escape per contesto HTML, JSON e shell. Nome progetto e directory vengono inseriti in HTML grezzo; percorsi Windows richiedono escaping JSON, non una semplice sostituzione testuale. Nell'installazione su progetto esistente il passo 3 menziona solo il nome progetto, lasciando scoperto `DIR_COORD`. Inoltre l'hook banner non riceve `--coord` e usa `.coord` se manca la variabile d'ambiente, anche quando gli altri hook sono configurati diversamente.

Definire serializzazione/escape per contesto e verificare i file generati con nomi contenenti `&`, virgolette e percorsi con spazi. Propagare coerentemente la directory scelta. Non è stata dimostrata una specifica generazione malevola da parte dell'agente.

### B-03 — Allineare promesse documentali, stati e perimetro privacy

**Riferimenti:** `README.md:282`; `README.en.md:20-22`; `setup_skill.md:202-218,407-413`; `templates/TASK.md.template:7`.

La frase assoluta «Nessun codice, conversazione o dato di progetto viene mai trasmesso» va circoscritta agli strumenti di telemetria del framework: il protocollo stesso distingue i fornitori a cui viene affidato il lavoro. La promessa inglese di non fermarsi mai per quota va conciliata con «nessuna sostituzione, attendere il reset». Il setup prima assegna a Claude implementazione e poi vieta al coordinatore qualsiasi modifica applicativa: chiarire come operare quando non ci sono esecutori. Infine `CHIUSO` è riconosciuto da codice/README ma manca dall'elenco degli stati nel template task.

Queste incoerenze non dimostrano un invio occulto di dati; rendono però meno prevedibile il comportamento degli agenti e la comprensione degli utenti.

## INFO — punti di forza

### I-01 — Nessun leak privato identificato nello snapshot pubblicabile

Nessuna corrispondenza dei due identificativi privati e del percorso utente indicati nella richiesta, né dei nomi privati noti cercati come controllo aggiuntivo, prima della creazione di questo report. Lettura completa senza altri nomi privati riconoscibili. Nessuna credenziale individuata dai pattern esaminati.

Le presenze di Alessandro Carducci in autore/copyright e dell'account GitHub nei link del progetto sono legittime attribuzioni pubbliche. L'unico commit usa un indirizzo GitHub `noreply`. Percorsi come `C:/dev/progetto`, `C:/dev/x`, `$HOME` e `%USERPROFILE%` sono esempi generici, non path personali da eliminare. Restano i limiti euristici dichiarati sopra.

### I-02 — Traversal attraverso taskId già mitigato

`tools/runner.mjs:42-44,62` rimuove punti, slash, backslash e altri caratteri estranei alla allowlist. La prova con `../../outside` produce `.coord/logs/outside.log`. Un ID composto solo da caratteri eliminati diventa `generale`.

Questo copre il traversal lessicale dell'ID, non promette isolamento da symlink o da un `--coord` esterno intenzionale. La configurabilità di `--coord` è una scelta esplicita, non un bypass della sanitizzazione. Come hardening futuro si possono rifiutare ID invalidi invece di trasformarli, per evitare collisioni, e limitarne la lunghezza.

### I-03 — Fallback Node 18 applicato uniformemente

In `telemetry.mjs`, `agy-quota-banner.mjs` e nei cinque test che usano `import.meta.dirname` compare sempre:

```js
import.meta.dirname ?? dirname(fileURLToPath(import.meta.url))
```

Non ci sono usi non protetti. `import.meta.url` e la conversione URL/percorso sono coerenti con gli ES modules di Node 18. [Documentazione ESM Node 18](https://nodejs.org/download/release/v18.20.8/docs/api/esm.html#importmetaurl). L'esecuzione della matrice resta da verificare nel suo ambiente.

### I-04 — CI con privilegi minimi e cancellazione dei job superati

Il workflow usa `permissions: contents: read`, gruppo `${{ github.workflow }}-${{ github.ref }}` e `cancel-in-progress: true`. Esegue i test su tre sistemi operativi e tre versioni Node, senza deploy, publish, segreti espliciti o `pull_request_target`. L'esistenza di questa matrice è verificata nel file; il suo esito remoto non è stato assunto.

### I-05 — Quota opt-in effettiva e documentata

Senza `VIBE_ANTHROPIC_QUOTA=1` e senza mock, il sensore termina prima di leggere cache/credenziali o effettuare fetch. La telemetria evita persino il lancio del sensore nel caso disabilitato. L'unico endpoint live nel codice è HTTPS Anthropic; il token è usato nell'header e non è incluso nel risultato/cache. Non c'è codice di scansione delle conversazioni.

L'opt-in è descritto in entrambi i documenti specificamente richiesti, nei README, in `SECURITY.md` e nel sensore. Il JSON mock sintatticamente invalido è già gestito senza crash dal sensore stesso.

### I-06 — Superficie contenuta e protocollo di consegna verificabile

Solo standard library Node nei tool, nessuna dipendenza npm runtime, nessuno script di installazione, nessuna CDN nella dashboard. Licenza MIT e metadati coerenti; guida contributori, policy sicurezza, codice di condotta e README inglese presenti. Ruoli, ownership dei file, handover e verifica prima di `INTEGRATO` sono definiti. `SECURITY.md` dichiara correttamente che il gate è un presidio cooperativo, non una sandbox per codice ostile.

## Piano suggerito prima della pubblicazione

1. Chiudere C-01 con validazione stato e test browser di regressione.
2. Separare shell esplicita e argv nel runner; pubblicare un contatto riservato concreto; chiarire trattamento e accesso ai log.
3. Aggiungere test su segnali, schema mock, quota non disponibile e selezione checkpoint; correggere i relativi difetti.
4. Verificare CI anche su Node 24 e rieseguire la matrice prima di presentare la compatibilità multipiattaforma come collaudata.
5. Dopo le modifiche, ripetere scansione privacy e verifica dell'insieme esatto di file da pubblicare, includendo il presente report se si decide di versionarlo.

## Inventario completo dei file letti

```text
.gitattributes
.gitignore
.github/workflows/ci.yml
CODE_OF_CONDUCT.md
CONTRIBUTING.md
LICENSE
README.en.md
README.md
SECURITY.md
SKILL.md
package.json
setup_skill.md
templates/AGENTS.md.template
templates/AGENT_ROLE.md.template
templates/CURRENT_SPRINT.md.template
templates/DECISIONS.md.template
templates/DISPATCH.md.template
templates/HANDOVER.md.template
templates/PROJECT.md.template
templates/TASK.md.template
templates/dashboard.html.template
templates/hooks.json.template
templates/multiagent-rule.md.template
tools/agy-checkpoint.mjs
tools/agy-gate.mjs
tools/agy-quota-banner.mjs
tools/quota-anthropic.mjs
tools/runner.mjs
tools/telemetry.mjs
tools/test/agy-checkpoint.test.mjs
tools/test/agy-gate.test.mjs
tools/test/agy-quota-banner.test.mjs
tools/test/quota-anthropic.test.mjs
tools/test/runner.test.mjs
tools/test/telemetry.test.mjs
tools/test/fixtures/T-999.md
```

La revisione non ha modificato il codice applicativo, i test o la configurazione. L'unico artefatto da consegnare è questo report.
