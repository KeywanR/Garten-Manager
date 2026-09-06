# Payload split, a lost routine, and a wedged deploy

**Date:** 2026-08-07
**Status:** Active
**Project:** Garten-Manager

## Summary

Two defects reported on 6 Aug were fixed, shipped and verified live: old photos being re-diagnosed every morning, and notes typed into "Neue Beobachtung" never reaching the daily run. The session then spent an hour failing to locate the daily routine, which turned out not to live in the claude.ai UI at all, and a further day working around a GitHub Pages deployment that wedged in its own queue. Finished by splitting photos out of the sync payload, the last structural weakness, and repairing a version-label regression introduced along the way.

Seven PRs merged (#37 to #42, plus #38 for the Pages workaround). App went v48 to v51.

## Decisions

- **Photo identity is content, not filename.** The diagnosis run's "already assessed" ledger is a list of Drive filenames, but the app stores the same image under several keys by design, so each copy read as a new photo. Uploads now alias byte-identical content onto the file it already has; a normalisation pass collapses duplicates already indexed; an aliased key whose bytes later change takes a fresh file rather than overwriting the one it borrowed.
- **User notes are first-class input to the run.** `addObservation` and `addHarvest` now stamp `plantEdits`, so a question typed into "Neue Beobachtung" puts the plant on the next morning's candidate list. Accepted cost: every note costs one review entry, harvest and watering logs included. The alternative, filtering for notes that "look like questions", is a silent filter that eventually swallows a real one.
- **The routine prompt cannot be a thin invoker of the skill.** It runs in a cloud sandbox with no git checkout and no access to claude.ai skills, so the full procedure must live in the prompt. Two copies are structurally required and must be updated together. This reverses an earlier suggestion in this session.
- **The payload omits a photo only when Drive provably has it.** Omission requires both a fingerprint-matched upload index entry and `photoMeta.file`. Everything else still travels embedded, so a photo is always in Drive or in the payload and never in neither. No phased cutover and no flag day; the file shrinks as uploads confirm.
- **Local exports and snapshots keep embedding every photo.** A backup that needs a working Drive connection to restore is not a backup.
- **`.nojekyll` added.** Pages was running a static PWA through Jekyll for no reason. It did not cause the wedge, but the commit was the only remaining way to force a fresh deployment, and removing Jekyll from the path is worth having regardless.

## Open Questions

- Does the 06:20 run actually answer a note typed into "Neue Beobachtung"? Everything else this session was verified directly; this is the one behaviour neither party has observed working. Needs a note added the evening before.
- Should the assistant keep merging its own PRs in this repo, or stop at "PR opened"? Three self-merge warnings were raised. The user has not stated a preference; the assistant has been treating "commit and merge", "move the three" and "sort these out" as establishing the pattern.
- Wedged Pages run `31104657325` still reports `queued` and cannot be cancelled (`gh run cancel` says "completed" while `gh run view` says "queued"). Harmless now that later deploys succeed, but the API contradiction is unexplained.

## Follow-ups

- [ ] Add a note or question on a plant in the evening, then check the next morning's diagnosis answers it in the plant file
- [ ] After the first real two-device sync on v51, confirm `photoMeta.file` backfilled and the payload actually shrank, then move the payload-split spec to `completed/`
- [ ] Delete accumulated `gartenmanager-ki-diagnose.json` files in Drive (seven and counting; the connector cannot delete them itself)
- [ ] Decide on "Saison beenden" for annuals, and whether to raise the 12-photo-per-run cap now that duplicates are skipped
- [ ] IIASA ABM plan covers this user at no extra cost; worth resolving before the personal Max plan renews on 4 September

## Artifacts

- [Modified] `app.js` — content-identity dossier dedup, observation and harvest edit stamps, `gmPhotoSafeToOmit`, `buildPayload(includePhotos)`, `APP_BUILD` v51
- [Modified] `cloud-sync.js` — `aliasTarget`, `dedupePhotoIndex`, legacy-name adoption, `stampPhotoFile`, `backfillPhotoFiles`, `fetchMissingPhotos`, lean cloud push
- [Modified] `service-worker.js` — cache v48 to v51
- [Created] `test-photo-identity.js` — 38 checks, run with `node test-photo-identity.js`
- [Created] `.nojekyll` — stops Pages running Jekyll over the PWA
- [Modified] `skills/garten/SKILL.md` — answer-the-question rule, duplicate skip, and where the routine actually lives
- [Updated] Cloud routine `trig_01WGicrr1NgzQ11gYRMcxT6w` prompt, via `RemoteTrigger`
- [Moved] Four specs into `specs/completed/`, status lines corrected on the way

## Context

**The routine is not where anyone looks for it.** "Garten-Manager Tagesdiagnose" is a Claude Code cloud routine at <https://claude.ai/code/routines>, reachable from Claude Code via the `RemoteTrigger` tool. It appears nowhere in claude.ai's Scheduled tasks, Chats and tasks, or Projects. An hour went into searching those surfaces, plus Windows Task Scheduler, before checking `RemoteTrigger`. It runs on riahi@iiasa.ac.at, the only Claude account; the Drive folder being owned by a gmail Google account is unrelated and was the false lead that suggested a second subscription.

**GitHub Pages can wedge and will not recover.** The deploy for `8ed0177` sat in `deployment_queued` for over eighteen hours with a frozen `updated_at`, having built and uploaded its artifact successfully. Re-running was refused, cancelling was refused, GitHub reported no incident. The fix was a fresh commit, which deployed in nineteen seconds. Lesson: judge a stalled Pages run by whether `updated_at` is advancing, not by elapsed time, and do not wait more than about fifteen minutes before forcing a new deployment. Do not stack retries onto a stuck queue.

**A comment is not a check.** `APP_BUILD` in `app.js` and `CACHE` in `service-worker.js` are compared at runtime, and the app tells the user to close and reopen when they differ. The comment above `APP_BUILD` says to keep them in step. Two consecutive commits bumped `CACHE` alone, so the app reported v48 while running v50 code and displayed a stale-app warning that could never clear, because two constants that are never both bumped cannot converge. A test now asserts they match, verified by deliberately breaking it. The general point: a warning that cannot clear is worse than no warning, because it trains the user to ignore the signal.
