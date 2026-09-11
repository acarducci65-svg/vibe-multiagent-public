import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { strict as assert } from "node:assert";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

const radice = join(tmpdir(), "chk-" + Date.now());
mkdirSync(join(radice, ".coord", "tasks"), { recursive: true });
try {
  execFileSync("git", ["init"], { cwd: radice, stdio: "ignore" });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "init"], { cwd: radice, stdio: "ignore" });
} catch {}
const task = join(radice, ".coord", "tasks", "T-999.md");
writeFileSync(task, readFileSync(join(__dirname, "fixtures", "T-999.md"), "utf8"));

const esegui = () => execFileSync("node", ["../agy-checkpoint.mjs"], {
  cwd: __dirname, encoding: "utf8",
  input: JSON.stringify({ stepIdx: 3, workspacePaths: [radice] }),
});

esegui();
const dopo = readFileSync(task, "utf8");
assert.match(dopo, /^- Fatti: \d{4}-\d{2}-\d{2} \d{2}:\d{2} — modificati:/m, "il blocco Fatti non è stato scritto");
assert.match(dopo, /- Sto per: rimuovere il modulo X/, "il campo Sto per è stato toccato e non doveva");

esegui(); // seconda esecuzione: deve sovrascrivere, non accodare
assert.equal((readFileSync(task, "utf8").match(/^- Fatti:/gm) ?? []).length, 1, "il blocco Fatti è stato duplicato");

// task PRONTO: l'hook non deve scriverci
writeFileSync(task, readFileSync(task, "utf8").replace("Stato: IN CORSO", "Stato: PRONTO"));
const prima = readFileSync(task, "utf8");
esegui();
assert.equal(readFileSync(task, "utf8"), prima, "ha scritto su un task non IN CORSO");

rmSync(radice, { recursive: true, force: true });
console.log("agy-checkpoint: 4 collaudi superati");
