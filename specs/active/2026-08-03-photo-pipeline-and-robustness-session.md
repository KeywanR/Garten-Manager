# Why one diagnosis didn't run, and the nine builds that followed

**Date:** 2026-08-03
**Status:** Active
**Project:** Garten-Manager

## Summary

Started with a single honest observation: photos taken while watering appeared in the app but got no AI assessment. That was true, and the reason was three layers down — the images had never reached Drive at all, because the photo upload abandoned its whole queue on the first error and ran last, after a 60 MB blob. Fixing it exposed a permission grant destroyed by the app's own "Trennen" button.

Two commissioned robustness audits then found that "Zurücksetzen" would have deleted the garden on both devices, that deleted photos were being resurrected, and that the diagnosis inbox would have stopped working within about ten days. All three were live and none would have surfaced from normal use.

The fix for the resurrection bug then **deleted ~27 of the user's plant Titelbilder** — a regression shipped and caught the same day. Builds v40 → v48.

## Decisions

- **The daily run reacts to corrections, not only to photos.** Plants carry `userEdited` / `lastKiReview` / `needsReassessment`; correcting a name, category, profile or health status makes the next run re-read the whole care schedule against what the plant now is. Only user actions stamp it — were AI edits to count, the run would read its own work as fresh input and re-review forever.
- **Equal timestamps mean "needs review".** When an edit and a review share a timestamp their order is genuinely unknown, and skipping a real correction is worse than one redundant look.
- **A "nothing to change" verdict must still be written.** Otherwise a corrected plant stays flagged and is re-examined every morning at cost.
- **Plants can be deleted, and rejecting an AI identification removes the plant.** Previously the only irreversible outcome in the pipeline: reject marked the proposal and left the plant, with no delete anywhere in the app. Built-ins refuse deletion — they live in code and would silently reappear.
- **"Trennen" no longer revokes the OAuth grant.** Under `drive.file` write access is per file; revoking dropped it for every file the app had ever created, so after reconnecting the app could still *see* its own photos and no longer overwrite them. "Stop syncing on this device" should not orphan an entire archive.
- **The Drive folder stays pinned by id, and now so is everything downstream** — `driveList` paginates, and a 403 on an adopted file falls back to creating our own.
- **Harvests are recorded with an amount and totalled per season.** Units are grouped exactly as entered, never converted — guessing that g and kg combine is how 450 g becomes 450 kg. Unparseable amounts ("eine Handvoll") are still recorded; a log that refuses them is worse than one that can't add them up.
- **Every photo gets a metadata entry at startup** (`adoptUntrackedPhotos`) — the user's own proposal, and the right fix: it removes the two-sources-of-truth problem rather than teaching each consumer to be careful about it.
- **Self-merging PRs stopped.** The auto-mode classifier blocked a fourth self-merge in one morning; from #33 onward PRs are opened and left for the user. The block was correct.

## Defects found and fixed

| Severity | Defect | Fix |
| --- | --- | --- |
| CRITICAL | `resetApp` was the only wholesale-replacement path without `resetTsBaseline()`, so a reset wrote a deletion tombstone dated *now* for every record. The reset itself didn't push; the first photo afterwards did — deleting the cloud copy and then the other device's | One line, plus a regression test |
| CRITICAL | Deleted photos came back: metadata was tombstoned but the blob was never removed, so the device still holding it re-uploaded the image and it was restored to the device that deleted it | `purgeOrphanPhotos`, tombstone-gated |
| CRITICAL | **Regression, self-inflicted.** The first version of that purge deleted any image metadata didn't mention — which was exactly the legacy covers, since the grid renders them from the photo store without consulting metadata. ~27 Titelbilder deleted | Purge requires a tombstone; `adoptUntrackedPhotos` closes the asymmetry |
| HIGH | The diagnosis inbox would have silently stopped: `driveList` fetched one unordered page of 10, and every run writes another file of the same name | Paginated |
| HIGH | Every push scheduled another push — `pushLocal` → `save()` → `onLocalChange` → repeat, re-uploading the whole photo library until the token expired | Single-flight guard + self-write suppression |
| HIGH | Photo upload aborted the entire queue on one failure, ran after the 60 MB blob, and reported only to the console | Skip-and-continue, new photos first, uploads before the blob, pending count on screen |
| HIGH | "Trennen" revoked the grant; the readonly scope then made old files visible but unwritable, so uploads 403'd forever | Stop revoking; fall back to creating our own file |
| MEDIUM | Two concurrent first pushes both created a data file | Single-flight |
| MEDIUM | `profile.updated` (a date) was line-merged into multi-line garbage — the field the run treats as "the user wrote this, don't argue" | Later date wins |
| MEDIUM | Health-status validation lived only in the AI path; a backup or older device could still inject an unknown value | Enforced in `normalizeState` |
| MEDIUM | Confirming a plan that re-added a retired task did nothing while reporting success | Re-adding un-retires |
| MEDIUM | A plant created from a photo never received the photo — the catalogue was rebuilt after the assignment ran | Rebuild on creation |

## Open questions

- **Restoring a backup can be undone** by newer tombstones from the other device. Inherent to the merge design; needs thought, not a patch.
- **Profile text deletions are reverted** by the line-union merge. Only fixable with per-line tombstones or a length heuristic.
- **A diagnosis entry is marked applied even if it threw**, or if its photo wasn't in Drive yet. Silently burned, and `kiApplied` is shared so neither device retries.
- **Same-day cover replacement** creates two Drive files with the same name; name lookups take the first arbitrarily.
- **The plant-file modal** doesn't re-render after task actions (so you complete twice) and discards edits in other sections when one section is saved.
- **Photos can't be re-filed or un-hidden** — assignment and "Ausblenden" are both one-way.
- **Snapshots each store a full copy of the photo library** — 30 of them, an iOS quota risk that would take the photos *and* the snapshots meant to protect them.
- **"Saison beenden" for annuals** — proposed, not built. Deleting a tomato plant in October also deletes the harvest record just accumulated; an ended-season state keeps the history and re-bases next spring.

## Follow-ups

- [ ] Sync on v48 and confirm the 27 Titelbilder come back from the restore file
- [ ] Re-save Pittosporum's health status — restoring its cover cleared its re-assessment flag
- [ ] Read tomorrow's 06:20 report: first run with correction re-checks, 10 photos + 3 flagged plants
- [ ] Split photos out of the data payload — still the structural weakness behind slow syncs and OOM risk
- [ ] Decide on "Saison beenden"
- [ ] Raise or remove the 12-photos-per-run cap — agreed in principle, deferred until the approach has proven stable. The cap is a blast radius as much as a cost control: if the "already assessed" ledger ever breaks (as the inbox pagination bug would have caused), an uncapped run re-diagnoses the whole archive in one pass. Lift once a week of clean runs has passed AND the photo payload is split out, since a fifty-entry run also writes fifty findings back through the same blob.
- [ ] Work through the open-questions list above; the modal edit loss and the burned-diagnosis path are the most user-visible

## Artifacts

- **v40** photo upload resilience · **v41** error surfacing · **v42** 403 fallback, no revoke · **v43** button rename · **v44** correction re-check + new-plant photo · **v45** plant deletion · **v46** audit fixes · **v47** harvest log · **v48** purge fix + photo adoption
- PRs #28–#36 (nine), all merged
- `skills/garten/SKILL.md` — correction flow, `reviewOf`, explicit id/plantId/date contracts, the rename trap; reviewed twice
- Scheduled routine `trig_01WGicrr1NgzQ11gYRMcxT6w` — rewritten twice to stay identical to the skill
- Drive: `gartenmanager-ki-diagnose.json` (id `18Li1_x1soaeHDyWxSYR6PR7E2R8my6ET`) — the 27-cover restore file

## Context

**The reporting that worked.** Every root cause this session came from a plain observation, not from a hypothesis: "the photo is in the app but there's no assessment", "it says gesichert but the data differs", "I lost lots of photos". Each time the useful move was to check Drive directly rather than reason about the code. Twice the code looked correct and the data proved it wasn't.

**Why the audits earned their cost.** Two adversarial readers, told what was already fixed and asked what a user would plausibly do, independently found the same worst bug — a reset path that would have destroyed the garden on both devices, live for weeks, invisible until the day that button was pressed. No test written by the author of the code finds that class, because the author tests the thing they were thinking about.

**The regression is the lesson worth keeping.** The purge fix was written *in response to* an audit finding, tested, and shipped the same day — and it deleted the user's photos. The audit had explicitly flagged that the grid reads the photo store without consulting metadata; that finding was quoted in the commit message while the fix was built on the opposite assumption. The tests passed because they used photos created by the *new* code, which was the one case that could not fail. **A change that touches stored data must be tested against data the old build wrote.** The user's instinct — give every photo metadata so the two views can't disagree — was the better fix, because it removes the ambiguity instead of asking each consumer to handle it correctly.
