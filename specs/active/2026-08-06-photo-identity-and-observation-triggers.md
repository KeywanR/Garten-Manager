# Photo identity, and observations that reach the morning run

Date: 2026-08-06
Status: active

Two defects found on 6 Aug, both in how the daily run decides what to look at.

---

## 1. Old photos re-diagnosed every morning

### Symptom

The 06:20 run on 6 Aug wrote 12 photo entries. Nine of them say some version of
"Byte-identisches Duplikat des bereits ausgewerteten Titelbilds - dieselbe
Aufnahme, nur unter anderem Dateinamen im Zeitverlauf abgelegt." The run was
re-assessing photos it had already assessed on 18-19 July, and correctly noticed
it was doing so - it simply had no way to avoid it.

### Root cause

The "already assessed" ledger is `sourcePhoto`, and `sourcePhoto` is a **Drive
filename**. The app stores the same image bytes under more than one photo key,
and every key gets its own Drive file. Filename identity is not image identity,
so a second copy of an assessed photo reads as a brand new photo.

Three mechanisms produce the duplicates:

1. **Cover copy (recurring).** `ensureCoverFromPhoto` (app.js) does
   `putPhoto(plantId, data)` with the bytes of an already-filed photo. So
   `inbox_1785818847843_bdcvy_2026-08-04.jpg` (536276 bytes, assessed 4 Aug) is
   re-uploaded as `hortensie-terracotta-kuebel_2026-08-04.jpg` (536276 bytes,
   assessed again 6 Aug). Same for `importKiPhoto`, which writes both a cover and
   a timeline copy. Every KI-identified plant the user confirms yields one
   duplicate the following morning. This is the mechanism that will keep firing.

2. **Naming-scheme change (one-off, mostly spent).** Adding the `_<date>` suffix
   to `gmPhotoFileName` renamed every photo. On 3 Aug 06:56-06:58 roughly 35
   files were re-uploaded under new names - `timeline_karfiol_1784395830971.jpg`
   and `timeline_karfiol_1784395830971_2026-07-18.jpg` are the same 651552 bytes.
   At the run's cap of 12 photos, that backlog has been draining across the 3, 4,
   5 and 6 Aug runs.

3. **Legacy adoption stamps today.** `adoptUntrackedPhotos` writes
   `date: today()` for photos that never had metadata, so on a device with an
   empty upload index a legacy cover uploads under a fresh, today-dated name.
   Runs once per device - and would repeat mechanism 2 on any new device.

The `photoMeta` / `gm_drive_photo_index` machinery works exactly as designed.
It dedups by key. Nothing dedups by content.

### Fix

**Content aliasing in the upload path** (`cloud-sync.js`). Before creating a
Drive file for key K, look for an indexed key already holding byte-identical
content. On a hit, point K's index record at that existing file (`alias: true`)
and upload nothing. Consequences:

- The dossier reports the cover under the filename that was already assessed, so
  the ledger hits and the run skips it.
- No second Drive file, so the photos archive and the payload stop growing with
  duplicates.
- `photosPendingUpload` still reaches zero - the key counts as uploaded.

Guard: an alias must never be PATCHed. If the bytes under an aliased key later
change (a replaced cover), drop the alias and create a fresh file, or the write
would clobber the image the other key owns.

**Legacy-name adoption** (`cloud-sync.js`). When a key has no index record, try
adopting an existing Drive file under the *undated* legacy name as well as the
dated one, so a fresh device does not repeat the 3 Aug mass-rename.

**Dossier dedup** (`app.js`). One entry per distinct `driveFile` per plant, so a
plant never presents the same file twice.

### Not doing

Rewriting `ensureCoverFromPhoto` to hold a cover by reference rather than by
copy. It is the cleaner model, but the plant grid reads `photoCache[plantId]`
directly in several places and the migration is a bigger change than the bug
warrants. Aliasing fixes the observable damage without touching storage
semantics.

Cleaning up the duplicate files already in Drive. The photos folder is an
archive and is never pruned; the duplicates are inert once identity is fixed.

---

## 2. A note in "Neue Beobachtung" never reaches the run

### Symptom

A question entered about the tomatoes was not answered by the morning run.

### Root cause

The run's candidates are (a) new photos and (b) plants with
`needsReassessment: true`. `needsReassessment` derives from `plantEdits`, and
`plantEdits` is written only by `markPlantEdited` - which `saveProfile`,
`updateHealthFromFile` and the rename path call, and `addObservation` does not.

So an observation is stored, syncs, and appears in the dossier timeline, but
triggers nothing. Unless the plant happens to have a new photo that morning, the
run never looks at it. This is consistent with what the 6 Aug run did: it
answered the questions on `hortensie-terracotta-kuebel` and
`grosser-strauch-steinkuebel-garage` - both had *profile* edits, which do stamp -
and said nothing about the tomatoes.

Second, even for a flagged plant, section 4b of the skill is written purely about
re-deriving a care plan after a species correction. Nothing instructs the run to
read the user's text as a question and answer it.

### Fix

**App.** `addObservation` and `addHarvest` call `markPlantEdited`, carrying the
entry type and text (truncated) as `what`, so the run sees not just that
something changed but what was said.

**Skill.** Candidate class (b) broadens from "corrected plants" to "plants with
user input since the last review". Section 4b gains an explicit instruction: if
the user's text asks something or reports something new, answer it in
`observation`. The existing rule that every reviewed plant must get an entry
already prevents a plant from being re-checked forever.

### Accepted cost

Every user note now costs one review entry in the next run, including harvest
and watering logs where there is usually nothing to say. The alternative - only
flagging note types that "look like questions" - is a silent filter that would
eventually drop a real question. The run has a cheap no-change path; use it.

---

## Verification

- No `sourcePhoto` in a future run matching a photo assessed in an earlier one.
- Confirming a KI-identified plant produces no new Drive file for its cover.
- A note added under "Neue Beobachtung" produces a `reviewOf: "plantEdit"` entry
  the next morning that responds to what was written.

---

## 3. Where the daily routine actually lives

Finding this cost an hour, so it is written down properly.

The 06:20 run is **not** a claude.ai scheduled task. It does not appear under
"Scheduled", under "Chats and tasks" in any filter, in Projects, or in Windows
Task Scheduler - all of which were checked and all of which were empty. It is a
**Claude Code cloud routine**:

- Surface: <https://claude.ai/code/routines>
- Name: "Garten-Manager Tagesdiagnose", id `trig_01WGicrr1NgzQ11gYRMcxT6w`
- Cron `20 4 * * *` UTC = 06:20 Vienna
- Account: riahi@iiasa.ac.at - the only Claude account. Signing in with the
  gmail Google identity resolves to this same account, so there is no second
  subscription and no double billing. The Drive folder being owned by the gmail
  Google account is unrelated: a Drive connector can be authorized against any
  Google account.
- Reachable from Claude Code via the `RemoteTrigger` tool (`/schedule`); the
  claude.ai web UI does not list these routines anywhere.

### The routine cannot use the skill

It runs in a cloud sandbox with no git checkout and no access to claude.ai
skills, so its prompt must carry the entire procedure itself. The "make the
routine a thin invoker of the skill" idea - the obvious fix for the drift - does
not work here. Two full copies are structurally required, and they will drift
again unless both are updated together.

Both copies were brought current on 6 Aug: the claude.ai `garten` skill (which
had fallen back to the 2 Aug text - no section 4b, no `needsReassessment`, still
naming `proposeTasks`) and the routine prompt (which was at the 3 Aug text and
only needed today's four changes).

### If the two must stay in sync by hand

The cheapest guard is to treat the routine prompt as the source of truth for the
daily run and this SKILL.md as its mirror, and to update them in the same
sitting - never one alone. A future improvement worth considering: give the
routine a git source pointing at this repo so it can read the skill file
directly, which would collapse the two copies back into one.
