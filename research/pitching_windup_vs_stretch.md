# Pitching reference: windup vs. stretch

Research for fixing the duel-view pitcher animation (`src/ui/pitcherStyles.js`, `drawDuelPitcher` in `src/ui/fieldRenderer1987.js`). All directions are for a **right-handed pitcher (RHP)**.

The duel view looks out from behind the plate, so the pitcher faces the camera. Third base is on the viewer's left, first base on the right. A lefty mirrors everything.

## Sources

| Who | What | How it was used |
|---|---|---|
| Claude (this session) | Downloaded six YouTube clips and read them frame by frame | Pose sheets in `research/images/pitching/` |
| Codex (`gpt-6-luna`, web search) | Rules, coaching manuals, biomechanics papers | Report: rules, sequence, timing |
| agy (`gemini-3.8-flash-medium`) | Coaching and biomechanics write-up | Report: angles, timing. Its YouTube links are broken and its retro-game frame counts have no source, so its numbers are marked *unverified* below unless another source agrees. |

Full agent reports and the shared prompt: `research/pitching_agent_reports/`.

### Videos watched

| File | Clip | Camera | Shows |
|---|---|---|---|
| `ryan_windup_home_view.png` | [Nolan Ryan, all angles](https://www.youtube.com/watch?v=PmTESocpQbU), 0:07–0:14 | Behind home plate (the duel camera) | Classic 1970s full windup, hands overhead |
| `darvish_home_view.png` | [Yu Darvish, home plate view](https://www.youtube.com/watch?v=4FleBq-Ag2Q) | Behind home plate | Leg lift to follow-through |
| `wacha_stretch_3b_view.png`, `..._full.png` | [Michael Wacha, stretch](https://www.youtube.com/watch?v=oNLJe6XXTF4) | Third-base side | Set, pause, lift, stride |
| `wacha_windup_3b_view_full.png` | [Michael Wacha, windup](https://www.youtube.com/watch?v=IgSUGSCctMU) | Third-base side | Modern compact windup |

Also downloaded but not used: [Nolan Ryan 1970s slo-mo](https://www.youtube.com/watch?v=NjyClHEnLdk), [Zack Wheeler stretch](https://www.youtube.com/watch?v=b6UYkGizY-4), [Stretch vs. windup lesson](https://www.youtube.com/watch?v=NbamKWvjSL4).

### Written sources (from the Codex report)

- [MLB Official Baseball Rules, 5.07](https://img.mlbstatic.com/mlb-images/image/upload/mlb/wqn5ah4c3qtivwx3jatm.pdf): legal foot positions; the complete stop in the set position.
- [MLB glossary: windup position](https://www.mlb.com/glossary/rules/windup-position) and [set position](https://www.mlb.com/glossary/rules/set-position).
- [Baseball Canada: pitching mechanics](https://www.baseball.ca/?alias=pitching-mechanics&lang=english): stance, rocker step, hand heights, set at chest to belt.
- [Washington State pitching manual](https://cdn1.sportngin.com/attachments/document/802c-3330691/Pitching_Manual_-_Final.pdf): 1.30 s target from the stretch; slide step; hands break before the lift.
- [Clinician's guide to the pitching motion (PMC6542879)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6542879/) and [pitching biomechanics (PMC9950989)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9950989/): phase names, stride length.

## The windup (bases empty)

What the Ryan clip shows from behind the plate, at the slow-motion clip's own timestamps:

| Clip time | Phase | Feet and legs | Torso | Hands and arms | Head |
|---|---|---|---|---|---|
| 0.0–0.7 s | Take the sign, start | Pivot (right) foot on the rubber; feet about shoulder width; knees soft | Square to the plate. The camera sees his chest | Together at the chest, then rising | On the catcher |
| 0.7–1.5 s | Hands overhead, rocker step | Left foot steps a few inches back or to the side; weight rocks back | Still square | Glove and ball above the cap, elbows out wide | Level |
| 1.5–2.2 s | Pivot | Right foot turns 90° and slides into the slot in front of the rubber, parallel to it | Turns side-on; the chest now faces third (viewer's left) | Still overhead, starting down | Turned over the left shoulder toward the plate |
| 2.2–3.5 s | Leg lift, balance point | Left knee rises to chest height and tucks back across the body; foot hangs below the knee; standing leg slightly flexed | **Coils past side-on.** Ryan and Darvish both show the back of the jersey (the number) to the plate | Hands come down to the chest and stay together | Stays on the plate over the front shoulder |
| 3.5–4.3 s | Stride, hand break | Left foot drops and strides toward the camera; right leg drives off the rubber | Hips open first; shoulders stay closed | Hands break at the chest. The glove arm reaches toward the plate (viewer's right); the throwing hand swings down and back | Level, on target |
| 4.3–4.7 s | Arm cocking, release | Front foot lands, slightly closed; front knee flexed, then firms | Shoulders whip square to the camera | Elbow at shoulder height, then the arm comes over the top. The glove tucks to the chest | Over the front knee |
| 4.7–6.0 s | Follow-through | Back leg swings up behind (Ryan kicks it high) and comes forward | Torso folds forward over the front leg | Throwing arm finishes across the body by the left knee | Ends in a fielding stance, facing the plate |

### Two windup styles

- **Classic full windup** (Ryan, Marichal, Valenzuela, most of the 1980s): hands go overhead during the rocker step and come back to the chest during the lift.
- **Modern or compact windup** (Wacha, Maddux): hands stay at the chest or chin. The rocker step and pivot still happen.

## The stretch (runners on)

What the Wacha clip shows from the third-base side (his chest faces that camera), checked against the rules and coaching sources:

| Phase | Feet and legs | Torso | Hands and arms | Head |
|---|---|---|---|---|
| Take the sign | Right foot already parallel to the rubber, touching its front edge. Left foot in front toward the plate, a bit wider than shoulder width. Knees soft | Side-on: chest faces third base | **Hands apart**: glove rests at the thigh or knee, throwing hand hangs at the side or behind the hip | Turned over the left shoulder toward the catcher |
| Come set | Feet do not move | Side-on | Hands come together, often up near the chest, then settle at the **belt to chest** | May glance at the runner, then back to the plate |
| Full stop | Still | Still | Hands frozen at the set point. Rule 5.07 requires a complete, visible stop. It names no minimum time; about 0.5–1 s is typical | Still, or a look to the runner |
| Leg lift | Left knee rises to **belt height**, lower than in the windup, and stays mostly in front instead of tucking back. Slide step: the foot barely leaves the ground | Stays side-on; hips coil only a little | Hands stay together at the chest and may rise a few inches | On the plate |
| Stride to finish | Same as the windup | Same | Same | Same |

There is no rocker step, no pivot and no overhead hands. The pitcher starts where the windup is after its pivot.

## Timing

| Measure | Value | Status |
|---|---|---|
| Stretch, first move to the catcher's glove | 1.30 s or less (coaching target) | WSU manual |
| Stretch, slide step to the catcher's glove | about 1.0–1.15 s | agy; *unverified* |
| Pitch flight, 90 mph | about 0.42 s | Physics: 60.5 ft at about 132 ft/s, minus the release extension |
| Stretch, first move to release | **about 0.85–0.9 s** | 1.30 s minus the flight |
| Windup, first move to release | about 1.4–1.8 s; agy gives 2.0–2.8 s from the rocker | *unverified*; the clips are slow motion with no frame rate |
| Front foot contact to release | about 0.145 s | agy cites ASMI; *unverified* |
| Arm cocked to release | about 0.05 s | agy; *unverified* |

The firm points are that the windup takes clearly longer than the stretch, and that the stride-to-release segment takes the same time in both.

## Where the current animation differs

Checked against `buildPitcherPoses` and `drawDuelPitcher` before the 2026-10-22 fix. Items 1–5 are now fixed; see the timeline in `NOTES-pitcher.md`. Renders of the fixed animation are in `images/pitching/game_after_*.png`.

1. **The stretch has no "come set."** The idle pose is already set (hands together), and from 0 to 0.14 progress `STRETCH` blends to `STRETCH`, so nothing moves. In real play the pitcher takes the sign with hands apart, brings them together, then holds a still pause before the lift.
2. **The windup has no rocker step or pivot.** `SET` and `WIND` share the same feet (`standingLegs`). In the clips, the left foot steps back and the right foot turns into the slot before the leg lift.
3. **The coil is short.** `LIFT` uses `turn: 88` (115 for the Tiant-style pivot). Ryan and Darvish turn far enough that the plate sees the back of the jersey: about 100–120°.
4. **The stretch lift tucks like the windup.** It is a 55% blend toward the windup `LIFT`, so the knee still crosses the body. In the stretch the knee rises to about belt height and stays in front.
5. **Both deliveries use the same 800 ms.** `PITCH_WINDUP_MS` drives set-to-release for both. The real windup takes clearly longer than the stretch. Gameplay may need short times, but the stretch should be the quicker of the two.
6. **The windup starts square, then turns.** `WIND` has `turn: 20` with the hands overhead. The clip agrees: the pitcher stays square while the hands go up and turns only at the pivot. Keep this.

## Retro game notes

Neither the Codex nor the agy report found a frame count or pose list for the windup and stretch in *Earl Weaver Baseball* or other 1980s baseball games. The SABR review mentions only smooth animation and frame-by-frame replay. For a small sprite, the poses that tell the two deliveries apart are:

- **Windup:** square to the plate, then hands overhead, then side-on with a high knee.
- **Stretch:** side-on with hands at the belt, then a still pause, then a lower knee.
