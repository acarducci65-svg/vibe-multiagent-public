#!/usr/bin/env node
// PostToolUse: scrive i fatti nel Punto di ripresa del task IN CORSO. Nessuna intenzione, solo cose verificabili.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

let grezzo = ""; for await (const c of process.stdin) grezzo += c;
const fine = () => { process.stdout.write("{}"); process.exit(0); };

let p; try { p = JSON.parse(grezzo); } catch { fine(); }
const radice = (p.workspacePaths ?? [])[0];
if (!radice) fine();

const possibili = [
  process.env.DIR_COORD ? join(radice, process.env.DIR_COORD, "tasks") : null,
  join(radice, ".coord", "tasks"),
  join(radice, ".claude", "agents", "tasks"),
].filter(Boolean);

const dirTask = possibili.find((d) => existsSync(d));
if (!dirTask) fine();

const inCorso = readdirSync(dirTask).filter((f) => f.endsWith(".md"))
  .map((f) => join(dirTask, f))
  .find((f) => /^Stato:\s*IN CORSO\s*$/m.test(readFileSync(f, "utf8")));
if (!inCorso) fine();

const git = (...a) => { try { return execFileSync("git", ["-C", radice, ...a], { encoding: "utf8" }).trim(); } catch { return ""; } };
const sporchi = git("status", "--short").split("\n").filter(Boolean).map((l) => l.slice(3)).join(", ") || "nessuno";
const ultimo = git("log", "-1", "--format=%h %s") || "nessun commit";
const ora = new Date().toISOString().replace("T", " ").slice(0, 16);

const riga = `- Fatti: ${ora} — modificati: ${sporchi} — ultimo commit: ${ultimo}`;
const testo = readFileSync(inCorso, "utf8");
writeFileSync(inCorso, /^- Fatti:.*$/m.test(testo)
  ? testo.replace(/^- Fatti:.*$/m, riga)
  : testo.replace(/(^- Ultimo passo completato:.*$)/m, `$1\n${riga}`));
fine();
