# Vibe Multiagent 🤖⚡

<p align="center">
  <img src="demo/control-room-demo.gif" alt="Vibe Multiagent Live Control Room" width="100%">
</p>

[![CI](https://github.com/acarducci65-svg/vibe-multiagent-public/actions/workflows/ci.yml/badge.svg)](https://github.com/acarducci65-svg/vibe-multiagent-public/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude Code Skill](https://img.shields.io/badge/Claude_Code-skill-d97757?logo=anthropic)](https://docs.anthropic.com/en/docs/claude-code)
[![Antigravity Skill](https://img.shields.io/badge/Antigravity-skill-4285F4?logo=google)](https://github.com/google)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5_18.0-339933?logo=nodedotjs)](https://nodejs.org)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

> **Framework and Skill for initializing, coordinating, and orchestrating multi-agent AI development teams with Claude Code, Antigravity (AGY), and OpenAI Codex CLI.**

`vibe_multiagent` is a universal skill for AI-assisted software development, specifically designed to orchestrate teams of autonomous local coding agents on flat-rate CLI subscriptions (zero pay-per-token API consumption). It provides strict role separation, mechanical safety guardrails (hooks), a real-time visual Control Room (`dashboard.html`), and complete auditability via the local filesystem and Git.

> 💡 **Dogfooding & Transparency**: This entire framework, test suite, and mechanical guardrail system were conceived, engineered, and battle-tested autonomously in a multi-agent workflow by the AI agents themselves (**Google Antigravity AGY**, **Claude Code**, and **OpenAI Codex CLI**) under the continuous human architectural direction and supervision of **Alessandro Carducci** (strictly adhering to the *Human-in-the-Loop* / Director principle).

[Documentazione in Italiano (Italian Documentation)](README.md)

---

## 🎯 Key Objectives

1. **Multi-Environment Architecture**: Seamlessly operate inside **VS Code**, inside **Google Antigravity IDE**, or across **Independent Terminals**.
2. **Three Independent Quotas**: Work across Anthropic (Claude), Google (AGY), and OpenAI (Codex) quotas. Never get stalled when one vendor hits rate limits.
3. **Rigorous Integration Gate**: Only the designated **Lead Orchestrator** validates and marks tasks as `INTEGRATED` after personally re-running all test suites and verifications.
4. **Mechanical Guardrails**: Pre-tool hooks automatically block unapproved `git push`, production deploys, schema migrations, and out-of-bounds deletions.
5. **Interactive Visual Control Room**: Standalone, dark-mode HTML5 dashboard (`.coord/dashboard.html`) and log streaming runner (`runner.mjs`) to eliminate the "black box" effect of background agent sessions.
6. **Zero External Dependencies**: All core telemetry and gate tools run on standard Node.js without third-party npm runtime dependencies.

---

## 🏗️ The Three Operational Topologies

| # | Environment | Host Environment | Lead Orchestrator & Integrator | Collaborating Executors | Key Characteristics |
|---|---|---|---|---|---|
| **A** | **VS Code + Claude Extension** | VS Code | **Claude Code** *(Lead & Integrator)* | Codex CLI, AGY CLI | Primary workflow inside VS Code with Claude extension. |
| **B** | **Antigravity IDE** | Antigravity IDE | **AGY** *(Dispatcher & Integrator)* | Claude CLI, Codex CLI | AGY dispatches tasks in background; hooks enforce safety via `.agents/hooks.json`. |
| **C** | **Separate Terminals** | Independent Shells | **Claude Code** *(Lead & Integrator)* | Codex CLI, AGY CLI | Maximum visual separation with asynchronous file-based coordination. |

---

## 📦 Quick Installation

Clone or copy this repository into your agent's skills directory:

### For Claude Code
```bash
# Linux/macOS
git clone https://github.com/acarducci65-svg/vibe-multiagent-public.git ~/.claude/skills/vibe_multiagent

# Windows (PowerShell)
git clone https://github.com/acarducci65-svg/vibe-multiagent-public.git "$HOME\.claude\skills\vibe_multiagent"
```

### For Antigravity IDE
```bash
# Windows (PowerShell)
git clone https://github.com/acarducci65-svg/vibe-multiagent-public.git "$HOME\.gemini\config\skills\vibe_multiagent"
```

---

## 🚀 How to Launch Project Setup

In any new project or existing repository:

### In Claude Code:
```text
start project with vibe_multiagent
```

### In Antigravity IDE (AGY):
```text
start project setup with vibe_multiagent
```

The orchestrator reads `setup_skill.md` and begins the interactive 12-question interview to establish project scope, boundaries, agent roles, and verification strategies:

1. **Question 0 — Folder & Git**: Identifies the absolute project path and coordination folder name (default `.coord/`). If Git is not initialized, prompts to initialize it.
2. **Question 0-bis — Environment & Topology**: Selects Environment A (VS Code), Environment B (Antigravity IDE), or Environment C (Separate Terminals).
3. **Question 1 — Purpose & Value**: Identifies the core problem being solved, the target audience, and the observable criteria for Version 1 success.
4. **Question 2 — Users & Platforms**: Target platforms (web, desktop Electron, mobile, CLI) and prioritized user experience.
5. **Question 3 — Data & Privacy Boundaries**: Presence of sensitive/personal data, local vs. cloud storage, and non-negotiable privacy boundaries.
6. **Question 4 — Stack & Technical Constraints**: Mandatory, preferred, or forbidden technologies (runtime, DB, libraries) and hosting cost limits.
7. **Question 5 — Core Entities & Data Flows**: The 3–5 foundational application entities and how data flows between them.
8. **Question 6 — Integrations**: Which third-party services or files enter Version 1 and which are explicitly out of scope.
9. **Question 7 — Architecture & Testing Strategy**: Architectural pattern, decoupling level, testing harness, and mandatory gates before release.
10. **Question 8 — Development Lifecycle & Deployment**: Branching policy, CI/CD pipeline, staging/production environments, and human-only deployment gates.
11. **Question 9 — Agents, Providers & Quota Strategy**:
    - Authenticated CLIs (`claude`, `agy`, `codex`).
    - **Provider vs Model Evaluation**: Strict data boundary assessment (e.g. Sonnet run inside Antigravity routes through Google infrastructure, not Anthropic).
    - Rate limit fallback policy: who replaces whom, and which critical tasks must **not** be substituted but wait for quota reset.
12. **Question 10 — Initial Milestone & Reserved Decisions**: Sprint 1 scope, initial task breakdown, and decisions reserved exclusively for the human user (Director).

---

## 🔍 System Technical Preflight

Before presenting the setup proposal, the skill performs automated preflight diagnostics on the local environment:

```text
[Preflight Check]
├── 1. CLI Executable Resolution (fixed absolute path vs. environment PATH)
├── 2. Contaminated Terminal Session Detection (ELECTRON_RUN_AS_NODE)
├── 3. .gitattributes Configuration Verification (LF normalization on Windows)
└── 4. (Environment B) Global Hook Integrity and .agents/ Directory Verification
```

- **Stale PATH Resolution**: On Windows, if a CLI tool was recently installed but is missing from the active terminal session, the skill checks standard install paths (`%LOCALAPPDATA%\agy\bin`, `%USERPROFILE%\.claude\...`, global npm), avoiding false-negative warnings.
- **EOL Normalization**: Ensures `.gitattributes` contains `* text=auto eol=lf` to prevent build and test failures caused by accidental CRLF conversions.

---

## 📝 Proposal, Approval & Generated Files

At the end of the interview, the agent presents a **formal summary document** containing:
- Chosen operational environment (A, B, or C) and assigned agent roles.
- Allowed and prohibited boundaries for each role.
- Architecture summary and non-negotiable constraints.
- Complete list of files to be generated.

> **Golden Rule**: No file is written to disk until the human user provides **explicit approval** ("Yes" or requested edits).

### Generated Project Structure:
```text
my-project/
├── AGENTS.md                 # Operating protocol and non-negotiable constraints
├── .agents/                  # (Environment B only - Antigravity IDE)
│   ├── hooks.json            # PreToolUse, PostToolUse, and PreInvocation hook configuration
│   └── rules/
│       └── multiagent-coordinator.md # Permanent workspace rule for Dispatcher/Integrator
└── .coord/                   # Project coordination directory
    ├── PROJECT.md            # Single source of truth for business and architecture
    ├── CURRENT_SPRINT.md     # Active milestone, completion criteria, and risk registry
    ├── DECISIONS.md          # Architectural Decision Records (D-001, D-002, ...)
    ├── DISPATCH.md           # (Environment B only) Manual for AGY dispatcher
    ├── agents/
    │   ├── verifica-tecnica/agent.md   # Codex role definition (if enabled)
    │   └── verifica-ui/agent.md        # AGY role definition (if enabled)
    ├── tasks/
    │   └── T-001.md          # First task specification with owner and resume checkpoint
    └── handover/             # Completed task handover reports directory
```

---

## 🛡️ Mechanical Guardrails (Environment B — Antigravity Hooks)

In Antigravity IDE, critical safety rules are never left to stochastic model memory; they are enforced mechanically by deterministic Node.js scripts hooked into IDE events:

- **`agy-gate.mjs` (`PreToolUse`)**: Intercepts and immediately denies unauthorized destructive actions: `git push`, `npm publish`, cloud deployments (Vercel, AWS, GCP), database migrations, and permission-bypass flags (`--dangerously-skip-permissions`). Prompts for human confirmation (`ask`) for deletions outside the workspace.
- **`agy-checkpoint.mjs` (`PostToolUse`)**: On every file modification, automatically appends `- Facts: <date> — modified: <file> — last commit: <hash>` into the `Resume Checkpoint` of the active `IN CORSO` task.
- **`agy-quota-banner.mjs` (`PreInvocation`)**: Injects an unyielding role reminder into **every single turn** (Dispatcher & Integrator) to prevent the agent from acting as a rogue solo coder on ad-hoc requests, alongside an Anthropic quota status gauge when relevant.
- **`.agents/rules/multiagent-coordinator.md` (Workspace Rule)**: Permanent hierarchical rule loaded into the Antigravity system prompt forbidding direct application code modifications without an approved task specification.

---

## 🔄 Task Lifecycle and Quota Policy

```text
       ┌──────────┐
       │  PRONTO  │ (Ready)
       └────┬─────┘
            │  (Assign owner + initialize Resume Checkpoint)
            ▼
       ┌──────────┐      (Error / Quota Exhaustion)     ┌──────────┐
       │ IN CORSO ├────────────────────────────────────►│ SOSPESO  │ (Suspended)
       └────┬─────┘                                     └────┬─────┘
            │                                                │ (Substitution or reset)
            │ (Work completed + Handover written)            │
            ▼                                                │
       ┌────────────┐                                        │
       │ CONSEGNATO │◄───────────────────────────────────────┘
       └────┬───────┘ (Delivered)
            │  (ONLY the Lead Orchestrator re-runs all verification suites)
            ▼
       ┌───────────┐
       │ INTEGRATO │ (Integrated)
       └───────────┘
```

### Quota Exhaustion Policy
In task files (`TASK.md`), substitution trade-offs are evaluated across two explicit dimensions:
1. **Cost — Capability**: Estimated velocity or quality drop when delegating to a secondary model.
2. **Cost — Assurance**: Methodological promises lost (e.g. strict independence between code author and test author). If the assurance loss is unacceptable, the task specifies:
   ```text
   Fallback Agent: no substitution, wait for quota reset
   ```

---

## 🛡️ Operational Lessons & Real-World Field Experience

This protocol directly incorporates empirical lessons learned from complex multi-agent production projects:

1. **Filesystem Reality vs Process Exit Code**:
   - An agent (e.g. Codex CLI) can exit with code 1 simply because rate limits triggered in the final second, despite having already completed code, tests, and handover with 100% success. The orchestrator **must always inspect `git status` and modified files** before declaring a task aborted.
2. **Codex CLI Robustness**:
   - **Model Forcing (`-m`)**: Explicitly designate models (e.g. `-m gpt-6-astra` or `-m gpt-5.6-terra`) and periodically review via `codex --version`.
   - **Headless Authorization**: Prompts must explicitly declare non-interactive mode to prevent agents waiting indefinitely for interactive terminal confirmation.
   - **Sandbox & Vitest**: Codex sandbox lacks network access (`npm install` is disabled) and restricts child processes. To execute Vitest cleanly without `spawn EPERM`, use `npx vitest run --configLoader runner <file>`.
3. **AGY CLI Robustness**:
   - **Dynamic Shell Command Limits**: Exact character matching in `command(...)` makes pre-authorizing shell commands difficult due to formatting variations (slashes, stdout redirection). Prioritize headless AGY CLI for tasks with static input files already on disk (`read_file`) or pre-approved deterministic commands.
   - **Real Model Names (`agy models`)**: Always query supported models with `agy models` (e.g. `gemini-3.1-pro-high`, `gemini-3.8-flash-*`) before forcing `--model`.
   - **Out-of-Scope Command Guardrail**: Explicitly forbid running full repository test suites or heavy unrelated commands inside task prompts to prevent timeouts.
   - **Mandatory Handover**: Mandate that writing the handover report is the final tool call before ending the session.
   - **Diagnosis via Transcript**: If an execution stalls with `"jetski: no output produced"`, inspecting `transcript.jsonl` under `PLANNER_RESPONSE` pinpointed the blocked command within 60 seconds.
4. **Git Coordination in Shared Working Tree**:
   - While a delegated executor works in the working tree, the Integrator **does not run Git write commands** (`commit`, `add`, `switch`, `merge`), avoiding `index.lock` collisions.
   - The Integrator positions the repository on the target branch; the executor edits files without touching Git.
5. **Primary Source Discipline (Anti-Paraphrasing)**:
   - No agent may turn paraphrased summaries from previous handovers into project rules: primary sources must always be verified directly.
   - Tasks must state parameters and schemas explicitly to expose discrepancies before code implementation.
6. **Re-verification of Workarounds**:
   - Every architectural record in `DECISIONS.md` introducing a temporary workaround must include an explicit re-verification trigger or expiration date.
7. **Windows / OneDrive Filesystem Resilience**:
   - Automatic retry handling for transient concurrent file locks on `.git/`.

---

## 🎮 Visual Control Room & Real-Time Log Streaming (`.coord/dashboard.html`)

In multi-agent sessions, background processes can feel like an opaque "black box". `vibe_multiagent` solves this with an **interactive local Control Room**:

- **Standalone HTML5 Dashboard**: Located in `.coord/dashboard.html`, runs completely offline with zero npm dependencies or external CDNs.
- **Fleet Telemetry**: Real-time animated cards showing which agent is working (`Claude Code`, `Codex CLI`, `Antigravity AGY`), active tasks, and recent actions.
- **Real-Time Log Stream**: Multiplexed by `tools/runner.mjs`, allows switching between task tabs to read stdout/stderr with auto-scrolling.
- **Sprint Kanban**: Tracks tasks across states (`PRONTO`, `IN CORSO`, `CONSEGNATO`, `INTEGRATO`, `SOSPESO`), reserved files touched, and completed milestones.
- **Quota & Provider Gauges**: Visual gauges monitoring 5-hour and 7-day quota thresholds.

### 🕹️ Try the Interactive Sandbox Demo (`demo/`)
This repository includes a standalone, zero-setup interactive demo simulating a live sprint with synthetic telemetry:
- **Windows**: Double-click `demo/apri-demo.cmd` to instantly launch the sandbox in your default browser.
- **Linux/macOS**: Open `demo/dashboard.html` in any browser.

---

## 🔒 Privacy, Security & Legal Notices

### 1. Privacy Model and Local Execution
- **Zero Hidden Telemetry & 100% Local Execution**: `vibe_multiagent` does not collect user data, prompt contents, or project code. The entire framework runs **exclusively on your local filesystem**. The optional script `tools/quota-anthropic.mjs` is **disabled by default**; only if explicitly enabled with `VIBE_ANTHROPIC_QUOTA=1`, it queries `api.anthropic.com` using your local CLI token to retrieve rate-limit percentages. No project code or conversations are ever transmitted. See [SECURITY.md](SECURITY.md) for full details.
- **Zero Secrets in Repository**: No credentials, passwords, or API keys are stored in the codebase or templates.
- **Provider Data Boundaries**: Interview Question 9 explicitly differentiates *model* from *provider*, preventing proprietary internal code from routing through unauthorized third-party infrastructure.

### 2. Trademark Disclaimers
- **Anthropic®**, **Claude®**, and **Claude Code®** are registered trademarks of Anthropic PBC.
- **OpenAI®**, **ChatGPT®**, and **Codex®** are registered trademarks of OpenAI, Inc.
- **Google®** and **Antigravity®** are registered trademarks of Google LLC.
- **Microsoft®**, **Windows®**, and **Visual Studio Code / VS Code®** are registered trademarks of Microsoft Corporation.

*`vibe_multiagent` is an independent, community-driven open-source project and is not affiliated with, endorsed by, sponsored by, or officially supported by Anthropic, Google, OpenAI, or Microsoft.*

### 3. Limitation of Liability
The software is provided "AS IS", without warranty of any kind, express or implied. The user retains full control and ultimate responsibility for all actions, shell commands executed by orchestrated CLIs, and repository modifications.

---

## 🧪 Running Unit Tests

Verify the entire suite of mechanical guardrails and telemetry tools locally with one command:
```bash
npm test
```

Or execute individual test modules directly:
```bash
node tools/test/agy-gate.test.mjs
node tools/test/agy-checkpoint.test.mjs
node tools/test/quota-anthropic.test.mjs
node tools/test/agy-quota-banner.test.mjs
node tools/test/telemetry.test.mjs
node tools/test/runner.test.mjs
```

---

## 📂 Repository Structure

```text
vibe-multiagent/
├── .github/
│   └── workflows/
│       └── ci.yml                # Cross-platform CI pipeline (Ubuntu, Windows, macOS)
├── .gitattributes                # Cross-platform LF line-ending normalization
├── .gitignore                    # Git ignore rules for telemetry and temp files
├── package.json                  # Package definition and npm test scripts
├── LICENSE                       # MIT License (Alessandro Carducci)
├── SECURITY.md                   # Security policy and quota transparency disclosures
├── CONTRIBUTING.md               # External contributor workflow and standards
├── CODE_OF_CONDUCT.md            # Contributor Covenant v2.1 code of conduct
├── README.md                     # Comprehensive Italian documentation
├── README.en.md                  # Comprehensive English documentation
├── SKILL.md                      # Primary entry point for Claude Code
├── setup_skill.md                # Full 12-question interview & setup protocol
├── demo/                         # Standalone interactive Control Room sandbox
│   ├── apri-demo.cmd             # Windows 1-click launcher
│   ├── dashboard.html            # Offline interactive sandbox dashboard
│   ├── state.js                  # Simulated multi-agent sprint telemetry
│   ├── social-preview.png        # Official 1280x640 GitHub preview card
│   └── control-room-demo.gif     # High-definition animated showcase
├── scripts/
│   └── generate_social_preview.ps1 # Social preview card generator script
├── templates/                    # Production templates for generated projects
│   ├── AGENTS.md.template
│   ├── AGENT_ROLE.md.template
│   ├── CURRENT_SPRINT.md.template
│   ├── dashboard.html.template   # Interactive visual Control Room (dark mode)
│   ├── DECISIONS.md.template
│   ├── DISPATCH.md.template      # AGY Dispatcher operational guide (Environment B)
│   ├── HANDOVER.md.template
│   ├── hooks.json.template       # Antigravity hook configuration (Environment B)
│   ├── multiagent-rule.md.template # Antigravity permanent workspace rule (Environment B)
│   ├── PROJECT.md.template
│   └── TASK.md.template
└── tools/                        # Antigravity hooks, process runner & telemetry engine
    ├── agy-gate.mjs              # PreToolUse anti-distraction guardrail
    ├── agy-checkpoint.mjs        # PostToolUse on-disk fact checkpointing
    ├── agy-quota-banner.mjs      # PreInvocation banner & quota traffic light
    ├── quota-anthropic.mjs       # Claude quota sensor (opt-in VIBE_ANTHROPIC_QUOTA=1)
    ├── runner.mjs                # Process runner with multiplexed log streaming
    ├── telemetry.mjs             # Telemetry engine and state.json generator
    └── test/                     # Automated unit test suite
        ├── agy-gate.test.mjs
        ├── agy-checkpoint.test.mjs
        ├── agy-quota-banner.test.mjs
        ├── quota-anthropic.test.mjs
        ├── runner.test.mjs
        └── telemetry.test.mjs
```

---

## 🤝 Community, Contributing & Code of Conduct

We warmly welcome contributions, bug reports, and suggestions from the community:
- Read our [Contributing Guidelines](CONTRIBUTING.md) to understand standards (zero runtime dependencies, deterministic test suite, and local privacy hygiene).
- To foster an open and inclusive community, all participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md) (adapted from Contributor Covenant v2.1).
- For security and vulnerability reporting, refer to our [Security Policy](SECURITY.md).

---

## 📄 License

Distributed under the **MIT License** © 2026 Alessandro Carducci. See [LICENSE](LICENSE) for details.
