window.__VIBE_STATE__ = {
  "updatedAt": new Date().toISOString(),
  "projectName": "Nexus Cloud Platform",
  "coordDir": ".coord",
  "milestone": {
    "titolo": "Milestone 3 — Payment Gateway, Distributed Cache & Real-Time Analytics UI",
    "stato": "IN CORSO",
    "completamento": 3,
    "totale": 5
  },
  "quotas": {
    "anthropic": {
      "tier": "Scale Tier",
      "fiveHour": 42,
      "sevenDay": 24,
      "fiveHourReset": "fra 1h 48m",
      "sevenDayReset": "fra 3g 12h",
      "status": "healthy"
    },
    "openai": {
      "tier": "Tier 4",
      "usagePercent": 31,
      "status": "healthy"
    },
    "google": {
      "model": "Antigravity 2.0 (Gemini 2.5 Pro)",
      "usagePercent": 18,
      "status": "healthy"
    }
  },
  "agents": [
    {
      "name": "Claude Code",
      "defaultRole": "Frontend Engine & Design System",
      "status": "running",
      "currentTask": "T-003: Real-Time Payment Stream & Checkout UI (in esecuzione)"
    },
    {
      "name": "Codex CLI",
      "defaultRole": "Backend & Distributed Systems",
      "status": "idle",
      "currentTask": "In attesa: T-004 pronto per dispatching"
    },
    {
      "name": "Antigravity AGY",
      "defaultRole": "Lead Architect & Integratore",
      "status": "coordinating",
      "currentTask": "Sorveglianza telemetria e verifica integration test"
    }
  ],
  "tasks": [
    {
      "id": "T-001",
      "titolo": "T-001 — Scaffolding Next.js 15, Tailwind Design System & Auth Session Manager",
      "stato": "INTEGRATO",
      "statoEsteso": "INTEGRATO",
      "proprietario": "Claude Code (Frontend Engine)",
      "fileRiservati": [
        "src/app/layout.tsx",
        "src/app/page.tsx",
        "src/components/ui/Button.tsx",
        "src/components/ui/Card.tsx",
        "tailwind.config.ts"
      ],
      "stoPer": "nulla, il task è chiuso e verificato. Verifiche rieseguite con esito positivo dall'Integratore Antigravity (AGY).",
      "fatti": "- Creato design system con palette Dark Slate e accenti Cyan/Indigo.\n- Configurato Next.js 15 App Router e layout responsive.\n- Tutti i 48 test unitari Vitest superati (100%).\n- Handover redatto e archiviato in .coord/handover/T-001.md."
    },
    {
      "id": "T-002",
      "titolo": "T-002 — Stripe Webhooks & Idempotent Event Ledger su PostgreSQL / Drizzle",
      "stato": "INTEGRATO",
      "statoEsteso": "INTEGRATO",
      "proprietario": "Codex CLI (Backend Engine)",
      "fileRiservati": [
        "src/db/schema/payments.ts",
        "src/lib/stripe/webhook.ts",
        "src/lib/stripe/idempotency.ts",
        "test/payments.test.ts"
      ],
      "stoPer": "nulla, il task è chiuso e verificato. Test di integrazione su PostgreSQL dedicati passati.",
      "fatti": "- Definito schema idempotente per eventi webhook Stripe (`payment_intent.succeeded`).\n- Implementata transazione di lock distribuito per prevenire doppi addebiti.\n- Suite di test con 24 casi di test su DB PostgreSQL locale superata senza regressioni.\n- Handover redatto in .coord/handover/T-002.md."
    },
    {
      "id": "T-003",
      "titolo": "T-003 — Real-Time Payment Stream & Checkout UI con Feedback Live",
      "stato": "IN CORSO",
      "statoEsteso": "IN CORSO",
      "proprietario": "Claude Code (Frontend Engine)",
      "fileRiservati": [
        "src/components/checkout/PaymentStream.tsx",
        "src/components/checkout/CheckoutForm.tsx",
        "src/app/checkout/page.tsx",
        "test/checkout-ui.test.tsx"
      ],
      "stoPer": "Implementare il feedback visivo transazionale e i test di rendering per 3D Secure.",
      "fatti": "- Creato componente PaymentStream.tsx con connessione SSE e stato optimistic.\n- Connesso modulo CheckoutForm con validazione in tempo reale.\n- Streaming dei log attivo via runner.mjs verso .coord/logs/T-003.log."
    },
    {
      "id": "T-004",
      "titolo": "T-004 — Distributed Inventory Sync & Redis Cache Invalidation Layer",
      "stato": "PRONTO",
      "statoEsteso": "PRONTO",
      "proprietario": "Codex CLI (Backend Engine)",
      "fileRiservati": [
        "src/lib/redis/inventory.ts",
        "src/lib/cache/invalidation.ts",
        "test/inventory-sync.test.ts"
      ],
      "stoPer": "In attesa di avvio sessione dopo il completamento di T-003.",
      "fatti": "Task formalmente specificato e approvato dal Direttore."
    },
    {
      "id": "T-005",
      "titolo": "T-005 — Multi-Agent Security Audit & End-to-End Stress Test",
      "stato": "PRONTO",
      "statoEsteso": "PRONTO",
      "proprietario": "Antigravity AGY (Integratore)",
      "fileRiservati": [
        ".coord/audit/security.md",
        "test/e2e/checkout-flow.spec.ts"
      ],
      "stoPer": "Verifica congiunta e collaudo finale di rilascio.",
      "fatti": "Capitolato di verifica definito."
    }
  ],
  "logs": {
    "T-003": [
      "[Runner] 🚀 Sessione Claude Code CLI avviata per task T-003 su workspace /workspace/nexus-core",
      "[Runner] ⚙️ Modalità: --output-format stream-json --verbose",
      "[Claude] 📖 Leggo capitolato task .coord/tasks/T-003.md e vincoli AGENTS.md...",
      "[Claude] 🔧 Tool: ReadFile -> src/components/checkout/PaymentStream.tsx",
      "[Claude] 📄 Esito: Letto con successo (42 righe)",
      "[Claude] 🔧 Tool: ReadFile -> src/lib/stripe/webhook.ts",
      "[Claude] 📄 Esito: Letto con successo (89 righe)",
      "[Claude] 💬 Identificato punto di aggancio per lo streaming delle notifiche di pagamento.",
      "[Claude] 🔧 Tool: EditFile -> src/components/checkout/PaymentStream.tsx",
      "[Claude] 📄 Esito: Applicata patch: gestione stato optimistic e polling di fallback SSE",
      "[Claude] ⏱️ Quota: 5h 42%, 7d 24%",
      "[Claude] 🔧 Tool: Bash -> npm run typecheck",
      "[Claude] 📄 Esito: tsc --noEmit completato con esito 0 (nessun errore)",
      "[Claude] 🔧 Tool: EditFile -> test/checkout-ui.test.tsx",
      "[Claude] 📄 Esito: Aggiunti 6 test per timeout e recupero connessione socket",
      "[Claude] 🔧 Tool: Bash -> npx vitest run test/checkout-ui.test.tsx",
      "[Claude] 📄 Esito: 6 su 6 test superati con successo in 340ms",
      "[Claude] 💬 Ottimizzazione visuale transizione di successo completata. Procedo con la rifinitura dell'handover..."
    ],
    "T-002": [
      "[Runner] 🚀 Sessione Codex CLI avviata per task T-002",
      "[Codex] 📖 Analisi requisiti idempotenza pagamenti...",
      "[Codex] 🔧 Tool: WriteFile -> src/db/schema/payments.ts",
      "[Codex] 🔧 Tool: WriteFile -> src/lib/stripe/idempotency.ts",
      "[Codex] 🔧 Tool: Bash -> npx vitest run test/payments.test.ts",
      "[Codex] 📄 Esito: 24/24 passati",
      "[Codex] ✅ Handover generato in .coord/handover/T-002.md",
      "[Integratore] 🔍 Verifica di conformità eseguita da Antigravity AGY: PASS",
      "[Integratore] 🏷️ Task marcato come INTEGRATO (commit git registrato)"
    ],
    "T-001": [
      "[Runner] 🚀 Sessione Claude Code CLI avviata per task T-001",
      "[Claude] 🔧 Tool: Bash -> npm init -y && npm install next react tailwindcss",
      "[Claude] 🔧 Tool: WriteFile -> tailwind.config.ts",
      "[Claude] 🔧 Tool: Bash -> npm run build",
      "[Claude] 📄 Esito: Build completata con esito 0",
      "[Claude] ✅ Handover redatto in .coord/handover/T-001.md",
      "[Integratore] 🏷️ Task T-001 marcato come INTEGRATO"
    ]
  }
};

if (typeof window !== "undefined" && typeof window.__onVibeStateLoaded === "function") {
  window.__onVibeStateLoaded(window.__VIBE_STATE__);
}
