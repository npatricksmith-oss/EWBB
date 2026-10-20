# EWBB Historical Teams & Rosters Tracking

This directory tracks the multi-agent effort to collect, verify, and ingest all teams, rosters, and statistics from the original 1987 *Earl Weaver Baseball* (EWB 1.0).

## Agent Architecture & Roles
- **Coordinator:** Claude Code Opus 5.5 (`claude-opus-5-5`)
  - Plans tasks, maintains tracking files, reviews worker outputs, and performs final schema ingestion into `src/data/rosters.js`.
  - Flags any blockers or questions in `BLOCKERS_AND_QUESTIONS.md` for Antigravity to report to the user.
- **Workers:**
  - **Claude Haiku 5.5** (`claude-haiku-5-5`): Fast research, player stat extraction, and L/R split compilation.
  - **Codex Luna 6** (`gpt-6-luna`): Statistical verification, schema validation, and roster code generation.
- **Liaison & Host:** Antigravity (Gemini Flash)
  - Manages background daemons, monitors progress, and reports questions/blockers to the user.

## Dispatching Workers from Opus
Opus can invoke low-cost workers directly from bash using the project dispatcher:
```bash
# Dispatch Claude Haiku 5.5
python3 bin/dispatch.py haiku "<prompt>"

# Dispatch Codex Luna 6
python3 bin/dispatch.py luna "<prompt>"
```

The dispatcher handles IPC with the container worker daemon and returns stdout directly to Opus.

## Directory Layout
- `STATUS.md`: Current phase, active tasks, completed milestones.
- `TEAMS_MANIFEST.md`: Complete list of target teams, rosters, player counts, and verification status.
- `BLOCKERS_AND_QUESTIONS.md`: Issues requiring user clarification.
- `tasks/`: Individual task specifications and worker prompts.
- `results/`: Raw outputs and data collected by Haiku and Luna workers.
- `queue/`: Internal IPC queue for worker requests/responses.
