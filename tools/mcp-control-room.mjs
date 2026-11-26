#!/usr/bin/env node
/**
 * Vibe Control Room — MCP App Sidecar (v3.0.0)
 *
 * Server MCP STDIO (JSON-RPC 2.0, newline-delimited) a zero dipendenze esterne.
 * Conforme a MCP Apps (SEP-1865) con estensioni Antigravity (`com.google.antigravity/ui`):
 *  - risorsa UI `ui://vibe-multiagent/control-room.html` (MIME `text/html;profile=mcp-app`),
 *    HTML self-contained derivato da templates/dashboard.html.template con stato iniettato inline;
 *  - tool `open_control_room` (apre la Control Room, payload per la UI in structuredContent);
 *  - tool `get_fleet_state` (stato aggiornato della flotta, visibile a modello e app).
 *
 * Lo stdout trasporta SOLO messaggi JSON-RPC; la diagnostica va su stderr.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

export const SERVER_NAME = "vibe-control-room";
export const SERVER_VERSION = "3.0.0";
export const UI_URI = "ui://vibe-multiagent/control-room.html";
export const UI_MIME = "text/html;profile=mcp-app";
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const TEMPLATE_PATH = join(__dirname, "..", "templates", "dashboard.html.template");
const TELEMETRY_PATH = join(__dirname, "telemetry.mjs");

const SCHEMA_ARGS = {
  type: "object",
  properties: {
    repoPath: { type: "string", description: "Radice del progetto (default: cwd del server o VIBE_REPO_PATH)." },
    coordDir: { type: "string", description: "Cartella di coordinamento, assoluta o relativa a repoPath (default: .coord o DIR_COORD)." },
  },
  additionalProperties: false,
};

export const TOOLS = [
  {
    name: "open_control_room",
    title: "Apri Vibe Control Room",
    description: "Apre la Control Room multi-agente (MCP App) e restituisce un riepilogo della flotta: task, agenti, circuit breaker, mailbox, sessioni resume e worktree.",
    inputSchema: SCHEMA_ARGS,
    _meta: {
      ui: { resourceUri: UI_URI },
      "com.google.antigravity/ui": {
        entrypoints: [
          { type: "aux_pane", title: "Vibe Control Room" },
          { type: "global", title: "Vibe Control Room" },
        ],
      },
    },
  },
  {
    name: "get_fleet_state",
    title: "Stato flotta multi-agente",
    description: "Restituisce lo stato aggiornato della flotta multi-agente (telemetria di .coord/).",
    inputSchema: SCHEMA_ARGS,
    _meta: { ui: { visibility: ["model", "app"] } },
  },
];

export const RESOURCES = [
  {
    uri: UI_URI,
    name: "control-room",
    title: "Vibe Control Room",
    description: "Control Room visiva multi-agente (HTML self-contained, 100% offline).",
    mimeType: UI_MIME,
  },
];

class ErroreRpc extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function leggiJsonOpzionale(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Risolve radice e cartella di coordinamento dagli argomenti del tool (tutti opzionali). */
export function risolviContesto(args = {}, base = {}) {
  if (args !== undefined && (args === null || typeof args !== "object" || Array.isArray(args))) {
    throw new ErroreRpc(-32602, "arguments deve essere un oggetto");
  }
  for (const campo of ["repoPath", "coordDir"]) {
    if (args?.[campo] !== undefined && (typeof args[campo] !== "string" || !args[campo].trim())) {
      throw new ErroreRpc(-32602, `${campo} deve essere una stringa non vuota`);
    }
  }
  const repoPath = resolve(args?.repoPath ?? base.repoPath ?? process.env.VIBE_REPO_PATH ?? process.cwd());
  const coordNome = args?.coordDir ?? base.coordDir ?? process.env.DIR_COORD ?? ".coord";
  const dirCoord = isAbsolute(coordNome) ? resolve(coordNome) : resolve(repoPath, coordNome);
  return { repoPath, coordDir: coordNome, dirCoord };
}

let telemetriaModulo;
async function caricaTelemetria() {
  if (telemetriaModulo !== undefined) return telemetriaModulo;
  try {
    telemetriaModulo = existsSync(TELEMETRY_PATH) ? await import(pathToFileURL(TELEMETRY_PATH).href) : null;
  } catch (err) {
    process.stderr.write(`[${SERVER_NAME}] telemetry.mjs non caricabile: ${err.message}\n`);
    telemetriaModulo = null;
  }
  return telemetriaModulo;
}

function normalizzaWorktrees(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.worktrees)) return raw.worktrees;
  return [];
}

/**
 * Raccoglie lo stato della flotta: telemetria live (raccogliTelemetria) con fallback
 * sullo snapshot .coord/state.json. Arricchisce con sessions/worktrees da .coord/state/.
 */
export async function raccogliStato(ctx) {
  if (!existsSync(ctx.dirCoord)) {
    throw new Error(`Cartella di coordinamento non trovata: ${ctx.dirCoord}`);
  }
  let stato = null;
  let fonte = "snapshot";
  if (process.env.VIBE_MCP_TELEMETRY !== "snapshot") {
    const mod = await caricaTelemetria();
    if (mod && typeof mod.raccogliTelemetria === "function") {
      // Il probe di rete della quota resta opt-in nel sidecar (VIBE_QUOTA_PROBE=1 o VIBE_ANTHROPIC_QUOTA esplicito):
      // evita chiamate di rete e blocchi sincroni del loop JSON-RPC.
      const quotaPrecedente = process.env.VIBE_ANTHROPIC_QUOTA;
      const forzaOffline = quotaPrecedente === undefined && process.env.VIBE_QUOTA_PROBE !== "1";
      if (forzaOffline) process.env.VIBE_ANTHROPIC_QUOTA = "0";
      try {
        stato = mod.raccogliTelemetria(ctx.repoPath, ctx.dirCoord);
        if (stato) fonte = "live";
      } catch (err) {
        process.stderr.write(`[${SERVER_NAME}] raccogliTelemetria fallita: ${err.message}\n`);
      } finally {
        if (forzaOffline) delete process.env.VIBE_ANTHROPIC_QUOTA;
      }
    }
  }
  if (!stato) stato = leggiJsonOpzionale(join(ctx.dirCoord, "state.json"));
  if (!stato || typeof stato !== "object" || Array.isArray(stato)) {
    stato = { updatedAt: new Date().toISOString(), tasks: [], agents: [], logs: {} };
    fonte = "vuoto";
  }
  if (stato.sessions === undefined) {
    const s = leggiJsonOpzionale(join(ctx.dirCoord, "state", "sessions.json"));
    if (s && typeof s === "object") stato.sessions = s;
  }
  if (stato.worktrees === undefined) {
    const w = leggiJsonOpzionale(join(ctx.dirCoord, "state", "worktrees.json"));
    if (w) stato.worktrees = normalizzaWorktrees(w);
  }
  return { ...stato, source: fonte };
}

function contaSessioni(sessions) {
  if (Array.isArray(sessions)) return sessions.length;
  if (sessions && typeof sessions === "object") {
    const src = sessions.sessions && typeof sessions.sessions === "object" ? sessions.sessions : sessions;
    return Array.isArray(src) ? src.length : Object.keys(src).length;
  }
  return 0;
}

/** Riepilogo testuale compatto della flotta, destinato al modello. */
export function riepilogoFlotta(stato) {
  const tasks = Array.isArray(stato.tasks) ? stato.tasks : [];
  const perStato = {};
  for (const t of tasks) perStato[t?.stato ?? "SCONOSCIUTO"] = (perStato[t?.stato ?? "SCONOSCIUTO"] ?? 0) + 1;
  const statiTxt = Object.entries(perStato).map(([k, v]) => `${k}: ${v}`).join(", ") || "nessun task";
  const agenti = (Array.isArray(stato.agents) ? stato.agents : [])
    .map((a) => `${a.name} [${a.status}${a.currentTask ? ` → ${a.currentTask}` : ""}]`)
    .join("; ") || "nessun agente";
  const m = stato.milestone ?? {};
  const righe = [
    `Vibe Control Room — ${stato.projectName ?? "progetto"} (${stato.coordDir ?? ".coord"}), fonte: ${stato.source ?? "?"}`,
    `Milestone: ${m.titolo ?? "n/d"} — ${m.stato ?? "n/d"} (${m.completamento ?? 0}/${m.totale ?? tasks.length} completati)`,
    `Task (${tasks.length}): ${statiTxt}`,
    `Agenti: ${agenti}`,
    `Circuit Breaker: ${stato.circuitBreaker?.state ?? "n/d"} | Mailbox non letti: ${stato.mail?.unread ?? 0}`,
    `Sessioni resume: ${contaSessioni(stato.sessions)} | Worktree attivi: ${normalizzaWorktrees(stato.worktrees).length}`,
    `Aggiornato: ${stato.updatedAt ?? "n/d"}`,
  ];
  return righe.join("\n");
}

/** Serializza JSON sicuro per un blocco <script> inline (nessuna chiusura di tag possibile). */
export function jsonPerScript(valore) {
  return JSON.stringify(valore ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029");
}

/** Costruisce l'HTML self-contained della MCP App con lo stato iniettato inline. */
export function costruisciHtml(stato) {
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  const inline = `<script>window.__VIBE_EMBEDDED__ = true; window.__VIBE_STATE__ = ${jsonPerScript(stato)};</script>`;
  const tagState = '<script src="state.js"></script>';
  if (!template.includes(tagState)) throw new Error("Template dashboard privo del tag state.js atteso");
  return template.replace(tagState, () => inline);
}

function risultatoTool(stato) {
  return {
    content: [{ type: "text", text: riepilogoFlotta(stato) }],
    structuredContent: stato,
  };
}

/** Crea un gestore di messaggi JSON-RPC con stato di sessione (ultimo contesto usato). */
export function creaServer(opzioni = {}) {
  let ultimoContesto = opzioni.base ?? {};

  async function gestisciRichiesta(method, params) {
    switch (method) {
      case "initialize": {
        const richiesta = params?.protocolVersion;
        const protocolVersion = PROTOCOL_VERSIONS.includes(richiesta) ? richiesta : PROTOCOL_VERSIONS[0];
        return {
          protocolVersion,
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
          serverInfo: { name: SERVER_NAME, title: "Vibe Control Room", version: SERVER_VERSION },
          instructions: "Usa open_control_room per aprire la Control Room multi-agente; get_fleet_state per lo stato aggiornato della flotta.",
        };
      }
      case "ping":
        return {};
      case "tools/list":
        return { tools: TOOLS };
      case "resources/list":
        return { resources: RESOURCES };
      case "resources/templates/list":
        return { resourceTemplates: [] };
      case "resources/read": {
        if (params?.uri !== UI_URI) throw new ErroreRpc(-32602, `Risorsa sconosciuta: ${params?.uri}`);
        const ctx = risolviContesto({}, ultimoContesto);
        let stato;
        try {
          stato = await raccogliStato(ctx);
        } catch {
          stato = { updatedAt: new Date().toISOString(), tasks: [], agents: [], logs: {}, source: "vuoto" };
        }
        return {
          contents: [{
            uri: UI_URI,
            mimeType: UI_MIME,
            text: costruisciHtml(stato),
            _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } } },
          }],
        };
      }
      case "tools/call": {
        const nome = params?.name;
        if (!TOOLS.some((t) => t.name === nome)) throw new ErroreRpc(-32602, `Tool sconosciuto: ${nome}`);
        const ctx = risolviContesto(params?.arguments ?? {}, ultimoContesto);
        try {
          const stato = await raccogliStato(ctx);
          ultimoContesto = { repoPath: ctx.repoPath, coordDir: ctx.coordDir };
          return risultatoTool(stato);
        } catch (err) {
          return { content: [{ type: "text", text: `Errore: ${err.message}` }], isError: true };
        }
      }
      default:
        throw new ErroreRpc(-32601, `Metodo non supportato: ${method}`);
    }
  }

  /** Gestisce un messaggio JSON-RPC già decodificato. Restituisce la risposta o null (notifiche). */
  async function gestisci(msg) {
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      const id = msg && typeof msg === "object" && !Array.isArray(msg) && msg.id !== undefined ? msg.id : null;
      if (msg && typeof msg === "object" && msg.method === undefined && (msg.result !== undefined || msg.error !== undefined)) return null;
      return { jsonrpc: "2.0", id, error: { code: -32600, message: "Richiesta JSON-RPC non valida" } };
    }
    const isNotifica = msg.id === undefined || msg.id === null;
    if (isNotifica) return null; // notifications/initialized, notifications/cancelled, ecc.
    try {
      const result = await gestisciRichiesta(msg.method, msg.params);
      return { jsonrpc: "2.0", id: msg.id, result };
    } catch (err) {
      const code = err instanceof ErroreRpc ? err.code : -32603;
      return { jsonrpc: "2.0", id: msg.id, error: { code, message: err.message } };
    }
  }

  /** Decodifica una riga e la gestisce (errore -32700 se non è JSON). */
  async function gestisciRiga(riga) {
    const testo = riga.trim();
    if (!testo) return null;
    let msg;
    try {
      msg = JSON.parse(testo);
    } catch {
      return { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } };
    }
    return gestisci(msg);
  }

  return { gestisci, gestisciRiga };
}

/** Avvia il trasporto STDIO newline-delimited. */
export function avviaStdio(input = process.stdin, output = process.stdout) {
  const server = creaServer();
  let buffer = "";
  let coda = Promise.resolve();
  input.setEncoding("utf8");
  input.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const riga = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      // Le risposte rispettano l'ordine di arrivo delle richieste.
      coda = coda.then(async () => {
        const risposta = await server.gestisciRiga(riga);
        if (risposta) output.write(JSON.stringify(risposta) + "\n");
      }).catch((err) => process.stderr.write(`[${SERVER_NAME}] ${err.message}\n`));
    }
  });
  input.on("end", () => {
    coda = coda.then(async () => {
      if (buffer.trim()) {
        const risposta = await server.gestisciRiga(buffer);
        if (risposta) output.write(JSON.stringify(risposta) + "\n");
      }
    });
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  avviaStdio();
}
