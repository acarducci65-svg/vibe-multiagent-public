import { execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";

const esegui = (env) =>
  JSON.parse(execFileSync("node", ["../quota-anthropic.mjs"], {
    cwd: import.meta.dirname, encoding: "utf8", env: { ...process.env, ...env },
  }));

// 1. forma della risposta
const a = esegui({});
for (const k of ["ok", "source", "fiveHourPct", "sevenDayPct", "resetsAt", "note"])
  assert.ok(k in a, `manca la chiave ${k}`);
assert.ok(["live", "cache", "stale", "unknown"].includes(a.source), "source inatteso: " + a.source);

// 2. senza credenziali degrada, non esplode
const b = esegui({ USERPROFILE: "/percorso/che/non/esiste", HOME: "/percorso/che/non/esiste" });
assert.notEqual(b.source, "live");

console.log("quota-anthropic: 2 collaudi superati");
