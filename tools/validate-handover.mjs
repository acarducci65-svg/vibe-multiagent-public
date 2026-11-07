#!/usr/bin/env node
/**
 * Validatore deterministico e offline di contratti HANDOVER v2.1
 * Verifica la conformità allo schema JSON formale prima della transizione a IN VERIFICA.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

const schema = JSON.parse(readFileSync(join(__dirname, "schemas", "handover-v2.schema.json"), "utf8"));

// Interpreta il sottoinsieme di JSON Schema usato dal contratto, senza dipendenze.
export function validaHandover(oggetto) {
  const errori = [];
  function verifica(valore, regola, percorso) {
    const tipi = Array.isArray(regola.type) ? regola.type : [regola.type];
    const tipoValido = tipi.some(tipo => {
      if (tipo === "null") return valore === null;
      if (tipo === "array") return Array.isArray(valore);
      if (tipo === "object") return valore !== null && typeof valore === "object" && !Array.isArray(valore);
      if (tipo === "integer") return Number.isInteger(valore);
      return typeof valore === tipo;
    });
    if (!tipoValido) { errori.push(`${percorso}: tipo non valido (atteso ${tipi.join("|")})`); return; }
    if (regola.enum && !regola.enum.includes(valore)) errori.push(`${percorso}: valore non valido`);
    if (regola.pattern && !new RegExp(regola.pattern).test(valore)) errori.push(`${percorso}: formato non valido`);
    if (valore !== null && !Array.isArray(valore) && typeof valore === "object") {
      for (const campo of regola.required ?? []) {
        if (!Object.hasOwn(valore, campo)) errori.push(`${percorso}.${campo}: campo obbligatorio mancante`);
      }
      for (const [campo, sottoSchema] of Object.entries(regola.properties ?? {})) {
        if (Object.hasOwn(valore, campo)) verifica(valore[campo], sottoSchema, `${percorso}.${campo}`);
      }
    }
    if (Array.isArray(valore) && regola.items) valore.forEach((elemento, indice) => verifica(elemento, regola.items, `${percorso}[${indice}]`));
  }
  verifica(oggetto, schema, "handover");
  return { valido: errori.length === 0, errori };
}

export function validaFileHandover(pathFile) {
  if (!existsSync(pathFile)) {
    return { valido: false, errori: [`File non trovato: ${pathFile}`] };
  }
  try {
    const raw = readFileSync(pathFile, "utf8");
    const parsed = JSON.parse(raw);
    return validaHandover(parsed);
  } catch (err) {
    return { valido: false, errori: [`Errore di parsing JSON nel file ${pathFile}: ${err.message}`] };
  }
}

// Esecuzione diretta da riga di comando
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const fileTarget = process.argv[2];
  if (!fileTarget) {
    process.stderr.write("Uso: node validate-handover.mjs <PERCORSO_FILE_HANDOVER_JSON>\n");
    process.exit(1);
  }
  const esito = validaFileHandover(fileTarget);
  if (esito.valido) {
    console.log(`[HandoverValidator] ✅ Contratto conforme allo schema v2.1`);
    process.exit(0);
  } else {
    console.error(`[HandoverValidator] ❌ Contratto NON valido:\n  • ${esito.errori.join("\n  • ")}`);
    process.exit(1);
  }
}
