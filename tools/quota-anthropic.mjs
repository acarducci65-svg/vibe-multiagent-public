#!/usr/bin/env node
// Sensore opzionale di utilizzo della quota Anthropic (Claude Code).
// Esce sempre con codice 0: non deve mai bloccare il flusso chiamante.
//
// NOTA PRIVACY E SICUREZZA:
// Questo script e' DISABILITATO di default per proteggere la privacy dell'utente.
// Per abilitarlo esplicitamente, impostare la variabile d'ambiente:
//   export VIBE_ANTHROPIC_QUOTA=1  (Linux/macOS)
//   $env:VIBE_ANTHROPIC_QUOTA="1"   (PowerShell)
//
// Se abilitato, legge unicamente il token OAuth locale generato dalla CLI di Claude
// in ~/.claude/.credentials.json e interpella l'endpoint https://api.anthropic.com/api/oauth/usage.
// NON scansiona ne' legge mai i file delle conversazioni o i progetti dell'utente.
// La connessione HTTPS viene sempre rigorosamente verificata; nessun token viene mai
// inviato su canali con certificato non verificabile o insicuro.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const CACHE = join(tmpdir(), "quota-anthropic-vibe.json");
const TTL_MS = 60_000;

const out = (o) => {
  process.stdout.write(JSON.stringify(o));
  process.exitCode = 0;
};

// 1. Verifica Opt-In: disabilitato di default
if (process.env.VIBE_ANTHROPIC_QUOTA !== "1" && !process.env.VIBE_MOCK_QUOTA_PAYLOAD) {
  out({
    ok: false,
    source: "disabled",
    fiveHourPct: null,
    sevenDayPct: null,
    resetsAt: null,
    note: "Sensore quota opzionale disattivato. Imposta VIBE_ANTHROPIC_QUOTA=1 per abilitarlo.",
  });
  process.exit(0);
}

// 2. Modalita' Mock (utilizzata per test automatici offline e CI)
if (process.env.VIBE_MOCK_QUOTA_PAYLOAD) {
  try {
    const mock = JSON.parse(process.env.VIBE_MOCK_QUOTA_PAYLOAD);
    if (!mock || typeof mock !== "object" || Array.isArray(mock)) {
      throw new Error("Il payload mock deve essere un oggetto JSON");
    }
    out(mock);
    process.exit(0);
  } catch (err) {
    out({
      ok: false,
      source: "error",
      fiveHourPct: null,
      sevenDayPct: null,
      resetsAt: null,
      note: `VIBE_MOCK_QUOTA_PAYLOAD non e' valido: ${err.message}`,
    });
    process.exit(0);
  }
}

function daCache() {
  if (process.env.VIBE_NO_CACHE) return null;
  try {
    const c = JSON.parse(readFileSync(CACHE, "utf8"));
    if (Date.now() - c.t < TTL_MS) return { ...c.v, source: "cache" };
  } catch {}
  return null;
}

function token() {
  try {
    const credPath = join(homedir(), ".claude", ".credentials.json");
    if (!existsSync(credPath)) return "";
    const d = JSON.parse(readFileSync(credPath, "utf8"));
    return d?.accessToken ?? d?.claudeAiOauth?.accessToken ?? "";
  } catch {
    return "";
  }
}

const TLS_CERT_ERROR_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

function estraiCodiceCertificato(err) {
  let curr = err;
  while (curr) {
    if (curr.code && TLS_CERT_ERROR_CODES.has(curr.code)) {
      return curr.code;
    }
    curr = curr.cause;
  }
  return null;
}

async function eseguiFetch(t) {
  const r = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();

  const fiveHour = typeof j?.five_hour?.utilization === "number" ? j.five_hour.utilization
    : typeof j?.five_hour?.utilization_pct === "number" ? j.five_hour.utilization_pct
    : typeof j?.fiveHourPct === "number" ? j.fiveHourPct : null;

  const sevenDay = typeof j?.seven_day?.utilization === "number" ? j.seven_day.utilization
    : typeof j?.seven_day?.utilization_pct === "number" ? j.seven_day.utilization_pct
    : typeof j?.sevenDayPct === "number" ? j.sevenDayPct : null;

  const resetsAt = j?.five_hour?.resets_at ?? j?.seven_day?.resets_at ?? j?.resetsAt ?? null;

  if (fiveHour === null && sevenDay === null) {
    throw new Error("Schema risposta quota non riconosciuto");
  }

  return {
    ok: true,
    source: "live",
    fiveHourPct: fiveHour,
    sevenDayPct: sevenDay,
    resetsAt: resetsAt,
    note: "",
  };
}

const cache = daCache();
if (cache) {
  out(cache);
} else {
  let v;
  const t = token();

  if (!t) {
    out({
      ok: false,
      source: "unavailable",
      fiveHourPct: null,
      sevenDayPct: null,
      resetsAt: null,
      note: "Nessun token OAuth trovato in ~/.claude/.credentials.json.",
    });
    process.exit(0);
  }

  try {
    v = await eseguiFetch(t);
    if (v.ok) {
      try { writeFileSync(CACHE, JSON.stringify({ t: Date.now(), v })); } catch {}
    }
  } catch (e) {
    const certCode = estraiCodiceCertificato(e);
    if (certCode) {
      v = {
        ok: false,
        source: "unavailable",
        fiveHourPct: null,
        sevenDayPct: null,
        resetsAt: null,
        note: `Certificato TLS non verificabile (${certCode}). Per autorizzare la CA di rete imposta NODE_EXTRA_CA_CERTS=/path/ca.pem oppure usa il flag --use-system-ca di Node.`,
      };
    } else {
      v = {
        ok: false,
        source: "unavailable",
        fiveHourPct: null,
        sevenDayPct: null,
        resetsAt: null,
        note: "Endpoint quota non raggiungibile (" + String(e.message) + ").",
      };
    }
  }
  out(v);
}
