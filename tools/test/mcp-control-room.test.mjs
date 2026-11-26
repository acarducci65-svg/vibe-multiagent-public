// Collaudi offline e deterministici del sidecar MCP App "vibe-control-room".
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const radiceSkill = join(__dirname, "..", "..");
const serverPath = join(radiceSkill, "tools", "mcp-control-room.mjs");

// Nessun probe di rete durante i test.
process.env.VIBE_ANTHROPIC_QUOTA = "0";
delete process.env.VIBE_QUOTA_PROBE;

const mod = await import(new URL("../mcp-control-room.mjs", import.meta.url).href);
const { creaServer, UI_URI, UI_MIME, jsonPerScript, costruisciHtml } = mod;

// --- Fixture .coord/ temporanea ---
const radice = mkdtempSync(join(tmpdir(), "vibe-mcp-"));
const dirCoord = join(radice, ".coord");
mkdirSync(join(dirCoord, "tasks"), { recursive: true });
mkdirSync(join(dirCoord, "state"), { recursive: true });
writeFileSync(join(dirCoord, "CURRENT_SPRINT.md"), "# Sprint MCP\n\n- **Stato:** IN CORSO\n", "utf8");
writeFileSync(join(dirCoord, "tasks", "T-001.md"), "# T-001 — Primo task\n\n- **Stato:** IN CORSO\n- **Proprietario:** Codex CLI\n", "utf8");
writeFileSync(join(dirCoord, "tasks", "T-002.md"), "# T-002 — Secondo </script><script>alert(1)</script>\n\n- **Stato:** PRONTO\n- **Proprietario:** Claude Code\n", "utf8");
writeFileSync(join(dirCoord, "state", "sessions.json"), JSON.stringify({
  "T-001": { provider: "codex", cwd: radice, profile: "workspace-write", sessionId: "sess-001", updatedAt: "2026-11-26T09:00:00Z" },
}), "utf8");
writeFileSync(join(dirCoord, "state", "worktrees.json"), JSON.stringify({
  worktrees: [{ name: "wt-T-001", path: "/tmp/wt-T-001", branch: "task/T-001", createdAt: "2026-11-26T09:00:00Z" }],
}), "utf8");

let collaudi = 0;
const ok = (msg) => { collaudi++; return msg; };

try {
  const server = creaServer({ base: { repoPath: radice } });
  const rpc = async (id, method, params) => server.gestisci({ jsonrpc: "2.0", id, method, params });

  // 1. initialize
  const init = await rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal(init.result.serverInfo.name, "vibe-control-room");
  assert.equal(init.result.serverInfo.version, "3.0.0");
  assert.ok(init.result.capabilities.tools && init.result.capabilities.resources);
  const initIgnoto = await rpc(2, "initialize", { protocolVersion: "1999-01-01" });
  assert.equal(initIgnoto.result.protocolVersion, mod.PROTOCOL_VERSIONS[0], ok("versione non supportata → ultima supportata"));

  // 2. notifiche e ping
  assert.equal(await server.gestisci({ jsonrpc: "2.0", method: "notifications/initialized" }), null, ok("notifiche senza risposta"));
  assert.deepEqual((await rpc(3, "ping")).result, {});

  // 3. tools/list con _meta MCP Apps + Antigravity
  const list = (await rpc(4, "tools/list")).result.tools;
  const open = list.find((t) => t.name === "open_control_room");
  const fleet = list.find((t) => t.name === "get_fleet_state");
  assert.ok(open && fleet, "Entrambi i tool devono essere esposti");
  assert.equal(open._meta.ui.resourceUri, UI_URI);
  assert.deepEqual(open._meta["com.google.antigravity/ui"].entrypoints, [
    { type: "aux_pane", title: "Vibe Control Room" },
    { type: "global", title: "Vibe Control Room" },
  ]);
  assert.deepEqual(fleet._meta.ui.visibility, ["model", "app"]);
  for (const t of [open, fleet]) {
    assert.equal(t.inputSchema.type, "object");
    assert.deepEqual(t.inputSchema.required ?? [], [], "Tutti i parametri devono essere opzionali");
    assert.deepEqual(Object.keys(t.inputSchema.properties).sort(), ["coordDir", "repoPath"]);
  }
  ok("tools/list");

  // 4. resources/list e resources/read
  const res = (await rpc(5, "resources/list")).result.resources;
  assert.equal(res.length, 1);
  assert.equal(res[0].uri, UI_URI);
  assert.equal(res[0].mimeType, UI_MIME);
  assert.equal(UI_MIME, "text/html;profile=mcp-app");
  const read = (await rpc(6, "resources/read", { uri: UI_URI })).result.contents[0];
  assert.equal(read.uri, UI_URI);
  assert.equal(read.mimeType, "text/html;profile=mcp-app");
  assert.ok(read.text.startsWith("<!DOCTYPE html>"));
  assert.ok(read.text.includes("window.__VIBE_EMBEDDED__ = true"), "Stato iniettato inline in modalità embedded");
  assert.ok(!read.text.includes('<script src="state.js"></script>'), "Nessun riferimento esterno a state.js");
  assert.ok(!/<script[^>]+src=/i.test(read.text), "Nessuno script esterno (100% self-contained)");
  assert.ok(!/https?:\/\/(cdn|unpkg|fonts)\./i.test(read.text), "Nessun CDN esterno");
  assert.ok(read.text.includes('id="sessionsWorktrees"'));
  // Il titolo malevolo del task non deve chiudere il blocco <script> inline.
  const blocco = read.text.match(/<script>window\.__VIBE_EMBEDDED__[\s\S]*?<\/script>/)[0];
  assert.ok(!blocco.slice(0, -"</script>".length).includes("</script"), "Il JSON inline non deve contenere </script>");
  assert.ok(blocco.includes("sess-001") && blocco.includes("wt-T-001"), "Sessioni e worktree inclusi nello stato iniettato");
  assert.ok(read._meta.ui.csp, ok("resources/read"));
  const readIgnoto = await rpc(7, "resources/read", { uri: "ui://altro/x.html" });
  assert.equal(readIgnoto.error.code, -32602);

  // 5. tools/call open_control_room (content + structuredContent)
  const call = (await rpc(8, "tools/call", { name: "open_control_room", arguments: { repoPath: radice } })).result;
  assert.ok(!call.isError);
  assert.equal(call.content[0].type, "text");
  assert.match(call.content[0].text, /Task \(2\)/);
  assert.match(call.content[0].text, /Sessioni resume: 1 \| Worktree attivi: 1/);
  const sc = call.structuredContent;
  assert.equal(sc.tasks.length, 2);
  assert.ok(["live", "snapshot"].includes(sc.source));
  assert.equal(sc.sessions["T-001"]?.sessionId ?? sc.sessions?.[0]?.sessionId, "sess-001");
  const wts = Array.isArray(sc.worktrees) ? sc.worktrees : sc.worktrees.worktrees;
  assert.equal(wts[0].name, "wt-T-001");
  assert.equal(sc.quota?.source ?? "disabled", "disabled", ok("open_control_room offline, nessun probe quota"));

  // 6. tools/call get_fleet_state con coordDir esplicito (assoluto) e via un server senza base
  const server2 = creaServer();
  const fleetRes = (await server2.gestisci({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "get_fleet_state", arguments: { coordDir: dirCoord } } })).result;
  assert.ok(!fleetRes.isError);
  assert.equal(fleetRes.structuredContent.tasks.length, 2);
  assert.ok(fleetRes.structuredContent.tasks.some((t) => t.id === "T-001" && t.stato === "IN CORSO"));
  assert.ok(typeof fleetRes.content[0].text === "string", ok("get_fleet_state"));

  // 6b. modalità snapshot (solo state.json, senza telemetria live)
  process.env.VIBE_MCP_TELEMETRY = "snapshot";
  writeFileSync(join(dirCoord, "state.json"), JSON.stringify({ updatedAt: "2026-11-26T08:00:00Z", tasks: [{ id: "S-1", stato: "PRONTO" }], agents: [] }), "utf8");
  const snap = (await rpc(10, "tools/call", { name: "get_fleet_state", arguments: {} })).result;
  assert.equal(snap.structuredContent.source, "snapshot");
  assert.equal(snap.structuredContent.tasks[0].id, "S-1");
  delete process.env.VIBE_MCP_TELEMETRY;
  ok("snapshot");

  // 7. errori: coord inesistente, tool sconosciuto, argomenti invalidi, metodo sconosciuto, JSON invalido
  const mancante = (await rpc(11, "tools/call", { name: "get_fleet_state", arguments: { repoPath: join(radice, "non-esiste") } })).result;
  assert.equal(mancante.isError, true);
  assert.equal((await rpc(12, "tools/call", { name: "rm_rf", arguments: {} })).error.code, -32602);
  assert.equal((await rpc(13, "tools/call", { name: "get_fleet_state", arguments: { repoPath: 42 } })).error.code, -32602);
  assert.equal((await rpc(14, "metodo/ignoto")).error.code, -32601);
  assert.equal((await server.gestisciRiga("{non json")).error.code, -32700);
  assert.equal((await server.gestisci([1, 2])).error.code, -32600);
  assert.equal(await server.gestisci({ jsonrpc: "2.0", id: 99, result: {} }), null, ok("errori JSON-RPC"));

  // 8. helper di serializzazione sicura
  assert.equal(jsonPerScript({ a: "</script>" }), '{"a":"\\u003c/script\\u003e"}');
  assert.ok(costruisciHtml({ tasks: [] }).includes("window.__VIBE_STATE__ = {"), ok("jsonPerScript/costruisciHtml"));

  // 9. trasporto STDIO reale (newline-delimited, risposte in ordine)
  const risposte = await new Promise((resolveP, rejectP) => {
    const child = spawn(process.execPath, [serverPath], {
      cwd: radice,
      env: { ...process.env, VIBE_ANTHROPIC_QUOTA: "0" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    const timer = setTimeout(() => { child.kill(); rejectP(new Error("timeout STDIO")); }, 15000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      out += d;
      const righe = out.split("\n").filter(Boolean);
      if (righe.length >= 4 && !child.stdin.writableEnded) {
        clearTimeout(timer);
        const parsed = righe.map((r) => JSON.parse(r));
        // Attende l'uscita del figlio (stdin chiuso) prima di rimuovere la fixture: su Windows la cwd resta bloccata.
        child.once("exit", () => resolveP(parsed));
        child.stdin.end();
      }
    });
    child.on("error", rejectP);
    const msgs = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "open_control_room", arguments: {} } },
    ];
    // Invio frammentato: verifica il buffering per righe.
    const payload = msgs.map((m) => JSON.stringify(m)).join("\r\n") + "\n";
    child.stdin.write(payload.slice(0, 17));
    child.stdin.write(payload.slice(17) + '{"jsonrpc":"2.0","id":4,"method":"ping"}\n');
  });
  assert.deepEqual(risposte.map((r) => r.id), [1, 2, 3, 4], "Risposte STDIO in ordine e nessuna risposta alle notifiche");
  assert.equal(risposte[0].result.protocolVersion, "2025-11-25");
  assert.equal(risposte[1].result.tools.length, 2);
  assert.equal(risposte[2].result.structuredContent.tasks.length, 2);
  ok("stdio");

  // 10. mcp.json registra il server
  const mcpJson = JSON.parse(readFileSync(join(radiceSkill, "mcp.json"), "utf8"));
  assert.deepEqual(mcpJson.mcpServers["vibe-control-room"].command, "node");
  assert.deepEqual(mcpJson.mcpServers["vibe-control-room"].args, ["tools/mcp-control-room.mjs"]);
  ok("mcp.json");
} finally {
  try {
    rmSync(radice, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (err) {
    console.warn(`mcp-control-room: fixture temporanea non rimossa (${err.code}): ${radice}`);
  }
}

console.log(`mcp-control-room: ${collaudi} collaudi superati con successo`);
