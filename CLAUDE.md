# CLAUDE.md — Earl Weaver Baseball (EWBB)

Please read [`AGENTS.md`](file:///var/home/natex/Projects/EWBB/AGENTS.md) and [`ARCHITECTURE.md`](file:///var/home/natex/Projects/EWBB/ARCHITECTURE.md) for complete multi-agent architecture, coordinate conventions, and module contracts.

## Key Constraints
- **Visual Style:** Style C (Modern Retro-Pro Hybrid) strictly using the **1987 EWB 1.0 split-screen & full-field isometric view** (do NOT use the 1991 EWB II broadcast view).
- **Module Format:** Native browser ES Modules (`import { ... } from './file.js'`) in `src/`.
- **Workspace Scope:** Keep all file operations and commands strictly inside `/var/home/natex/Projects/EWBB`.
- **Sub-Agent Model Selection:** When invoking `claude` or `codex` from the terminal, always use low-cost workhorse models (e.g., `claude -p --model haiku` / `sonnet`, `codex exec -m gpt-5.1-codex-mini`).
