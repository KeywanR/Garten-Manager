# KI dialogue: image history, plant assignment, and confirmable proposals

**Status:** COMPLETE - all five parts shipped. Verified present in code: unassignedPhotos in the dossier, assignDrivePhotoToPlant, kiProposals, proposePlan, needsReview, editable plant identity, and skills/garten/SKILL.md.
**Date:** 2026-08-02
**Type:** new-feature
**Scope:** Turn the daily diagnosis from a one-way feed into a dialogue — the routine compares against earlier photos, assigns or creates plants for imported photos, and proposes treatment changes that only take effect once confirmed in the app. Plus a `/garten` skill to run the assessment on demand.

## Background

Diagnoses arrive daily via the Drive inbox (`gartenmanager-ki-diagnose.json`) and merge through `applyKiDiagnosis`. Today that flow is one-way: the routine writes, the app applies, and nothing the user does in the app feeds back except implicitly through the next dossier export. Four gaps follow from that.

## 1. Compare against the image history

The routine currently looks only at the newest photo and judges change against previous *written* observations. It should also open the most recent previously-diagnosed photo of the same plant and compare directly, so "the yellowing has spread since 19 July" becomes possible rather than "you mentioned yellowing before".

Cost is bounded: one extra image only for plants that have prior photos, and only for the photos being diagnosed that day (max 12).

## 2. Assign and create plants from imported photos

Photos imported via "Fotos importieren" land with `plantId: ''`. They are invisible to the routine because `buildPlantDossier` groups photos by plant, so an unassigned photo appears under none.

Changes:

- **Dossier** gains a top-level `unassignedPhotos[]` listing `{driveFile, date}` for photos with no plant, so the routine can see them.
- **Inbox** gains `assignPhoto: {file, plantId}` — adopt an existing local photo into a plant. The app resolves the Drive filename back to its local photo key via the `gm_drive_photo_index` map, sets `plantId`, and adds a Fotoverlauf entry. This is the missing "re-home an orphan" capability; `addPlant`/`photo` could only ever create, never adopt.
- **`addPlant`** may carry `needsReview: true`. The plant is created as usual, and a proposal of type `newPlant` is raised so the user sees it, can correct the name, category and note, and confirms.

## 3. Proposals — nothing changes the schedule without confirmation

New state: `state.kiProposals[]`, each `{id, date, plantId, type, title, detail, payload, status, decidedAt}` where `type` is `tasks` or `newPlant` and `status` is `pending` / `confirmed` / `rejected`.

- **Inbox** gains `proposeTasks: [...]`, same item shape as `addTasks` plus a `reason`. Unlike `addTasks`, it does **not** touch the care schedule; it raises a pending proposal.
- The **KI-Diagnosen view** grows a "Zur Bestätigung" section above the findings, with Bestätigen and Ablehnen per proposal. Confirming a `tasks` proposal applies it through the existing `addTasks` path, so the merge logic is unchanged and already tested. Confirming a `newPlant` proposal just clears the review flag.
- Proposals are exported in the dossier with their status, so the routine knows what was accepted, what was declined, and does not re-propose something already rejected.

`addTasks` stays supported for the Drive inbox generally, but the daily routine must use `proposeTasks` — the user asked that treatment changes never apply silently.

## 4. Editing a plant feeds back into the advice

The care profile is already user-editable and append-only. Two additions:

- **Editable identity for user/KI-created plants**: name, category and note, so a plant the routine created under a guessed name can be corrected.
- The dossier exports `profileUpdatedAt` per plant. The routine is instructed to treat user-edited profile text as authoritative and adapt to it rather than repeating superseded advice — that is what makes it a dialogue rather than a feed.

## 5. `/garten` skill

An on-demand version of the same assessment, so the user does not have to wait for the morning run — usable from Claude in a browser or on the phone. Same instructions as the routine, same folder IDs, same once-only ledger, so an ad-hoc run and a scheduled run cannot double-diagnose a photo.

---

## Testing Strategy

**Approach:** spec-driven-tdd

- Given an inbox entry with `assignPhoto` naming a Drive file that exists locally as an unassigned photo, when applied, then that photo gets the given `plantId`, appears in the plant's Fotoverlauf, and disappears from "Fotos ohne Pflanze".
- Given `assignPhoto` naming a file that cannot be resolved locally, when applied, then nothing changes and no error is thrown.
- Given `proposeTasks`, when applied, then a pending proposal exists and the care schedule is **unchanged**.
- Given a pending `tasks` proposal, when confirmed, then the tasks appear in the schedule and the proposal reads `confirmed`.
- Given a pending proposal, when rejected, then the schedule stays unchanged and the proposal reads `rejected`.
- Given a proposal already confirmed or rejected, when the same proposal id arrives again, then it is not duplicated.
- Given `addPlant` with `needsReview`, when applied, then the plant exists and a `newPlant` proposal is pending.
- Given a KI-created plant, when its name, category or note is edited, then the change persists and appears in the dossier.
- Given two devices, when proposals are merged, then a decision made on either device wins over `pending` and confirmed/rejected never reverts.
- Given the dossier is rebuilt, then it contains `unassignedPhotos`, `kiProposals` with statuses, and `profileUpdatedAt` per plant.
