# Worker model comparison

One row per worker run. Wall time runs from launch to exit. Quality is the coordinator's judgment after checking the output against sources.

| Date | Task | CLI | Model | Wall time | Output | Quality notes |
|---|---|---|---|---|---|---|
| 2026-10-22 | Windup vs. stretch research | codex | `gpt-5.1-codex-mini` | ~1 s | none | Failed: model not supported on a ChatGPT account. |
| 2026-10-22 | Windup vs. stretch research | codex `--search` | `gpt-6-luna` (medium effort) | 1 min 10 s | 12 KB, 82k tokens | Accurate and careful. 13 working URLs (MLB rules, coaching manuals, PMC papers). Marks unsourced claims as unverified. Watched no video; cited two clips without describing them. |
| 2026-10-22 | Windup vs. stretch research | agy | `gemini-3.8-flash-medium` | 6 min 34 s | 29 KB | More detail (angles, durations, per-phase tables) but less trustworthy. All four YouTube links are broken (search redirect tokens, not video IDs). Retro-game frame counts have no source yet are labelled "verified". Rule and timing numbers agree with Codex where both cover them. |

| 2026-10-22 | Review new animation frames against real reference frames | codex (`-i` images) | `gpt-6-luna` (medium effort) | 45 s | 2.6 KB | Opened all 5 images, no video (it cannot). Caught the main flaw: the stretch still read square. Two errors: it said the throwing arm sat on the wrong side, and that the hands rose too early (the Ryan reference shows them rising first). |
| 2026-10-22 | Same review, plus the two source videos | agy | `gemini-3.8-flash-medium` | 1 min 7 s | 3.4 KB | Says it opened the images and both videos. Also caught the square stretch, plus the faint pivot-foot turn and the stiff arm break at 0.33–0.36. Its observations matched the frames more closely than Codex's. |

The research runs used `research/pitching_agent_reports/prompt.md`. The review runs got real frames and video. The research runs had only web search.
