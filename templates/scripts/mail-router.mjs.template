#!/usr/bin/env node
/**
 * Router di posta asincrona FIPA-lite per Vibe Multiagent (v2.1)
 * Pattern ispirato a Munder Difflin / Actor Model:
 * - Single-Writer-Per-File: ogni agente scrive solo nella propria cartella outbox/
 * - Atomic write: scrittura su file temporaneo (.tmp-<rand>) + rename
 * - Retry/Backoff per Windows / OneDrive su EPERM
 * - Smistamento deterministico da outbox a inbox del destinatario
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  unlinkSync
} from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

export const ATTI_PERMESSI = new Set([
  "request",   // Richiesta di esecuzione o informazione
  "inform",    // Notifica di stato o aggiornamento
  "propose",   // Proposta di approccio o modifica
  "query",     // Domanda specifica di chiarimento
  "agree",     // Accettazione della proposta
  "refuse",    // Rifiuto motivato della proposta
  "done"       // Conferma di completamento
]);

/**
 * Scrittura atomica sicura con retry su Windows
 */
export function atomicWriteJson(filePath, data, maxRetries = 5) {
  const tmpPath = `${filePath}.tmp-${randomBytes(6).toString("hex")}`;
  const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  writeFileSync(tmpPath, content, "utf8");

  let delay = 20;
  for (let i = 0; i < maxRetries; i++) {
    try {
      renameSync(tmpPath, filePath);
      return true;
    } catch (err) {
      if (i === maxRetries - 1) {
        try { unlinkSync(tmpPath); } catch {}
        throw err;
      }
      // Attesa breve per sbloccare eventuali lock transitori di filesystem
      const end = Date.now() + delay;
      while (Date.now() < end) {}
      delay *= 2;
    }
  }
  return false;
}

/**
 * Invia un messaggio inserendolo nella outbox dell'agente mittente
 */
export function inviaMessaggio({
  dirCoord,
  from,
  to,
  act = "inform",
  subject,
  body,
  taskId = null,
  dispatchId = null,
  requiresReply = false
}) {
  if (!ATTI_PERMESSI.has(act)) {
    throw new Error(`Atto di comunicazione non valido: ${act}. Ammessi: ${Array.from(ATTI_PERMESSI).join(", ")}`);
  }

  const safeFrom = String(from).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const safeTo = String(to).toLowerCase().replace(/[^a-z0-9_-]/g, "");

  const dirOutbox = join(dirCoord, "mail", "agents", safeFrom, "outbox");
  if (!existsSync(dirOutbox)) {
    mkdirSync(dirOutbox, { recursive: true });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const msgId = `msg-${ts}-${randomBytes(4).toString("hex")}`;

  const payload = {
    id: msgId,
    taskId: taskId || null,
    dispatchId: dispatchId || null,
    from: safeFrom,
    to: safeTo,
    act,
    subject: subject || "Nessun oggetto",
    body: body || "",
    requiresReply: Boolean(requiresReply),
    createdAt: new Date().toISOString()
  };

  const destFile = join(dirOutbox, `${msgId}.json`);
  atomicWriteJson(destFile, payload);
  return payload;
}

/**
 * Smista tutti i messaggi presenti nelle outbox verso le inbox dei destinatari
 */
export function smistaPosta(dirCoord) {
  const dirAgents = join(dirCoord, "mail", "agents");
  if (!existsSync(dirAgents)) return { consegnati: 0, errori: [] };

  const report = { consegnati: 0, errori: [] };
  const agents = readdirSync(dirAgents);

  for (const sender of agents) {
    const outbox = join(dirAgents, sender, "outbox");
    if (!existsSync(outbox)) continue;

    const outboxDone = join(outbox, ".done");
    if (!existsSync(outboxDone)) {
      mkdirSync(outboxDone, { recursive: true });
    }

    const files = readdirSync(outbox).filter((f) => f.endsWith(".json") && !f.startsWith("."));
    for (const f of files) {
      const srcFile = join(outbox, f);
      try {
        const raw = readFileSync(srcFile, "utf8");
        const msg = JSON.parse(raw);
        const recipient = String(msg.to).toLowerCase().replace(/[^a-z0-9_-]/g, "");

        const recipientInbox = join(dirAgents, recipient, "inbox");
        if (!existsSync(recipientInbox)) {
          mkdirSync(recipientInbox, { recursive: true });
        }

        const destFile = join(recipientInbox, f);
        atomicWriteJson(destFile, msg);

        // Archiviazione nella outbox/.done del mittente
        const archivedFile = join(outboxDone, f);
        atomicWriteJson(archivedFile, msg);
        try { unlinkSync(srcFile); } catch {}

        report.consegnati++;
      } catch (err) {
        report.errori.push({ file: srcFile, error: err.message });
      }
    }
  }

  return report;
}

/**
 * Drena i messaggi non letti per un determinato agente
 */
export function drenaInbox(dirCoord, agentId) {
  const safeAgent = String(agentId).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const inbox = join(dirCoord, "mail", "agents", safeAgent, "inbox");
  if (!existsSync(inbox)) return [];

  const inboxDone = join(inbox, ".done");
  if (!existsSync(inboxDone)) {
    mkdirSync(inboxDone, { recursive: true });
  }

  const messaggi = [];
  const files = readdirSync(inbox).filter((f) => f.endsWith(".json") && !f.startsWith("."));

  for (const f of files) {
    const srcFile = join(inbox, f);
    try {
      const raw = readFileSync(srcFile, "utf8");
      const msg = JSON.parse(raw);
      messaggi.push(msg);

      // Archiviazione messaggio processato
      const archivedFile = join(inboxDone, f);
      atomicWriteJson(archivedFile, msg);
      try { unlinkSync(srcFile); } catch {}
    } catch {}
  }

  return messaggi;
}

const USO = `Uso:
  mail-router.mjs send --from <agente> --to <agente> --act <atto> --subject <oggetto> [--body <testo>] [--task <id>] [--dispatch-id <id>] [--reply|--requires-reply] [--coord <dir>]
  mail-router.mjs route [--coord <dir>]
  mail-router.mjs drain --agent <agente> [--coord <dir>]
  mail-router.mjs --help`;

function eseguiCli(args) {
  const [command, ...rest] = args;
  if (command === "--help" || command === "help") {
    console.log(USO);
    return;
  }
  const allowed = {
    send: ["from", "to", "act", "subject", "body", "task", "dispatch-id", "coord", "reply", "requires-reply"],
    route: ["coord"],
    drain: ["agent", "coord"]
  };
  if (!Object.hasOwn(allowed, command)) throw new Error(`Comando non riconosciuto: ${command || "(mancante)"}`);
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--") || !allowed[command].includes(arg.slice(2))) throw new Error(`Opzione non riconosciuta: ${arg}`);
    const key = arg.slice(2);
    if (key === "reply" || key === "requires-reply") options[key] = true;
    else {
      const value = rest[++i];
      if (!value || value.startsWith("--")) throw new Error(`Valore mancante per --${key}`);
      options[key] = value;
    }
  }
  for (const key of command === "send" ? ["from", "to", "act", "subject"] : command === "drain" ? ["agent"] : []) {
    if (!options[key]) throw new Error(`Opzione obbligatoria: --${key}`);
  }
  const coord = options.coord || ".coord";
  const result = command === "send" ? inviaMessaggio({
    dirCoord: coord, from: options.from, to: options.to, act: options.act,
    subject: options.subject, body: options.body, taskId: options.task,
    dispatchId: options["dispatch-id"], requiresReply: Boolean(options.reply || options["requires-reply"])
  }) : command === "route" ? smistaPosta(coord) : drenaInbox(coord, options.agent);
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    eseguiCli(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n${USO}`);
    process.exitCode = 1;
  }
}
