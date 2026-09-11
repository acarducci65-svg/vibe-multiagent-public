#!/usr/bin/env node
// Motore di telemetria: scansiona .coord/ e genera .coord/state.json per la Control Room Dashboard.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, isAbsolute } from "node:path";

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
      const mStato = txt.match(/Stato:\s*(.+)$/m);
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
          const mStato = raw.match(/^Stato:\s*([^\r\n]+)/m);
          const mProprietario = raw.match(/^Proprietario:\s*([^\r\n]+)/m);
          const mFile = raw.match(/## File riservati\s+([\s\S]*?)(?=##|$)/m);
          const mStoPer = raw.match(/^- Sto per:\s*([^\r\n]+)/m);
          const mFatti = raw.match(/^- Fatti:\s*([^\r\n]+)/m);

          const statoRaw = mStato ? mStato[1].trim() : "PRONTO";
          const mMatchStato = statoRaw.match(/^(PRONTO|IN CORSO|CONSEGNATO|INTEGRATO|SOSPESO|CHIUSO)\b/i);
          const stato = mMatchStato ? mMatchStato[1].toUpperCase() : (statoRaw ? "SCONOSCIUTO" : "PRONTO");
          const statoEsteso = statoRaw;

          if (stato === "INTEGRATO" || stato === "CHIUSO") completatiCount++;
          if (stato === "IN CORSO") inCorsoCount++;

          tasks.push({
            id,
            titolo: mTitolo ? mTitolo[1].trim() : id,
            stato,
            statoEsteso,
            proprietario: mProprietario ? mProprietario[1].trim() : "Non assegnato",
            fileRiservati: mFile ? mFile[1].trim().split("\n").map((l) => l.replace(/^[-*]\s*/, "").trim()).filter(Boolean) : [],
            stoPer: mStoPer ? mStoPer[1].trim() : "",
            fatti: mFatti ? mFatti[1].trim() : "",
          });
        } catch {}
      }
    } catch {}
  }

  milestone.totale = tasks.length;
  milestone.completamento = completatiCount;

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
    }
  }

  // Verifica attività recente del Coordinatore (ultimi 15 minuti)
  // Limitata a CURRENT_SPRINT.md e DECISIONS.md (file propri del coordinamento)
  // e attiva solo se nessun esecutore è attualmente 'running'
  const coordinatorAgent = agents.find((a) => a.name === coordinatorName);
  const esecutoriAttivi = agents.some((a) => a.status === "running");

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

  // 4. Scansione dei log recenti da .coord/logs/
  const dirLogs = join(dirCoord, "logs");
  const logs = {};
  if (existsSync(dirLogs)) {
    try {
      const logFiles = readdirSync(dirLogs).filter((f) => f.endsWith(".log"));
      for (const lf of logFiles) {
        try {
          const lPath = join(dirLogs, lf);
          const content = readFileSync(lPath, "utf8");
          const righe = content.split(/\r?\n/).filter(Boolean);
          const taskId = lf.replace(/\.log$/, "");
          logs[taskId] = righe.slice(-40); // Ultime 40 righe
        } catch {}
      }
    } catch {}
  }

  // 5. Quota Anthropic se disponibile
  let quota = { ok: false, source: "unknown", fiveHourPct: null, sevenDayPct: null, resetsAt: null };
  try {
    const scriptQuota = join(import.meta.dirname, "quota-anthropic.mjs");
    if (existsSync(scriptQuota)) {
      quota = JSON.parse(execFileSync(process.execPath, [scriptQuota], { encoding: "utf8", timeout: 4000 }));
    }
  } catch {}

  const telemetry = {
    updatedAt: new Date().toISOString(),
    milestone,
    agents,
    tasks,
    logs,
    quota,
  };

  try {
    const jsonStr = JSON.stringify(telemetry, null, 2);
    writeFileSync(join(dirCoord, "state.json"), jsonStr, "utf8");
    writeFileSync(
      join(dirCoord, "state.js"),
      `window.__VIBE_STATE__ = ${jsonStr};\nif (typeof window.__onVibeStateLoaded === "function") { window.__onVibeStateLoaded(window.__VIBE_STATE__); }\n`,
      "utf8"
    );
  } catch {}

  return telemetry;
}

// Se invocato direttamente da CLI
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const customIdx = process.argv.indexOf("--coord");
  const customCoord = customIdx !== -1 && process.argv[customIdx + 1] ? process.argv[customIdx + 1] : null;
  const res = raccogliTelemetria(process.cwd(), customCoord);
  if (res) {
    process.stdout.write(JSON.stringify({ ok: true, updatedAt: res.updatedAt, tasksCount: res.tasks.length }));
  } else {
    process.stdout.write(JSON.stringify({ ok: false, error: "Cartella coordinamento non trovata" }));
  }
}
