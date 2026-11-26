import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const DEFAULT_GATE_SCRIPT = resolve(__dirname, "..", "codex-gate.mjs");

export function mappaSandboxCodex(profile = "workspace-write") {
  if (profile === "read-only") return "read-only";
  if (profile === "host-tools") return "danger-full-access";
  return "workspace-write";
}

export function assicuraGuardrailCodex(cwd, gateScript = DEFAULT_GATE_SCRIPT) {
  const dir = join(cwd, ".codex");
  const path = join(dir, "hooks.json");
  for (const target of [dir, path]) {
    if (lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(`Percorso Codex non locale: ${target}`);
    }
  }
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const config = raw === undefined ? {} : JSON.parse(raw);
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`File hooks.json Codex non valido: ${path}`);
  }
  const hooks = config.hooks && typeof config.hooks === "object" && !Array.isArray(config.hooks) ? config.hooks : {};
  const preList = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  const gateCmd = `node "${String(gateScript).replace(/\\/g, "/")}"`;
  const giaPresente = preList.some(entry =>
    Array.isArray(entry?.hooks) && entry.hooks.some(h => typeof h?.command === "string" && h.command.includes("codex-gate.mjs"))
  );
  if (!giaPresente) {
    preList.push({
      matcher: "*",
      hooks: [{ type: "command", command: gateCmd, timeout: 10 }],
    });
  }
  config.hooks = { ...hooks, PreToolUse: preList };
  const updated = JSON.stringify(config, null, 2) + "\n";
  if (raw !== updated) {
    mkdirSync(dir, { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, updated, { flag: "wx", mode: 0o600 });
      renameSync(temp, path);
    } finally {
      rmSync(temp, { force: true });
    }
  }
  return path;
}

export function buildCommand({ prompt = "", profile = "workspace-write", model, resumeId, nativeCli = false }) {
  const args = ["exec"];
  const sandbox = mappaSandboxCodex(profile);
  // La CLI installata legge --sandbox dal comando exec, prima del sottocomando resume.
  if (resumeId && !nativeCli) args.push("resume", resumeId);
  args.push("--json", "--sandbox", sandbox);
  if (model) args.push("--model", model);
  if (resumeId && nativeCli) args.push("resume", resumeId);
  args.push("-");
  return { exe: "codex", args, stdinText: prompt };
}

export function parseEvent(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return [];
  }
  if (!event || typeof event !== "object") return [];
  const emit = (type, fields) => ({ provider: "codex", type, ...fields });
  switch (event.type) {
    case "thread.started":
      return event.thread_id ? [emit("session", { sessionId: event.thread_id })] : [];
    case "error":
    case "turn.failed":
      return [emit("error", { detail: event.error?.message ?? event.message ?? event.error })];
    case "turn.completed":
      return [emit("done")];
    case "item.started":
    case "item.completed":
      break;
    default:
      return [];
  }

  const item = event.item;
  if (!item) return [];
  const started = event.type === "item.started";
  if (item.type === "agent_message") return started ? [] : [emit("text", { text: item.text })];

  let name;
  let input;
  const completedOnly = ["file_change", "web_search", "image_view"].includes(item.type);
  switch (item.type) {
    case "command_execution":
      name = item.type;
      input = { command: item.command };
      break;
    case "mcp_tool_call":
    case "dynamic_tool_call":
      name = [item.server, item.tool].filter(Boolean).join("/") || item.type;
      input = item.arguments;
      break;
    case "file_change":
      name = item.type;
      input = item.changes?.map(({ path, kind }) => ({ path, kind }));
      break;
    case "web_search":
      name = item.type;
      input = { query: item.query };
      break;
    case "image_view":
      name = item.type;
      input = { path: item.path };
      break;
    default:
      return item.type === "error" ? [emit("error", { detail: item.message })] : [];
  }

  const call = emit("tool_call", { name, input });
  if (started) return completedOnly ? [] : [call];
  const result = emit("tool_result", {
    name,
    isError: item.status === "failed" || item.error != null || item.exit_code != null && item.exit_code !== 0,
    detail: item.error?.message ?? item.aggregated_output ?? item.result,
  });
  return completedOnly ? [call, result] : [result];
}
