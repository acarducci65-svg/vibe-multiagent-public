# Guida per Registrare la Clip Dimostrativa (Privacy 100% Garantita)

Questa cartella `demo/` contiene una **Control Room di esempio preconfigurata** con dati fittizi realistici (*Nexus Cloud Platform*). È stata concepita appositamente per permetterti di catturare screenshot, video o GIF ad alto impatto per GitHub, Reddit, X e LinkedIn **senza esporre alcun dato reale o personale**.

---

## 1. Avvia la Demo

Fai doppio clic sul file:
```cmd
demo\apri-demo.cmd
```
Oppure apri direttamente `demo/dashboard.html` nel tuo browser preferito (Chrome, Edge, Firefox).

*   La dashboard si aprirà con 5 task fittizi, indicatori di quota e la flotta agenti attiva.
*   Nel **Live Terminal Stream** in basso, vedrai i log di `Claude Code CLI` che scorrono in tempo reale simulando un'attività di coding autentica!

---

## 2. Come Registrare la Clip

### Metodo A — Strumento di Cattura di Windows (Più Veloce, già installato)
1. Premi sulla tastiera: **`Win + Shift + S`**
2. In alto seleziona l'icona della **Videocamera** (Registra video).
3. Traccia il rettangolo di selezione **esclusivamente sulla pagina web della Dashboard** (escludendo barra delle applicazioni di Windows, URL e schede del browser).
4. Clicca **Avvia** e registra per **12–15 secondi** seguendo lo storyboard qui sotto.
5. Clicca **Stop** e salva il file `.mp4`.

---

### Metodo B — ScreenToGif (Consigliato per GIF animate leggere su GitHub)
1. Scarica la versione portabile gratuita da: [screentogif.com](https://www.screentogif.com/)
2. Avvia `ScreenToGif` e ridimensiona la cornice trasparente attorno alla Dashboard.
3. Imposta **15 o 20 FPS** (ottimo equilibrio tra fluidità e peso ridotto).
4. Premi **F7 (Registra)**, attendi 12–15 secondi e premi **F8 (Stop)**.
5. Nell'editor integrato puoi ritagliare i fotogrammi vuoti all'inizio e salvare come `.gif` (peso ottimale: < 3–5 MB).

---

## 3. Storyboard Consigliato per i 15 Secondi di Clip

1. **Secondi 00 – 04**:
   Inquadra la testata della Control Room con la barra di completamento (60%), lo stato della flotta (`Claude Code: running`, `Codex CLI: idle`, `Antigravity: coordinating`) e i grafici delle quote Anthropic/OpenAI/Google.
2. **Secondi 05 – 10**:
   Porta l'attenzione sulla sezione in basso **📺 Live Terminal Stream**: mostra il log che si arricchisce in tempo reale con le righe `[Claude] 🔧 Tool: ...`, `[Claude] ⏱️ Quota: ...`, `[Claude] 🚀 Stato: CONSEGNATO`.
3. **Secondi 11 – 15**:
   Fai clic su una delle card dei task (es. `T-002` o `T-003`) per mostrare la modale con l'handover formale, i file riservati e i criteri di accettazione.

---

## 4. Come Aggiungere la Clip nel `README.md`

Una volta salvata la GIF (ad esempio come `demo/control-room-demo.gif`), basterà inserire in cima al `README.md`:

```markdown
<div align="center">
  <img src="demo/control-room-demo.gif" alt="Vibe-Multiagent Control Room" width="100%">
</div>
```
