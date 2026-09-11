# Vibe Multiagent 🤖⚡

[![CI](https://github.com/acarducci65-svg/vibe-multiagent-public/actions/workflows/ci.yml/badge.svg)](https://github.com/acarducci65-svg/vibe-multiagent-public/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude Code Skill](https://img.shields.io/badge/Claude_Code-skill-d97757?logo=anthropic)](https://docs.anthropic.com/en/docs/claude-code)
[![Antigravity Skill](https://img.shields.io/badge/Antigravity-skill-4285F4?logo=google)](https://github.com/google)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5_18.0-339933?logo=nodedotjs)](https://nodejs.org)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

> **A rigorous multi-agent coding framework and visual Control Room for Claude Code, OpenAI Codex, and Google Antigravity (AGY).**

`vibe_multiagent` orchestrates teams of autonomous AI coding agents running on flat-rate CLI subscriptions (zero pay-per-token API consumption). It provides strict role separation, mechanical safety guardrails (hooks), an interactive real-time visual Control Room, and complete file-based auditability via Git.

[Italian Documentation (Documentazione in Italiano)](README.md)

---

## 🎯 Key Objectives

1. **Multi-Environment Architecture**: Seamlessly operate inside **VS Code**, inside **Antigravity IDE**, or via **Independent Terminals**.
2. **Three Independent Quotas**: Work across Anthropic (Claude), Google (AGY), and OpenAI (Codex) quotas. Never get stalled when one vendor hits rate limits.
3. **Rigorous Integration Gate**: Only the designated **Lead Orchestrator** validates and marks tasks as `INTEGRATED` after personally re-running all test suites and verifications.
4. **Mechanical Guardrails**: Pre-tool hooks automatically block unapproved `git push`, production deploys, schema migrations, and out-of-bounds deletions.
5. **Interactive Visual Control Room**: Standalone, dark-mode HTML5 dashboard (`.coord/dashboard.html`) and log streaming runner (`runner.mjs`) to eliminate the "black box" effect of background agent sessions.
6. **Zero External Dependencies**: All core telemetry and gate tools run on standard Node.js without npm dependencies.

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

The orchestrator reads `setup_skill.md` and begins the interactive 12-question interview to establish project scope, boundaries, agent roles, and verification strategies.

---

## 🎮 Visual Control Room (`.coord/dashboard.html`)

- **Standalone Offline Dashboard**: Runs purely in-browser without external CDN or npm packages.
- **Live Fleet Telemetry**: Displays real-time status of each agent (`Claude Code`, `Codex CLI`, `Antigravity AGY`), active task, and recent actions.
- **Real-Time Terminal Streaming**: Multiplexes child process stdout/stderr into `.coord/logs/<TASK_ID>.log` with auto-scrolling log tabs.
- **Sprint Kanban**: Tracks tasks across the protocol's native states: `PRONTO` (Ready), `IN CORSO` (In Progress), `CONSEGNATO` (Delivered), `INTEGRATO` (Integrated), `SOSPESO` (Suspended/Blocked), and `CHIUSO` (Closed).

---

## 🔒 Privacy and Security

- **100% Local Execution**: No project code, telemetry, or user prompts are ever sent to third-party tracking servers.
- **Opt-In Quota Monitoring**: The Anthropic quota sensor (`tools/quota-anthropic.mjs`) is disabled by default. It can be explicitly enabled with `VIBE_ANTHROPIC_QUOTA=1`. It never reads or scans conversation histories of other projects.
- **Security Policy**: See [SECURITY.md](SECURITY.md) for full disclosure and guidelines.

---

## 🧪 Testing

Run the automated test suite locally:
```bash
npm test
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
