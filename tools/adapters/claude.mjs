import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ALLOW_READ_ONLY = Object.freeze([
  "Read(./**)",
  "Glob",
  "Grep",
  "Skill",
  "WebFetch",
  "WebSearch",
]);

export const ALLOW_WORKSPACE_WRITE = Object.freeze([
  "Read(./**)",
  "Edit(./**)",
  "Write(./**)",
  "Glob",
  "Grep",
  "Skill",
  "WebFetch",
  "WebSearch",
  "Bash",
  "PowerShell",
]);

export const DENY_GUARDRAILS = Object.freeze([
  "Bash(git push*)",
  "Bash(npm publish*)",
  "Bash(pnpm publish*)",
  "Bash(yarn publish*)",
  "Bash(*--dangerously-skip-permissions*)",
  "Bash(*--dangerously-bypass-approvals*)",
  "PowerShell(*git push*)",
  "PowerShell(*--dangerously-skip-permissions*)",
  "PowerShell(*--dangerously-bypass-approvals*)",
]);

function mergeUnici(base, extra) {
  const seen = new Set();
  const out = [];
  for (const list of [base, extra]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string" && item.trim() && !seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    }
  }
  return out;
}

export function buildCommand({ prompt = "", profile = "workspace-write", model, resumeId, directorOverride }) {
  const args = ["-p", "--output-format", "stream-json", "--verbose"];
  if (directorOverride === true) args.push("--dangerously-skip-permissions");
  else args.push("--permission-mode", profile === "read-only" ? "plan" : "acceptEdits");
  if (model) args.push("--model", model);
  if (resumeId) args.push("--resume", resumeId);
  return { exe: "claude", args, stdinText: prompt };
}

export function assicuraAllowlistClaude(cwd, profile) {
  if (profile !== "read-only" && profile !== "workspace-write") {
    throw new Error(`Profilo Claude non valido: ${profile}`);
  }
  const dir = join(cwd, ".claude");
  const path = join(dir, "settings.local.json");
  for (const target of [dir, path]) {
    if (lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(`Percorso Claude non locale: ${target}`);
    }
  }
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const settings = raw === undefined ? {} : JSON.parse(raw);
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error(`Oggetto impostazioni Claude non valido: ${path}`);
  }

  const permissions = settings.permissions ?? {};
  const readOnly = profile === "read-only";
  settings.permissions = {
    ...permissions,
    allow: readOnly ? [...ALLOW_READ_ONLY] : mergeUnici(ALLOW_WORKSPACE_WRITE, permissions.allow),
    deny: mergeUnici(permissions.deny, DENY_GUARDRAILS),
    defaultMode: readOnly ? "plan" : "acceptEdits",
  };

  const updated = JSON.stringify(settings, null, 2) + "\n";
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

export function parseEvent(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return [];
  }
  if (!event || typeof event !== "object") return [];
  const emit = (type, fields) => ({ provider: "claude", type, ...fields });
  switch (event.type) {
    case "system":
      return event.subtype === "init" && event.session_id
        ? [emit("session", { sessionId: event.session_id })] : [];
    case "assistant":
    case "user": {
      const contents = event.message?.content;
      if (!Array.isArray(contents)) return [];
      return contents.flatMap(item => {
        if (!item) return [];
        if (item.type === "tool_use") return [emit("tool_call", { name: item.name, input: item.input })];
        if (item.type === "tool_result") {
          return [emit("tool_result", { isError: Boolean(item.is_error), detail: item.content })];
        }
        return item.type === "text" && event.type === "assistant" ? [emit("text", { text: item.text })] : [];
      });
    }
    case "result":
    case "error":
      return [emit(event.is_error || event.type === "error" ? "error" : "done", {
        detail: event.result ?? event.errors ?? event.message,
      })];
    default:
      return [];
  }
}
