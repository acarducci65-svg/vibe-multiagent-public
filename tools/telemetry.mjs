#!/usr/bin/env node
// Motore di telemetria: scansiona .coord/ e genera .coord/state.json per la Control Room Dashboard.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync, openSync, readSync, closeSync, renameSync, watch } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, isAbsolute, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

export function canonicalTaskId(stem) {
  if (!stem) return "";
  const m = /^(TASK-\d+|T-\d+)(?=-|$)/i.exec(stem);
  return m ? m[1].toUpperCase() : stem.toUpperCase();
}

export function raccogliTelemetria(radice = process.cwd(), customCoord = null) {
  const coordNome = customCoord ?? process.env.DIR_COORD ?? ".coord";
  const dirCoord = isAbsolute(coordNome) ? coordNome : join(radice, coordNome);

  if (!existsSync(dirCoord)) {
    return null;
  }

  // 1. Milestone da CURRENT_SPRINT.md
  let milestone = { titolo: "Nessuna milestone attiva", stato: "Pianificata", completamento: 0, totale: 0 };
  const pathSprint = join(dirCoord, "CURRENT_SPRINT.md");
  if (existsSync(pathSprint)) {
    try {
      const txt = readFileSync(pathSprint, "utf8");
      const mTitolo = txt.match(/^#\s+(.+)$/m);
      if (mTitolo) milestone.titolo = mTitolo[1].trim();
      const mStato = txt.match(/^[\s*-]*\**Stato[\*:]*\s*:?\s*([^\r\n]+)/im);
      if (mStato) milestone.stato = mStato[1].replace(/\*\*/g, "").trim();
    } catch {}
  }

  // 2. Scansione dei task
  const dirTasks = join(dirCoord, "tasks");
  const tasks = [];
  let inCorsoCount = 0;
  let completatiCount = 0;

  if (existsSync(dirTasks)) {
    try {
      const files = readdirSync(dirTasks).filter((f) => f.endsWith(".md")).sort();
      for (const f of files) {
        try {
          const fullPath = join(dirTasks, f);
          const raw = readFileSync(fullPath, "utf8");
          const id = f.replace(/\.md$/, "");
          const mTitolo = raw.match(/^#\s+([^\r\n]+)/m);
          const mStato = raw.match(/^[\s*-]*\**Stato[\*:]*\s*:?\s*([^\r\n]+)/im);
          const mProprietario = raw.match(/^[\s*-]*\**Proprietario[\*:]*\s*:?\s*([^\r\n]+)/im);
          const mRevisore = raw.match(/^[\s*-]*\**Revisore[\*:]*\s*:?\s*([^\r\n]+)/im);
          const mIntegratore = raw.match(/^[\s*-]*\**Integratore[\*:]*\s*:?\s*([^\r\n]+)/im);
          const mFile = raw.match(/(?:##\s*)?File riservati:?\s*([\s\S]*?)(?=(?:\n##|\n[A-Z][a-z]+:|$))/i);
          const mStoPer = raw.match(/^[\s*-]*\**Sto per[\*:]*\s*:?\s*([^\r\n]+)/im);
          const mFatti = raw.match(/^[\s*-]*\**Fatti[\*:]*\s*:?\s*([^\r\n]+)/im);
          const mPunto = raw.match(/##\s*Punto di ripresa\s+([\s\S]*?)(?=\n##|$)/i);
          const mVerifiche = raw.match(/##\s*Verifiche eseguite\s+([\s\S]*?)(?=\n##|$)/i);

          const statoRaw = (mStato ? mStato[1].trim() : "PRONTO").replace(/\*\*/g, "").trim();
          const mMatchStato = statoRaw.match(/^(PRONTO|IN CORSO|CONSEGNATO|IN VERIFICA|INTEGRATO|COMPLETATO|SOSPESO|CHIUSO)\b/i);
          let stato = mMatchStato ? mMatchStato[1].toUpperCase() : (statoRaw ? "SCONOSCIUTO" : "PRONTO");
          if (stato === "COMPLETATO") stato = "INTEGRATO";
          const statoEsteso = statoRaw;

          if (stato === "INTEGRATO" || stato === "CHIUSO") completatiCount++;
          if (stato === "IN CORSO" || stato === "IN VERIFICA") inCorsoCount++;

          const proprietario = (mProprietario ? mProprietario[1].trim() : "Non assegnato").replace(/\*\*/g, "").trim();
          const revisore = (mRevisore ? mRevisore[1].trim() : "").replace(/\*\*/g, "").trim();
          const integratore = (mIntegratore ? mIntegratore[1].trim() : "").replace(/\*\*/g, "").trim();

          let fattiDesc = "";
          if (mFatti) fattiDesc = mFatti[1].trim().replace(/\*\*/g, "");
          if (mPunto) {
            const p = mPunto[1].trim();
            fattiDesc = fattiDesc ? `${fattiDesc}\n\n${p}` : p;
          }
          if (mVerifiche) {
            const v = mVerifiche[1].trim();
            fattiDesc = fattiDesc ? `${fattiDesc}\n\nVerifiche:\n${v}` : v;
          }

          const fileRiservati = mFile
            ? mFile[1]
                .trim()
                .split("\n")
                .map((l) => l.replace(/^[-*]\s*/, "").replace(/[`"]/g, "").trim())
                .filter((l) => Boolean(l) && !l.startsWith("#") && !l.includes(":"))
            : [];

          tasks.push({
            id,
            titolo: mTitolo ? mTitolo[1].trim() : id,
            stato,
            statoEsteso,
            proprietario,
            revisore,
            integratore,
            fileRiservati,
            stoPer: mStoPer ? mStoPer[1].trim().replace(/\*\*/g, "") : "",
            fatti: fattiDesc,
          });
        } catch {}
      }
    } catch {}
  }

  milestone.totale = tasks.length;
  milestone.completamento = completatiCount;
  milestone.inCorso = inCorsoCount;

  // 3. Flotta agenti
  const isAmbienteB = existsSync(join(dirCoord, "DISPATCH.md"));
  const coordinatorName = isAmbienteB ? "Antigravity AGY" : "Claude Code";

  const AGENT_ALIASES = [
    { name: "Claude Code", regex: /\bclaude\b/i },
    { name: "Codex CLI", regex: /\bcodex\b/i },
    { name: "Antigravity AGY", regex: /\b(agy|antigravity)\b/i },
  ];

  function trovaProprietario(proprietario) {
    if (!proprietario) return null;
    let primoNome = null;
    let primoIndice = Infinity;

    for (const ag of AGENT_ALIASES) {
      const match = proprietario.match(ag.regex);
      if (match && match.index !== undefined && match.index < primoIndice) {
        primoIndice = match.index;
        primoNome = ag.name;
      }
    }
    return primoNome;
  }

  const agents = [
    { name: "Claude Code", defaultRole: "Coordinatore / Integratore", status: "idle", currentTask: null },
    { name: "Codex CLI", defaultRole: "Esecutore", status: "idle", currentTask: null },
    { name: "Antigravity AGY", defaultRole: "Dispatcher & Presidi", status: "idle", currentTask: null },
  ];

  for (const t of tasks) {
    if (t.stato === "IN CORSO") {
      const nomeAgente = trovaProprietario(t.proprietario);
      if (nomeAgente) {
        const ag = agents.find((a) => a.name === nomeAgente);
        if (ag) {
          ag.status = "running";
          ag.currentTask = t.id;
        }
      }
    } else if (t.stato === "IN VERIFICA" || t.stato === "CONSEGNATO") {
      // In fase di verifica o consegna, l'esecutore originario ha terminato la bozza:
      // l'agente attivo è il Revisore designato (o l'agente complementare naturale per peer-review),
      // oppure l'Integratore / Coordinatore di ambiente.
      const nomeRevisore = trovaProprietario(t.revisore);
      const nomeIntegratore = trovaProprietario(t.integratore);
      const nomeProprietario = trovaProprietario(t.proprietario);

      // Risoluzione intelligente del revisore predefinito se non esplicitato:
      // - Se proprietario è Codex CLI -> peer review naturale affidata a Claude Code
      // - Se proprietario è Claude Code -> revisione/integrazione affidata ad Antigravity AGY
      // - Se proprietario è Antigravity AGY -> peer review affidata a Claude Code
      let defaultPeerReviewer = coordinatorName;
      if (nomeProprietario === "Codex CLI") {
        defaultPeerReviewer = "Claude Code";
      } else if (nomeProprietario === "Claude Code") {
        defaultPeerReviewer = "Antigravity AGY";
      } else if (nomeProprietario === "Antigravity AGY") {
        defaultPeerReviewer = "Claude Code";
      }

      const targetReviewer = nomeRevisore || nomeIntegratore || (t.stato === "IN VERIFICA" && nomeProprietario !== coordinatorName ? nomeProprietario : defaultPeerReviewer);

      if (targetReviewer) {
        const ag = agents.find((a) => a.name === targetReviewer);
        if (ag) {
          const labelAzione = t.stato === "IN VERIFICA" ? "Verifica" : "Review";
          if (ag.status === "idle") {
            ag.status = t.stato === "IN VERIFICA" ? "running" : "reviewing";
            ag.currentTask = `${t.id} (${labelAzione})`;
          } else if (ag.status === "reviewing" && ag.currentTask && !ag.currentTask.includes(t.id)) {
            ag.currentTask = `${ag.currentTask}, ${t.id}`;
          }
        }
      }
    }
  }

  // Se ci sono task avviati, consegnati o integrati, la milestone corrente è effettivamente in corso
  const haAttivita = inCorsoCount > 0 || completatiCount > 0 || tasks.some((t) => t.stato === "CONSEGNATO" || t.stato === "IN VERIFICA");
  if (haAttivita && (/^pianificat/i.test(milestone.stato))) {
    milestone.stato = "IN CORSO";
  }

  // Verifica attività recente del Coordinatore (ultimi 15 minuti)
  // Limitata a CURRENT_SPRINT.md e DECISIONS.md (file propri del coordinamento)
  // e attiva solo se nessun esecutore è attualmente 'running' o 'reviewing'
  const coordinatorAgent = agents.find((a) => a.name === coordinatorName);
  const esecutoriAttivi = agents.some((a) => a.status === "running" || a.status === "reviewing");

  if (coordinatorAgent && coordinatorAgent.status === "idle" && !esecutoriAttivi) {
    let ultimoTempoModifica = 0;
    const fileDaVerificare = [
      join(dirCoord, "CURRENT_SPRINT.md"),
      join(dirCoord, "DECISIONS.md"),
    ];

    for (const f of fileDaVerificare) {
      if (existsSync(f)) {
        try {
          const s = statSync(f);
          if (s.mtimeMs > ultimoTempoModifica) ultimoTempoModifica = s.mtimeMs;
        } catch {}
      }
    }

    const adesso = Date.now();
    const minutiDaUltimaModifica = (adesso - ultimoTempoModifica) / (1000 * 60);

    if (ultimoTempoModifica > 0 && minutiDaUltimaModifica <= 15) {
      coordinatorAgent.status = "coordinating";
      const taskPronti = tasks.filter((t) => t.stato === "PRONTO").length;
      const taskConsegnati = tasks.filter((t) => t.stato === "CONSEGNATO").length;

      if (taskConsegnati > 0) {
        coordinatorAgent.currentTask = `Verifica & Integrazione (${taskConsegnati} consegnati)`;
      } else if (taskPronti > 0) {
        coordinatorAgent.currentTask = `Coordinamento & Dispatching (${taskPronti} pronti)`;
      } else {
        coordinatorAgent.currentTask = "Pianificazione sprint / decisioni (attività recente)";
      }
    }
  }

  // Helper di decodifica universale per log (gestisce UTF-8, UTF-16LE da PowerShell redirect `>` e rimuove byte NUL)
  function decodificaBufferLog(buf) {
    if (!buf || buf.length === 0) return "";
    let content = "";
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
      content = buf.subarray(2).toString("utf16le");
    } else if (buf.length >= 4 && buf[1] === 0x00 && buf[3] === 0x00) {
      content = buf.toString("utf16le");
    } else if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      content = buf.subarray(3).toString("utf8");
    } else {
      content = buf.toString("utf8");
    }
    content = content.replace(/\u0000/g, "");
    // Correzione automatica mojibake tipici da console Windows (CP437/CP850/CP1252)
    return content
      .replace(/├¿/g, "è")
      .replace(/├®/g, "é")
      .replace(/├á/g, "à")
      .replace(/├í/g, "í")
      .replace(/├│/g, "ó")
      .replace(/├╣/g, "ù")
      .replace(/ÔÇÖ/g, "’")
      .replace(/â€™/g, "’")
      .replace(/â€œ/g, "“")
      .replace(/â€/g, "”")
      .replace(/â€”/g, "—")
      .replace(/â€“/g, "–")
      .replace(/Â·/g, "·");
  }

  // 4. Scansione dei log recenti da .coord/logs/ (file diretti o sottocartelle task, con limite a 64KB per file)
  const dirLogs = join(dirCoord, "logs");
  const logs = {};
  if (existsSync(dirLogs)) {
    try {
      const entries = readdirSync(dirLogs, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith(".log") || entry.name.endsWith(".txt"))) {
          try {
            const lPath = join(dirLogs, entry.name);
            const stat = statSync(lPath);
            const maxBytes = 64 * 1024;
            let rawBuf = null;
            if (stat.size <= maxBytes) {
              rawBuf = readFileSync(lPath);
            } else {
              const fd = openSync(lPath, "r");
              rawBuf = Buffer.alloc(maxBytes);
              readSync(fd, rawBuf, 0, maxBytes, stat.size - maxBytes);
              closeSync(fd);
            }
            const content = decodificaBufferLog(rawBuf);
            const righe = content.split(/\r?\n/).filter(Boolean);
            const taskId = entry.name.replace(/\.(log|txt)$/, "");
            logs[taskId] = righe.slice(-40); // Ultime 40 righe
          } catch {}
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          try {
            const subDir = join(dirLogs, entry.name);
            const subFiles = readdirSync(subDir).filter((f) => f.endsWith(".log") || f.endsWith(".txt"));
            const subRighe = [];
            for (const sf of subFiles) {
              try {
                const sp = join(subDir, sf);
                const stat = statSync(sp);
                if (stat.size <= 32 * 1024) {
                  const rawSub = readFileSync(sp);
                  const sc = decodificaBufferLog(rawSub);
                  subRighe.push(`--- [${sf}] ---`);
                  subRighe.push(...sc.split(/\r?\n/).filter(Boolean).slice(-20));
                }
              } catch {}
            }
            if (subRighe.length > 0) {
              logs[entry.name] = subRighe.slice(-40);
            }
          } catch {}
        }
      }
    } catch {}
  }

  // Associa i log ai task tramite ID canonico (evita falsi positivi di prefisso come TASK-01 vs TASK-018)
  for (const t of tasks) {
    if (!logs[t.id]) {
      const cId = canonicalTaskId(t.id);
      const matchLogKey = Object.keys(logs).find((k) => canonicalTaskId(k) === cId);
      if (matchLogKey) {
        logs[t.id] = logs[matchLogKey];
      }
    }
  }

  // Se un task non ha un file .log grezzo da runner.mjs, genera il registro di avanzamento strutturato
  for (const t of tasks) {
    if (!logs[t.id]) {
      const righeAudit = [
        `=== [${t.id}] ${t.titolo} ===`,
        `Stato: ${t.statoEsteso || t.stato} | Assegnatario: ${t.proprietario}`,
      ];
      if (t.fileRiservati && t.fileRiservati.length > 0) {
        righeAudit.push("", `--- File Riservati (${t.fileRiservati.length}) ---`);
        t.fileRiservati.forEach((rf) => righeAudit.push(`  • ${rf}`));
      }
      if (t.stoPer) {
        righeAudit.push("", `--- Intenzione Corrente ---`, `  ${t.stoPer}`);
      }
      if (t.fatti) {
        righeAudit.push("", `--- Avanzamento & Verifiche Eseguite ---`);
        t.fatti.split("\n").forEach((l) => righeAudit.push(`  ${l}`));
      } else {
        righeAudit.push("", `[Nessun log terminale registrato in .coord/logs/${t.id}.log. Usa tools/runner.mjs per catturare output stdout/stderr.]`);
      }
      logs[t.id] = righeAudit;
    }
  }

  // 5. Quota Anthropic se abilitata esplicitamente (opt-in) o in modalità mock
  let quota = { ok: false, source: "disabled", fiveHourPct: null, sevenDayPct: null, resetsAt: null };
  const quotaOptIn = process.env.VIBE_ANTHROPIC_QUOTA === "1" || Boolean(process.env.VIBE_MOCK_QUOTA_PAYLOAD);
  if (quotaOptIn) {
    try {
      const scriptQuota = join(__dirname, "quota-anthropic.mjs");
      if (existsSync(scriptQuota)) {
        const major = parseInt(process.versions.node.split(".")[0], 10);
        const minor = parseInt(process.versions.node.split(".")[1], 10);
        const usaSystemCa = major > 22 || (major === 22 && minor >= 15);
        const execArgs = usaSystemCa ? ["--use-system-ca", scriptQuota] : [scriptQuota];
        quota = JSON.parse(
          execFileSync(process.execPath, execArgs, {
            encoding: "utf8",
            timeout: 8000,
            env: { ...process.env, VIBE_ANTHROPIC_QUOTA: process.env.VIBE_ANTHROPIC_QUOTA || "0" },
          })
        );
      }
    } catch {}
  }

  const projectDir = isAbsolute(dirCoord) ? dirname(resolve(dirCoord)) : resolve(radice);
  const projectName = basename(projectDir);
  const coordRel = relative(projectDir, dirCoord) || coordNome;

  const telemetry = {
    updatedAt: new Date().toISOString(),
    projectName,
    coordDir: coordRel,
    milestone,
    agents,
    tasks,
    logs,
    quota,
  };

  try {
    const jsonStr = JSON.stringify(telemetry, null, 2);
    const jsStr = `window.__VIBE_STATE__ = ${jsonStr};\nif (typeof window.__onVibeStateLoaded === "function") { window.__onVibeStateLoaded(window.__VIBE_STATE__); }\n`;
    const tmpJson = join(dirCoord, `state.json.tmp.${process.pid}`);
    const tmpJs = join(dirCoord, `state.js.tmp.${process.pid}`);
    writeFileSync(tmpJson, jsonStr, "utf8");
    writeFileSync(tmpJs, jsStr, "utf8");
    try {
      renameSync(tmpJson, join(dirCoord, "state.json"));
      renameSync(tmpJs, join(dirCoord, "state.js"));
    } catch {
      writeFileSync(join(dirCoord, "state.json"), jsonStr, "utf8");
      writeFileSync(join(dirCoord, "state.js"), jsStr, "utf8");
    }
  } catch {}

  return telemetry;
}

// Se invocato direttamente da CLI
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const customIdx = process.argv.indexOf("--coord");
  const customCoord = customIdx !== -1 && process.argv[customIdx + 1] ? process.argv[customIdx + 1] : null;
  const isWatch = process.argv.includes("--watch") || process.argv.includes("-w");

  const aggiorna = () => {
    const res = raccogliTelemetria(process.cwd(), customCoord);
    if (res) {
      const runningAgents = res.agents?.filter((a) => a.status === "running") || [];
      const runningInfo = runningAgents.length > 0
        ? ` (${runningAgents.map((a) => `${a.name}: ${a.currentTask}`).join(", ")})`
        : "";
      return { ok: true, updatedAt: res.updatedAt, tasksCount: res.tasks.length, runningInfo };
    }
    return { ok: false, error: "Cartella coordinamento non trovata" };
  };

  const primo = aggiorna();
  process.stdout.write(JSON.stringify(primo) + "\n");

  if (isWatch && primo.ok) {
    const radice = process.cwd();
    const coordNome = customCoord ?? process.env.DIR_COORD ?? ".coord";
    const dirCoordAssoluta = isAbsolute(coordNome) ? coordNome : join(radice, coordNome);

    process.stderr.write(`[telemetry] Watcher avviato su ${dirCoordAssoluta} in tempo reale.\n`);
    let debounceTimer = null;
    const onChange = (evento, file) => {
      if (file && (file.startsWith("state.j") || file.includes(".tmp."))) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const r = aggiorna();
        if (r.ok) {
          process.stderr.write(`[telemetry ${new Date().toLocaleTimeString("it-IT")}] Aggiornato: ${r.tasksCount} task${r.runningInfo || ""}\n`);
        }
      }, 300);
    };

    try {
      watch(dirCoordAssoluta, { recursive: true }, onChange);
    } catch {
      const tasksDir = join(dirCoordAssoluta, "tasks");
      if (existsSync(tasksDir)) watch(tasksDir, onChange);
      watch(dirCoordAssoluta, onChange);
    }
  }
}

