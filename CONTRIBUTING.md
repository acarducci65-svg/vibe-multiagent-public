# Contribuire a vibe-multiagent

Grazie per l'interesse a contribuire a **vibe-multiagent**!

## Linee Guida per i Contributi

1. **Focus sull'Affidabilità Empirica**: Il protocollo è nato sul campo. Ogni nuova regola, hook o modifica deve essere supportata da un'esigenza concreta di coordinamento e prevenire errori reali.
2. **Standard Zero-Dipendenze**: Gli script in `tools/` devono utilizzare esclusivamente la standard library nativa di Node.js (senza dipendenze esterne in `dependencies`).
3. **Suite di Test Deterministica**: Prima di sottomettere una Pull Request, assicurati che la suite di test passi al 100%:
   ```bash
   npm test
   ```
4. **Nessun Leak di Dati Personali**: Non includere percorsi assoluti specifici della tua macchina, credenziali o riferimenti a progetti privati.

## Processo di Pull Request

1. Fai un fork del repository e crea un branch dedicato (`feature/nome-funzionalità` o `fix/nome-bug`).
2. Scrivi test per le nuove funzionalità introdotte in `tools/test/`.
3. Assicurati che i commit seguano la convenzione Conventional Commits (es. `feat: ...`, `fix: ...`, `docs: ...`).
4. Apri la Pull Request descrivendo motivazione, modifiche ed esito dei test.
