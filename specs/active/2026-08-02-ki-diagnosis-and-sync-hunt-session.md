# KI diagnosis pipeline, and a long hunt for why two devices never agreed

**Date:** 2026-08-02
**Status:** Active
**Project:** Garten-Manager

## Summary

Built an AI diagnosis loop for the garden app — photograph a plant, get an assessment that knows the plant's history, with care-plan changes proposed rather than imposed. Built it first as an on-device Claude API client, then removed that when it turned out API usage is billed separately from a Claude subscription; the shipped design has a scheduled claude.ai routine writing diagnoses into the Drive inbox instead, which the existing merge path already understood.

The larger part of the session was an extended debugging hunt: an iPad and a phone that both reported healthy sync while holding different data. Nine genuine defects were found and fixed. The last one was the actual cause — the app located its Drive folder **by name**, and two folders share the name "Garten-Manager", so the phone had been syncing faithfully to the folder holding the app's source code. The two devices were never sharing a file.

## Decisions

- Built and then **removed** the on-device Claude API client (PR #11 → PR #13). API usage is billed separately from a Claude subscription and there is no way to reach `api.anthropic.com` on subscription credentials, so "instant in-app diagnosis" and "no additional payment" are mutually exclusive. The user chose no additional payment.
- Diagnoses arrive via the Drive inbox, written by a **scheduled claude.ai routine** (`trig_01WGicrr1NgzQ11gYRMcxT6w`, daily 06:20 Vienna). Runs under the existing subscription, so no extra cost. The Google Drive connector was verified to work inside a scheduled cloud run, including write capability.
- Each photo is diagnosed **once**: entries carry `sourcePhoto`, and the routine skips anything already listed. Capped at 12 photos per run.
- Seeded all 47 pre-existing photos as already-processed, so the routine starts from new photos only rather than re-diagnosing the July back catalogue.
- **Care-plan changes are proposals, never silent edits.** The routine may only use `proposePlan` (add/change/remove together, as one coherent regime); `addTasks` is forbidden to it. The user confirms or rejects in the app.
- Plants identified from a photo are created with `needsReview`, flagged in the app, and editable — a photo identification is a guess, not a fact.
- **Did not rename the two Drive folders**, which the user proposed. Renaming the data folder would break any device without a cached folder id. Pinning the folder by id was chosen as the durable equivalent — but see the failure note below.

## Defects found and fixed

| # | Defect | Fix |
| --- | --- | --- |
| 1 | Documented health status `🔴 Krank` ≠ implemented `🔴 Handlungsbedarf`; unknown values stored verbatim and could not round-trip the UI | Single `HEALTH_STATUSES` constant, enum in the request schema, validation on apply |
| 2 | Sync assumed one writing device; every push overwrote the whole file | Per-record merge guarded by Drive `modifiedTime` |
| 3 | Cloud button read "trennen" above text saying "connect", and tapping it disconnected | Three states; the primary button can only ever connect |
| 4 | Service worker cache-first for everything — devices stranded on old builds | Network-first for HTML/JS; `updateViaCache:'none'`; reload on `controllerchange` |
| 5 | Timestamp migration stamped with `now`, so the device that upgraded **last** won every merge | Stamps derived from each record's own dates |
| 6 | `cleanupV12` ran against a stale catalogue on every pull, deleting custom plants' task history | `rebuildCatalog()` first, and no longer forced |
| 7 | Replacing state wholesale was recorded as mass deletion, fabricating tombstones that propagated | `resetTsBaseline()` after every replacement |
| 8 | Random observation ids + per-device applied-set meant each device made its own copy of every finding, orphaning read markers | Derived ids; applied-set moved into synced state; repair on merge |
| 9 | **Root cause.** Drive folder located by *name*; two folders share it; the phone synced to the source-code folder for hours while reporting success | Folder pinned by id, with recovery for devices holding the wrong one |

## Open questions

- The data file is **45 MB** because photos are base64-embedded in state, while `photos/` already stores them separately. This makes every sync slow, widens every conflict window, and is the last structural weakness. Splitting it changes the backup format, so it needs care.
- The scheduled routine has **never run against real data**. First genuine test is whenever a new photo appears.
- Each run with new photos leaves another `gartenmanager-ki-diagnose.json` in Drive (the connector cannot delete). Harmless but accumulates.

## Follow-ups

- [ ] Read the first real routine report as a test result; do not confirm proposed plan changes unsighted
- [ ] Split photos out of the 45 MB data payload — the remaining structural fix
- [ ] Add a banner so a signed-out device says so, instead of showing stale data while looking fine
- [ ] Use `/garten` on the iPad at least once (installed, never run)
- [ ] Periodically delete accumulated diagnosis inbox files in Drive

## Artifacts

- [Created] `ki-diagnose.js` — KI-Diagnosen view, proposals, photo assignment, read tracking
- [Created] `skills/garten/SKILL.md` — on-demand assessment skill for claude.ai; reviewed by `component-reviewer`
- [Modified] `app.js` — health-status vocabulary, proposals, `proposePlan`, suppressed tasks, change timestamps, tombstones, build display, view persistence
- [Modified] `cloud-sync.js` — per-record timestamp merge, folder pinned by id, ordering fixes
- [Modified] `service-worker.js`, `index.html`, `KI-DIAGNOSE.md`
- [Created] specs: `2026-08-02-ki-diagnose-on-device-design.md`, `-ki-dialogue-and-proposals.md`, `-record-timestamps-for-sync.md`
- PRs #11–#27 (17 merged). Ends at `0517814`, build **v39**.
- claude.ai routine `trig_01WGicrr1NgzQ11gYRMcxT6w`; probe routine `trig_014WyA9Gb8Y7Xa1bagchLMiw` (paused, deletable)
- Drive data folder id `1gf3X6Ia1iVLBYoOfm94S37DioQ67Mby8`; photos `1GcLAPmjVo4nmT1Yft1aKUMPmSGLMA9QA`

## Context

**The process lesson is sharper than any single bug.** The user proposed renaming one of the two identically-named Drive folders early on. That was argued down — correctly on the narrow point, since renaming the data folder breaks devices without a cached id — and "address it by id instead" was then applied to the scheduled routine but **not to the app**, which had exactly the flaw just described. The right diagnosis was in hand roughly three hours before it was applied to the component that mattered. Everything shipped in between was real, necessary work aimed at a symptom whose cause was already known and set aside.

Second lesson: eight of the nine defects were only reachable because each looked like "sync is broken". The decisive evidence came from the user's own observations — "marked read on v34, unread again on v36" eliminated whole classes of cause at once, and "it loads local data when not connected" pointed at the startup path. Symptom-driven fixing kept producing correct changes that could not resolve the complaint. Asking what evidence would *discriminate* would have been faster than reasoning about mechanisms.

Practical state: both devices on v39 and agreeing; Drive holds 45 plants, 26 findings, 26 read markers; stray duplicate data removed from the source folder (~90 MB in Drive, ~122 MB locally). The user's local repo folder is Drive-synced, which is why app-written data files kept appearing in the working tree.
