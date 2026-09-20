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
      env: { ...process.env, VIBE_NO_CACHE: "1", ...env },
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
// 4. Verifica gestione payload mock malformato o non-oggetto (Claude M-5 / Codex M-02)
const badJsonRun = esegui({ VIBE_MOCK_QUOTA_PAYLOAD: "{non-json" });
assert.equal(badJsonRun.ok, false);
assert.equal(badJsonRun.source, "error");

const nonObjectRun = esegui({ VIBE_MOCK_QUOTA_PAYLOAD: JSON.stringify("string-payload") });
assert.equal(nonObjectRun.ok, false);
assert.equal(nonObjectRun.source, "error");

const arrayRun = esegui({ VIBE_MOCK_QUOTA_PAYLOAD: JSON.stringify([1, 2, 3]) });
assert.equal(arrayRun.ok, false);
assert.equal(arrayRun.source, "error");

// 5. Verifica degradazione sicura in caso di assenza credenziali
assert.equal(noCredsRun.ok, false);
assert.equal(noCredsRun.source, "unavailable");
assert.match(noCredsRun.note, /token|credentials/i);

// 6. Verifica statica di sicurezza: divieto assoluto di disattivazione TLS
import { readFileSync } from "node:fs";
import { join } from "node:path";
const scriptContent = readFileSync(join(__dirname, "../quota-anthropic.mjs"), "utf8");
assert.equal(
  scriptContent.includes("NODE_TLS_REJECT_UNAUTHORIZED"),
  false,
  "quota-anthropic.mjs non deve contenere NODE_TLS_REJECT_UNAUTHORIZED"
);
assert.equal(
  scriptContent.includes("retryInsecure"),
  false,
  "quota-anthropic.mjs non deve contenere retryInsecure"
);

console.log("quota-anthropic: 9 collaudi superati (100% deterministici, offline e verificati per sicurezza TLS)");
