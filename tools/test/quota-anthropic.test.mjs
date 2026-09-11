import { execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

const esegui = (env = {}) =>
  JSON.parse(
    execFileSync("node", ["../quota-anthropic.mjs"], {
      cwd: __dirname,
      encoding: "utf8",
      env: { ...process.env, ...env },
    })
  );

// 1. Verifica comportamento di default: DISABILITATO (nessuna chiamata di rete né lettura token)
const defaultRun = esegui({ VIBE_ANTHROPIC_QUOTA: "0", VIBE_MOCK_QUOTA_PAYLOAD: "" });
assert.equal(defaultRun.ok, false);
assert.equal(defaultRun.source, "disabled");
assert.equal(defaultRun.fiveHourPct, null);
assert.equal(defaultRun.sevenDayPct, null);
assert.match(defaultRun.note, /disattivato/i);

// 2. Verifica comportamento con Mock (test deterministico offline per CI)
const mockPayload = JSON.stringify({
  ok: true,
  source: "mock",
  fiveHourPct: 42,
  sevenDayPct: 35,
  resetsAt: 1773333333,
  note: "collaudo mock offline",
});

const mockRun = esegui({ VIBE_MOCK_QUOTA_PAYLOAD: mockPayload });
assert.equal(mockRun.ok, true);
assert.equal(mockRun.source, "mock");
assert.equal(mockRun.fiveHourPct, 42);
assert.equal(mockRun.sevenDayPct, 35);
assert.equal(mockRun.resetsAt, 1773333333);

// 3. Verifica robustezza: con credenziali inesistenti non deve andare in crash
const noCredsRun = esegui({
  VIBE_ANTHROPIC_QUOTA: "1",
  VIBE_MOCK_QUOTA_PAYLOAD: "",
  USERPROFILE: "/percorso/inesistente",
  HOME: "/percorso/inesistente",
});
assert.equal(noCredsRun.ok, false);
assert.equal(noCredsRun.source, "unavailable");

console.log("quota-anthropic: 3 collaudi superati (100% deterministici e offline)");
