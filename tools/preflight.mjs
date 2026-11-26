#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, rmdirSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const VERSIONI_MINIME = { claude: "2.1.318", codex: "0.171.0", agy: "1.5.16" };
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-z-]+(?:\.[\da-z-]+)*))?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/i;
const NUMERICO = /^\d+$/;
const MS_GIORNO = 24 * 60 * 60 * 1000;

function analizzaSemver(versione) {
  const match = SEMVER.exec(versione);
  const prerelease = match?.[4]?.split(".") ?? [];
  if (!match || match[0] !== versione || prerelease.some(id => /^0\d+$/.test(id))) {
    throw new TypeError(`Versione SemVer non valida: ${versione}`);
  }
  return { core: match.slice(1, 4).map(BigInt), prerelease };
}

function confronta(a, b) {
  return a === b ? 0 : a < b ? -1 : 1;
}

export function confrontaSemver(a, b) {
  const sx = analizzaSemver(a);
  const dx = analizzaSemver(b);
  for (let i = 0; i < sx.core.length; i++) {
    const ordine = confronta(sx.core[i], dx.core[i]);
    if (ordine) return ordine;
  }
  const x = sx.prerelease;
  const y = dx.prerelease;
  if (!x.length || !y.length) return confronta(Boolean(y.length), Boolean(x.length));
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    const numericoX = NUMERICO.test(x[i]);
    const numericoY = NUMERICO.test(y[i]);
    if (numericoX && numericoY) return confronta(BigInt(x[i]), BigInt(y[i]));
    if (numericoX !== numericoY) return numericoX ? -1 : 1;
    return confronta(x[i], y[i]);
  }
  return confronta(x.length, y.length);
}

function presenteSuWindows(nome, env) {
  const dirs = [process.cwd(), ...(env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean)];
  const ext = (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(delimiter).filter(Boolean);
  return dirs.some(dir => ext.some(suffisso =>
    statSync(join(dir.replace(/^"|"$/g, ""), nome + suffisso), { throwIfNoEntry: false })?.isFile()));
}

function versioneDaCli(nome, env) {
  const opzioni = { encoding: "utf8", env, timeout: 3000, windowsHide: true };
  const windows = process.platform === "win32";
  // CMD può usare lo stesso exit code per un comando assente e per uno fallito.
  if (windows && !presenteSuWindows(nome, env)) return null;
  // I comandi sono nomi fissi, inclusi gli shim .cmd risolti dalla shell Windows.
  const avvia = stdio => windows
    ? spawnSync(`${nome} --version`, { ...opzioni, stdio, shell: true })
    : spawnSync(nome, ["--version"], { ...opzioni, stdio });
  let esito = avvia(["ignore", "pipe", "pipe"]);
  let output = [esito.stdout, esito.stderr].join("\n");
  if (windows && esito.error?.code === "EPERM") {
    // In ambienti Windows limitati un handle di file può sostituire le pipe.
    const dir = mkdtempSync(join(tmpdir(), "vibe-preflight-cli-"));
    const file = join(dir, "version");
    try {
      const fd = openSync(file, "wx");
      try {
        esito = avvia(["ignore", fd, fd]);
      } finally {
        closeSync(fd);
      }
      output = readFileSync(file, "utf8");
    } finally {
      rmSync(file, { force: true });
      rmdirSync(dir);
    }
  }
  if (esito.error?.code === "ENOENT" || (windows && esito.status === 9009)) return null;
  if (esito.error || esito.status !== 0) throw new Error("Comando --version non riuscito");
  return output;
}

function verificaCli(nome, minima, leggiVersione) {
  try {
    const output = leggiVersione(nome);
    if (output == null) return { nome, minima, versione: null, stato: "MISSING", messaggio: "CLI assente" };
    const versione = /(?:^|[^\w.+-])v?(\d+\.\d+\.\d+[\w.+-]*)(?![\w.+-])/im.exec(output)?.[1];
    const compatibile = confrontaSemver(versione, minima) >= 0;
    return {
      nome, minima, versione, stato: compatibile ? "OK" : "WARN",
      messaggio: compatibile ? "Versione compatibile" : "Versione inferiore alla minima consigliata",
    };
  } catch {
    return { nome, minima, versione: null, stato: "WARN", messaggio: "Versione non rilevabile" };
  }
}

function dataScadenza(valore) {
  if (typeof valore === "string" && NUMERICO.test(valore)) valore = Number(valore);
  if (typeof valore === "number") return new Date(valore < 1e12 ? valore * 1000 : valore).getTime();
  return typeof valore === "string" ? Date.parse(valore) : NaN;
}

function scadenzaNelFile(file) {
  try {
    const dati = JSON.parse(readFileSync(file, "utf8"));
    return [dati, dati?.claudeAiOauth].flatMap(sezione => [
      sezione?.credential_expires_at, sezione?.loginExpiresAt,
    ]).map(dataScadenza).find(Number.isFinite);
  } catch {
    return undefined;
  }
}

function verificaCredenziali(env, file, now) {
  const daEnv = [env.credential_expires_at, env.loginExpiresAt, env.CLAUDE_CREDENTIAL_EXPIRES_AT]
    .map(dataScadenza).find(Number.isFinite);
  const data = daEnv ?? scadenzaNelFile(file);
  if (data === undefined) return null;
  const giorniRimanenti = Math.ceil((data - now) / MS_GIORNO);
  const stato = data - now <= 10 * MS_GIORNO ? "WARN" : "OK";
  const messaggio = data <= now ? "Credenziali scadute"
    : `Scadenza tra ${giorniRimanenti} giorni`;
  return { stato, scadenza: new Date(data).toISOString(), giorniRimanenti, messaggio };
}

function controllaWorkspace(radice, env) {
  const stat = nome => statSync(join(radice, nome), { throwIfNoEntry: false });
  const attributi = stat(".gitattributes")?.isFile();
  const coord = stat(".coord")?.isDirectory();
  const agent = stat(".agent")?.isDirectory();
  const agents = stat(".agents")?.isDirectory();
  const electron = env.ELECTRON_RUN_AS_NODE === "1";
  return {
    gitattributes: attributi
      ? { stato: "OK", messaggio: ".gitattributes presente" }
      : { stato: "WARN", messaggio: ".gitattributes assente, possibili differenze CRLF su Windows" },
    coord: coord
      ? { stato: "OK", messaggio: ".coord/ presente" }
      : { stato: "WARN", messaggio: ".coord/ assente" },
    agents: agents && !agent
      ? { stato: "OK", messaggio: ".agents/ presente" }
      : {
          stato: "WARN",
          messaggio: agent
            ? (agents ? ".agent/ e .agents/ coesistono" : ".agent/ presente, manca .agents/")
            : ".agents/ assente",
        },
    electron: electron
      ? { stato: "WARN", messaggio: "ELECTRON_RUN_AS_NODE=1" }
      : { stato: "OK", messaggio: "ELECTRON_RUN_AS_NODE disattivato" },
  };
}

export function eseguiPreflight({
  radice = process.cwd(),
  env = process.env,
  now = Date.now(),
  credentialFile = env.CLAUDE_CREDENTIAL_FILE ?? join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), ".credentials.json"),
  leggiVersione = nome => versioneDaCli(nome, env),
} = {}) {
  return {
    cli: Object.entries(VERSIONI_MINIME).map(([nome, minima]) => verificaCli(nome, minima, leggiVersione)),
    credenzialiClaude: verificaCredenziali(env, credentialFile, now),
    workspace: controllaWorkspace(radice, env),
  };
}

const USO = "Uso: node tools/preflight.mjs [--json|--help]";

export function eseguiCliPreflight(args, opzioni) {
  if (args.length === 1 && args[0] === "--help") return USO;
  const json = args.length === 1 && args[0] === "--json";
  if (args.length && !json) throw new Error(USO);
  const report = eseguiPreflight(opzioni);
  if (json) return JSON.stringify(report, null, 2);
  const righe = report.cli.map(({ nome, stato, versione, minima, messaggio }) =>
    `${nome} ${stato} (minimo ${minima}${versione ? `, rilevata ${versione}` : ""}) — ${messaggio}`);
  if (report.credenzialiClaude) {
    const { stato, messaggio, scadenza } = report.credenzialiClaude;
    righe.push(`Credenziali Claude ${stato} — ${messaggio} (${scadenza})`);
  }
  righe.push(...Object.values(report.workspace).map(({ stato, messaggio }) => `${stato} — ${messaggio}`));
  return righe.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(eseguiCliPreflight(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
