import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { confrontaSemver, eseguiCliPreflight, eseguiPreflight } from "../preflight.mjs";

assert.equal(confrontaSemver("2.10.0", "2.9.9"), 1);
assert.equal(confrontaSemver("0.171.0-rc.1", "0.171.0"), -1);
assert.equal(confrontaSemver("1.5.16-rc.2", "1.5.16-rc.10"), -1);
assert.equal(confrontaSemver("1.5.16-rc.1", "1.5.16-rc.beta"), -1);
assert.equal(confrontaSemver("1.5.16+abc", "1.5.16+def"), 0);
assert.throws(() => confrontaSemver("1.05.16", "1.5.16"), /semver/i);
assert.throws(() => confrontaSemver("1.5.16-01", "1.5.16"), /semver/i);

const radice = mkdtempSync(join(tmpdir(), "vibe-preflight-"));
try {
  const credentialFile = join(radice, "credenziali.json");
  const options = {
    radice,
    env: { ELECTRON_RUN_AS_NODE: "1" },
    credentialFile,
    now: Date.parse("2026-11-01T12:00:00Z"),
    leggiVersione: cli => ({ claude: "2.1.318 (Claude Code)", codex: "codex-cli 0.170.9", agy: null })[cli],
  };
  mkdirSync(join(radice, ".agent"));
  const iniziale = eseguiPreflight(options);
  assert.deepEqual(iniziale.cli.map(({ nome, stato }) => [nome, stato]), [
    ["claude", "OK"], ["codex", "WARN"], ["agy", "MISSING"],
  ]);
  assert.equal(iniziale.credenzialiClaude, null);
  assert.equal(iniziale.workspace.gitattributes.stato, "WARN");
  assert.equal(iniziale.workspace.coord.stato, "WARN");
  assert.equal(iniziale.workspace.agents.stato, "WARN");
  assert.match(iniziale.workspace.agents.messaggio, /\.agent\//);
  assert.equal(iniziale.workspace.electron.stato, "WARN");

  writeFileSync(credentialFile, JSON.stringify({ claudeAiOauth: { loginExpiresAt: "2026-11-11T12:00:00Z" } }));
  writeFileSync(join(radice, ".gitattributes"), "* text=auto\n");
  mkdirSync(join(radice, ".coord"));
  mkdirSync(join(radice, ".agents"));
  rmSync(join(radice, ".agent"), { recursive: true });
  const aggiornate = { ...options, env: {}, leggiVersione: () => "v9.10.0" };
  const report = eseguiPreflight(aggiornate);
  assert.ok(report.cli.every(({ stato }) => stato === "OK"));
  assert.ok(Object.values(report.workspace).every(({ stato }) => stato === "OK"));
  assert.equal(report.credenzialiClaude.stato, "WARN");
  assert.equal(report.credenzialiClaude.scadenza, "2026-11-11T12:00:00.000Z");
  assert.deepEqual(JSON.parse(eseguiCliPreflight(["--json"], aggiornate)), report);
  assert.match(eseguiCliPreflight([], aggiornate), /claude.*OK/i);
  assert.match(eseguiCliPreflight([], aggiornate), /credentials|credenziali/i);

  const daEnv = { ...aggiornate, env: { credential_expires_at: "2026-11-12T12:00:00Z" } };
  assert.equal(eseguiPreflight(daEnv).credenzialiClaude.stato, "OK");
  assert.equal(eseguiPreflight({ ...aggiornate, env: { loginExpiresAt: "2026-10-01" } }).credenzialiClaude.stato, "WARN");
  writeFileSync(credentialFile, "{corrotto");
  assert.equal(eseguiPreflight(aggiornate).credenzialiClaude, null);
} finally {
  rmSync(radice, { recursive: true, force: true });
}

console.log("preflight: collaudi offline superati");
