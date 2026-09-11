# Policy di Sicurezza (Security Policy)

## 🔒 Principi di Sicurezza e Privacy

Il framework **vibe-multiagent** è progettato secondo principi rigorosi di privacy locale e trasparenza per sviluppatori:

1. **Esecuzione 100% Locale**: Nessun codice sorgente, specifica di progetto, prompt o file generato viene trasmesso a server di telemetria di terze parti o proprietari del framework.
2. **Nessun Tracking Nascosto**: La Control Room e gli strumenti di telemetria (`telemetry.mjs`, `runner.mjs`) generano snapshot JSON esclusivamente all'interno della cartella di coordinamento del progetto locale (`.coord/state.json`).

---

## 🔑 Sensore di Quota Anthropic (`tools/quota-anthropic.mjs`)

Per garantire la massima sicurezza e trasparenza:
- **Disabilitato di Default**: Il sensore è inattivo per impostazione predefinita e non effettua alcuna chiamata di rete né accede a file di credenziali.
- **Opt-In Consapevole**: Può essere attivato impostando la variabile d'ambiente `VIBE_ANTHROPIC_QUOTA=1`.
- **Perimetro di Accesso**: Se abilitato, lo script legge unicamente l'OAuth `accessToken` generato in locale dalla CLI ufficiale di Claude (`~/.claude/.credentials.json`) per interrogare l'endpoint `https://api.anthropic.com/api/oauth/usage` al solo scopo di calcolare la quota token residua (finestre 5h e 7d) e prevenire interruzioni improvvise dei task.
- **Nessuna Scansione Conversazioni**: Lo script non apre, non analizza e non scansiona mai file di conversazioni o transcript di altri progetti.

---

## 🛡️ Modello di Difesa e Presidi (`tools/agy-gate.mjs`)

L'hook `agy-gate.mjs` funge da **guardrail operativo anti-distrazione** per il lavoro cooperativo fra agenti. Impedisce comandi accidentali di `git push`, deploy in produzione, migrazioni database non coordinate o installazioni globali non autorizzate dal Direttore dei Lavori umano.

> [!NOTE]
> `agy-gate` è un presidio di coordinamento di cantiere, non una sandbox di isolamento ostile. Per l'esecuzione di codice non fidato, utilizzare sempre ambienti virtualizzati o container isolati.

---

## 📢 Segnalazione di Vulnerabilità

Se riscontri un problema di sicurezza o un potenziale leak di dati nel framework:
1. Ti invitiamo a **non aprire una issue pubblica**.
2. Invia una segnalazione privata via GitHub Security Advisory oppure contatta direttamente il maintainer all'indirizzo email indicato sul profilo GitHub.
3. Riceverai un riscontro entro 48 ore lavorative con il piano di risoluzione.
