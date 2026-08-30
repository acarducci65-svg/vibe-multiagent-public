#!/usr/bin/env node
// Utilizzo residuo della quota Anthropic. Esce sempre 0: mai far cadere il chiamante.
// NOTA: I campi LETTURA_TOKEN, CAMPO_CINQUE_ORE, CAMPO_SETTE_GIORNI, CAMPO_RESET
// sono placeholder. Prima di usare questo script:
// 1. Scopri la forma delle credenziali:
//    node -e "const d=JSON.parse(require('fs').readFileSync(process.env.USERPROFILE+'/.claude/.credentials.json','utf8')); const walk=(o,p='')=>{for(const[k,v]of Object.entries(o)){if(v&&typeof v==='object') walk(v,p+'/'+k); else console.log(p+'/'+k, typeof v==='string'&&v.length>20?'<stringa lunga>':v);}};walk(d);"
// 2. Scopri la forma della risposta con fetch all'endpoint
// 3. Sostituisci i placeholder con i percorsi osservati
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const CACHE = join(tmpdir(), "quota-anthropic-vibe.json");
const TTL_MS = 60_000;
const out = (o) => {
  process.stdout.write(JSON.stringify(o));
  process.exitCode = 0;
};

function daCache() {
  try {
    const c = JSON.parse(readFileSync(CACHE, "utf8"));
    if (Date.now() - c.t < TTL_MS) return { ...c.v, source: "cache" };
  } catch {}
  return null;
}

function token() {
  const d = JSON.parse(readFileSync(join(homedir(), ".claude", ".credentials.json"), "utf8"));
  // LETTURA_TOKEN: sostituire con il percorso osservato al passo di scoperta
  // Esempio: return d.accessToken;
  return d?.accessToken ?? d?.claudeAiOauth?.accessToken ?? "";
}

// Ultima risorsa: l'ultimo rifiuto registrato nei transcript dice se siamo bloccati adesso.
function daTranscript() {
  try {
    const dir = join(homedir(), ".claude", "projects");
    let ultimo = null;
    for (const p of readdirSync(dir)) {
      let file = [];
      try { file = readdirSync(join(dir, p)).filter((x) => x.endsWith(".jsonl")); } catch { continue; }
      for (const f of file) {
        for (const riga of readFileSync(join(dir, p, f), "utf8").split("\n")) {
          const m = riga.match(/"quotaLimits":(\{[^}]*\})/);
          if (m) { const q = JSON.parse(m[1]); if (!ultimo || q.resetsAt > ultimo.resetsAt) ultimo = q; }
        }
      }
    }
    if (!ultimo) return null;
    const bloccato = ultimo.resetsAt * 1000 > Date.now();
    return {
      ok: true, source: "stale",
      fiveHourPct: bloccato && ultimo.rateLimitType === "five_hour" ? 100 : null,
      sevenDayPct: bloccato && ultimo.rateLimitType === "seven_day" ? 100 : null,
      resetsAt: ultimo.resetsAt,
      note: bloccato ? `bloccato su ${ultimo.rateLimitType}` : "nessun blocco attivo, percentuali ignote",
    };
  } catch { return null; }
}

const cache = daCache();
if (cache) {
  out(cache);
} else {
  let v;
  try {
    const r = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const fiveHour = typeof j?.five_hour?.utilization_pct === "number" ? j.five_hour.utilization_pct
      : typeof j?.fiveHourPct === "number" ? j.fiveHourPct : null;
    const sevenDay = typeof j?.seven_day?.utilization_pct === "number" ? j.seven_day.utilization_pct
      : typeof j?.sevenDayPct === "number" ? j.sevenDayPct : null;
    const resetsAt = j?.five_hour?.resets_at ?? j?.resetsAt ?? null;
    
    if (fiveHour === null && sevenDay === null) {
      // Schema non riconosciuto: degrada a transcript o unknown
      v = daTranscript() ?? { ok: false, source: "unknown", fiveHourPct: null, sevenDayPct: null, resetsAt: null, note: "schema risposta API non riconosciuto" };
    } else {
      v = {
        ok: true, source: "live",
        fiveHourPct: fiveHour,
        sevenDayPct: sevenDay,
        resetsAt: resetsAt,
        note: "",
      };
      try { writeFileSync(CACHE, JSON.stringify({ t: Date.now(), v })); } catch {}
    }
  } catch (e) {
    v = daTranscript() ?? { ok: false, source: "unknown", fiveHourPct: null, sevenDayPct: null, resetsAt: null, note: String(e.message) };
  }
  out(v);
}
