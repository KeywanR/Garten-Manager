# Run size, delegation, and the runs that reported success without working

**Date:** 2026-08-08
**Status:** Active - stopgap landed and verified 2026-08-10, structural fix open
**Type:** bug-fix / robustness
**Scope:** Stop the daily routine from failing or reporting completion without producing a Bericht, and bring the amount it has to read back under control before the same thing happens again.

## What happened

On 8 August the scheduled 06:20 run failed. Every run from 3 August to 7 August had been green. Three manual runs the same morning also failed, and one of them - the 08:18 run - showed the mechanism plainly:

- the run announced "eine grosse Datenakte (286 KB) und mehrere Diagnose-Historien"
- it delegated the real work (compare photos, determine candidates, write the diagnose file) to a subagent
- it called `ScheduleWakeup` and said it would report back when the agent finished
- the Runs list marked the run **Completed** while the pane still showed **1 running task** and no Bericht had been written

A routine session is a single autonomous run. It ends when the main loop stops. Work handed to a background agent and parked on a wakeup never lands: either the session exits before the agent reports, or it is killed waiting. The green status only means the VM exited cleanly - it says nothing about whether the task succeeded.

## Root cause

Size, not network. The inputs to a run grow every single day and nothing ever prunes them:

- `gartenmanager-ki-akte.json` is at 286 KB and carries the full `timeline` for every plant.
- The run reads **every** `gartenmanager-ki-diagnose.json` in the data folder - nine of them by 8 August, one more per run forever - purely to collect `sourcePhoto` values. The judgement prose in those files is never needed again but is read in full.
- The weather step (spec `2026-08-07-weather-aware-diagnosis.md`, live since 7 August 11:47 UTC) added a `WebFetch` plus arithmetic on top.

Past some threshold the model stops working inline and reaches for delegation. That reflex is correct in an interactive session and fatal in a routine.

## Not the cause: the blocked weather fetch

`api.open-meteo.com` is blocked by the cloud environment's network policy. The Default environment runs at **Trusted** network access, which permits only Anthropic's default allowlist; everything else returns `403` with `x-deny-reason: host_not_allowed`. The Google Drive connector is unaffected because MCP connector traffic routes through Anthropic's servers, not the session's network.

This is real but cosmetic. The 08:11 run proved the fallback works: it lost the weather, logged one line, and completed the rest of its work normally. It is not what killed the runs.

## What landed (8 August)

Stopgap only - it converts a silent non-result into an honest partial run. It does not create headroom.

1. **Routine prompt** (`trig_01WGicrr1NgzQ11gYRMcxT6w`, via `RemoteTrigger action: update`):
   - New `EIN LAUF, EINE SESSION` block after the Kostenregel: no subagents, no task delegation, no background work, no `ScheduleWakeup`. States that the session ends with the answer and that delegated work never lands.
   - A degradation ladder for when it does not fit: Schritt 4b first (an unanswered user question is the failure that gets noticed; an unevaluated photo waits until tomorrow), then photos newest-first, four instead of twelve if necessary, and say in the Bericht what was left out.
   - Schritt 2 now states that only `sourcePhoto` and `id` are needed from the diagnose files.
   - Schritt 1b now says explicitly that a 403 from the network policy is not a reason to abort or defer.
   - New first Stopp-Signal covering delegation and deferral.
   - Schritt 8 now requires a line naming anything dropped for size.
2. **`skills/garten/SKILL.md`**: same rules, as the standing "three copies, one change" discipline requires. New `## Ein Lauf, eine Session` section plus the matching Stopp-Signal.

## What remains - the structural fix

The stopgap buys time. The inputs still grow daily, so the run will keep getting closer to the edge and will start silently dropping photos.

**Lever 1: collapse the diagnose history.** The run reads N files to build one set of strings, and N increases by one per run. Consolidate the historical diagnose files into a single index of `sourcePhoto` values. There is precedent: the seed file that marked the whole July back catalogue as evaluated. Open question - who writes the consolidated index, and when? Candidates: a periodic maintenance run, or the app during sync.

**Lever 2: trim the akte.** 286 KB is dominated by per-plant `timeline` history the run does not need in full. `buildDossierPayload` in `app.js` is where the payload is assembled. Open question - how much timeline does Schritt 4b actually need? It reads entries newer than `lastKiReview`, which is a small tail, not the whole history.

Both levers touch the app, so both need the SKILL.md and routine-prompt copies updated in the same sitting.

## Risks

| Risk | Cover |
| --- | --- |
| The prompt rule is ignored under pressure and the run delegates anyway | It is stated three times: as a top-level block, as a degradation ladder, and as the first Stopp-Signal. Behavioural only - no test can reach the routine prompt |
| Trimming the akte removes something Schritt 4b needs | Keep the tail newer than `lastKiReview` plus a fixed number of prior entries; verify against a plant with a long history before shipping |
| Consolidating diagnose files loses a `sourcePhoto` and a photo gets diagnosed twice | The consolidated index must be built by reading every file, and the originals kept until a run has verified the count matches |
| The run silently drops photos to fit | Schritt 8 now requires naming what was dropped. Watch that line over several mornings |

## Verification

Behavioural, over the following mornings - the change lives in a prompt.

- [x] A scheduled run completes with a Bericht, no "1 running task" left behind. Confirmed 2026-08-10: full Bericht, new plants added, user questions answered.
- [x] No run mentions a subagent, `ScheduleWakeup`, or reporting back later - clean on the 2026-08-10 run.
- [ ] If a run drops work for size, it says so in the Bericht rather than quietly shrinking.
- [x] Weather: confirmed working 2026-08-11. The Custom allowed-domains edit took; runs now produce a Wetterzeile with real figures.

## Process note

Three manual runs were fired on 8 August while diagnosing this, two of which were stopped mid-flight and are recorded as Failed. That is noise in the run history, not evidence. When reading the list later: only the 06:20 SCHEDULED entries are unattended runs.
