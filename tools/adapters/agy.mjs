export function buildCommand({ prompt = "", profile = "workspace-write", model, resumeId, nativeCli = false }) {
  const args = nativeCli ? [`--print=${prompt}`] : ["-p", prompt];
  args.push("--output-format", "stream-json");
  // La CLI installata usa --conversation per riprendere una sessione specifica.
  if (resumeId) args.push(nativeCli ? "--conversation" : "-r", resumeId);
  if (model) args.push("--model", model);
  if (nativeCli) args.push("--mode", profile === "read-only" ? "plan" : "accept-edits");
  return { exe: "agy", args };
}

export function parseEvent(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return [];
  }
  if (!event || typeof event !== "object") return [];
  const emit = (type, fields) => ({ provider: "agy", type, ...fields });
  const sessionId = event.conversation_id ?? event.session_id ?? event.sessionId ?? event.thread_id ?? event.threadId;
  switch (event.event ?? event.type) {
    case "init":
    case "session":
    case "session_start":
    case "system":
      return sessionId ? [emit("session", { sessionId })] : [];
    case "step_update": {
      const step = event.step_update;
      if (!step) return [];
      if (step.step_type === "agent_response" && step.text_delta) return [emit("text", { text: step.text_delta })];
      // Ogni step tool può avere più aggiornamenti ACTIVE. Il record DONE contiene entrambi i dati.
      if (step.step_type !== "tool" || step.state !== "DONE") return [];
      const tool = step.tool_info ?? {};
      const name = tool.name ?? step.tool_name;
      return [
        emit("tool_call", { name, input: tool.parameters }),
        emit("tool_result", { name, isError: Boolean(tool.error), detail: tool.error?.message ?? tool.error ?? tool.output }),
      ];
    }
    case "message":
      return event.role === "assistant" && typeof event.content === "string"
        ? [emit("text", { text: event.content })] : [];
    case "text":
      return [emit("text", { text: event.text })];
    case "tool_use":
    case "tool_call":
      return [emit("tool_call", {
        name: event.tool_name ?? event.name,
        input: event.parameters ?? event.input ?? event.arguments,
      })];
    case "tool_result":
      return [emit("tool_result", {
        name: event.tool_name ?? event.name,
        isError: Boolean(event.is_error || event.isError || event.error || ["error", "failed"].includes(event.status)),
        detail: event.error?.message ?? event.error ?? event.output ?? event.detail,
      })];
    case "error":
      return [emit("error", { detail: event.message ?? event.error })];
    case "result":
    case "done": {
      const result = event.event === "result" ? event.result ?? {} : event;
      const failed = Boolean(result.is_error || result.error) || /^(error|failed)$/i.test(result.status ?? "");
      return [emit(failed ? "error" : "done", {
        detail: result.error?.message ?? result.error ?? result.response ?? result.result,
      })];
    }
    default:
      return [];
  }
}
