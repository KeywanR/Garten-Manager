# KI-Diagnose on device — photo to diagnosis in seconds

**Status:** Active
**Date:** 2026-08-02
**Type:** new-feature
**Scope:** The app calls the Claude API directly from the phone when a photo is added, so a diagnosis lands in the plant file within seconds — no laptop, no scheduled job, no backend.

---

## Problem

Today a diagnosis requires a Claude session on the PC: Mozart reads `gartenmanager-ki-akte.json` and `photos/` from Drive, writes `gartenmanager-ki-diagnose.json`, and the app merges it on the next sync. That works, but the round trip depends on a human starting a session.

The requirement: take a photo on the phone, have it land in the app *with* a diagnosis, without going to the laptop and without waiting hours for a scheduled run.

Three approaches were ruled out before landing here:

- **Google Photos album.** Dead on arrival. Since 31 March 2025 the Photos Library API only exposes app-created media; the Picker API is interactive by design. A Photos album is not reachable by any third party, and folder-sync tools mirror filesystem folders, not cloud albums.
- **Autosync folder → Drive + scheduled scan.** Works, but capture needs a third-party app and the diagnosis still lags by up to the poll interval.
- **A button that signals a listener.** A flag file in Drive is cheap, but a signal needs a poller, so it cannot be instant. Telegram has the same property and additionally cannot hold a bot token safely in a PWA served from a public repo.

## Approach

The PWA calls `POST https://api.anthropic.com/v1/messages` itself. Claude's API supports CORS from browser JavaScript when the request carries `anthropic-dangerous-direct-browser-access: true`, which is the supported "bring your own API key" path.

Flow, end to end:

1. User photographs a plant with the app's existing camera button (or bulk-imports from the gallery — see below).
2. The app immediately POSTs the image plus that plant's dossier slice to the Claude API.
3. The response comes back as a validated diagnosis entry and is applied locally through the existing `applyKiDiagnosis` path.
4. The normal debounced Drive push carries it to the cloud like any other change.

No new sync infrastructure. Steps 3 and 4 already exist and are proven — the 19 July entries in Drive were produced by exactly that merge path.

### Key handling

The key is entered once under **Daten & KI** and stored in `localStorage` on that device only. It is never committed, so the public GitHub Pages source contains no secret. Recommended: mint a dedicated key with a spend limit in the Anthropic console rather than reusing a general-purpose one, so a compromised phone caps the blast radius.

### Model and cost

Default `claude-opus-5`. A diagnosis is roughly a 1–2k-token image plus a trimmed dossier slice in, under a thousand tokens out — order of a few cents per photo. If volume grows, `claude-sonnet-5` is the cheaper swap, but that is a deliberate downgrade decision, not a default.

### Structured output

The request uses `output_config.format` with a JSON schema mirroring the `gartenmanager-ki-diagnose` entry shape. This guarantees the response is directly consumable by `applyKiDiagnosis` with no parsing guesswork, and — via an `enum` on `status` — fixes the vocabulary drift documented below.

### Gallery import

For photos taken outside the app, `pickImage()` (app.js:600) already opens the iOS/Android library picker; it needs `multiple` plus a bulk path. Imported photos run the same diagnosis on import, so the behaviour is identical whether the photo came from the app's camera or the phone's.

### Surfacing what's new

A diagnosis currently lands in four places inside one plant's file: the health badge, a `KI-Diagnose` timeline entry, dated additions to the care profile, and possibly a new care task. That is the right destination, but it scatters — after a batch import of eight photos there is nothing telling the user which eight plants changed, so findings are only discovered by browsing.

Add a **KI-Diagnosen** view: a reverse-chronological list of diagnoses with an unread count, each entry linking to the plant it belongs to, and an explicit marker for the ones that need a decision (an uncertain plant identification, a proposed new care task). Reviewing an entry clears it.

Without this, the feature produces findings the user never reads, which is the main way a feature like this quietly fails.

### Both devices diagnose — and the catch-up path

The diagnosis is a feature of the app, not of a platform. The identical PWA runs on the Android phone and the iPad, and both make the same API call at capture time. There is no Android-specific component anywhere in this design.

The one asymmetry is the key: `localStorage` is per-device, so the key must be entered on each. If it is set up on one device only, photos captured on the other save and sync normally but arrive with no diagnosis — and nothing would retroactively produce one, because diagnosis runs at capture on the capturing device.

To close that gap, a photo carries a flag recording whether a diagnosis was attempted. Any device that has a key and encounters a synced photo lacking one runs the diagnosis then. This makes a missing or newly-added key self-healing rather than a silent permanent gap, and costs one boolean per photo.

### Offline behaviour

The app is offline-first and must stay that way. If the API call fails (no network, rate limit, bad key), the photo is still saved locally and the diagnosis is queued for retry. A failed diagnosis must never block or lose a photo.

### New plants

When Claude is confident the photo shows a plant not in the catalogue, the entry carries `addPlant` with default care tasks for its category. When it is not confident — a seedling, a bad angle, two plausible species — it must not guess: the entry records the uncertainty and the app surfaces it for confirmation rather than silently adding a plant.

---

## Testing Strategy

**Approach:** spec-driven-tdd

- Given a valid key and a photo of a known plant, when the photo is saved, then within seconds the plant's health status, a `KI-Diagnose` timeline entry, and any care advice appear in the plant file.
- Given no API key is configured, when a photo is saved, then the photo saves normally and the app prompts for a key once rather than erroring repeatedly.
- Given the device is offline, when a photo is saved, then the photo persists locally and the diagnosis is queued; when connectivity returns, the queued diagnosis runs and applies.
- Given the API returns a status string, when it is applied, then it is one of the four values the app's own dropdown contains — an out-of-vocabulary status is rejected, not stored.
- Given the same diagnosis entry id is applied twice, when the second application runs, then it is a no-op (existing entry-id dedup must keep working).
- Given a photo of an unknown plant with high confidence, when the diagnosis applies, then the plant is created with category-appropriate default tasks.
- Given a photo of an unknown plant with low confidence, when the diagnosis applies, then no plant is created and the question is surfaced to the user.
- Given a multi-select gallery import of N photos, when import completes, then N photos are saved and N diagnoses are attempted independently — one failure does not abort the rest.

---

## Known defect to fix in the same pass

`KI-DIAGNOSE.md:46` documents the fourth health status as `🔴 Krank`; `app.js:662` uses `🔴 Handlungsbedarf`. `applyKiDiagnosis` assigns `e.status` verbatim with no validation, so a diagnosis written against the documented spec stores a status the app's own dropdown does not contain.

Nothing crashes, which is why it has gone unnoticed. The damage is that the status cannot round-trip through the UI: the plant-file `<select>` has no matching `<option>`, so it renders the wrong selection, and saving the plant file then silently rewrites the stored status to whatever the dropdown happened to display.

Fix in four parts:

1. **One source of truth.** The four strings currently exist only as an inline array inside `openPlantFile` (app.js:662), so nothing else can reference them. Hoist to a module-level `HEALTH_STATUSES` constant; the dropdown renders from it and the validator checks against it.
2. **Constrain generation.** The API request's JSON schema declares `status` with an `enum` of those four values. Structured outputs enforce this server-side, so the model cannot emit a fifth value on the on-device path.
3. **Validate on apply.** `applyKiDiagnosis` rejects an unrecognised status (retaining the current one) instead of storing it. Required because diagnoses still arrive via the Drive inbox from hand-written files or sessions working off the stale doc, which the schema does not govern.
4. **Correct the doc** to `🔴 Handlungsbedarf`.

The fix direction is deliberate: change the doc, not the app. Live `state.health` values use the app's vocabulary, so changing the app's strings would orphan stored data and require a migration. The doc is the side that is wrong.

---

## Blocking prerequisite: the sync model assumes a single writing device

The app will now run on **two** devices — the Android phone (capture and diagnosis) and the iPad (capture and review). The current sync design cannot support that without losing data.

`cloud-sync.js` states the assumption in its own header: *"this device (iPad) is the source of truth."* `reconcile()` pulls from Drive **only when local storage is empty**; in every other case it calls `pushLocal()`, which uploads the entire local payload. `onLocalChange()` does the same on a debounce. Nothing ever downloads-and-merges.

The resulting failure is silent and costs real data:

1. Phone (fresh install, empty) pulls the current state from Drive. Both devices now agree.
2. Phone photographs a plant; the diagnosis applies locally and the full payload is pushed to Drive.
3. iPad is opened later. Its local state is not empty, so it pushes **its own stale full payload**, overwriting the photo and diagnosis the phone just uploaded.

Whichever device is opened last wins, wholesale, with no warning and no merge. Note the KI-diagnosis inbox is not a workaround here: inbox entries merge by entry id, but an on-device diagnosis writes straight into local state and is therefore exposed to the clobber like any other edit.

**Two-device use is a hard requirement, so this must be fixed in the same body of work.** Two stages:

- **Guard first (small).** Before pushing, fetch the remote file's `modifiedTime`; if it is newer than this device's last successful pull, do not blind-push. This alone converts silent data loss into a detectable conflict.
- **Then merge (the real fix).** The state is genuinely mergeable because almost every record is keyed or dated: `state.tasks[id]` carries `{last, next}` (take the later `last`), `state.health[id]` carries `updated` (take the later), `state.observations` entries have unique ids (union), and `photoMeta` / `photoCache` are keyed by unique photo keys (union — and photos are already append-only in Drive). Replace whole-payload overwrite with a field-level merge over these shapes.

Until the merge lands, two-device use is only safe under the discipline of never editing on both devices between syncs — which is not a discipline worth relying on.

## Related scaling risk (not in scope, but adjacent)

`gartenmanager-data.json` is currently ~45 MB because `buildPayload()` embeds every photo as base64 inside the state file, and every debounced save re-uploads the whole thing. The `photos/` folder already stores images as separate files, so the embedded copy is redundant except for a cold restore. Increasing photo volume makes this worse. Worth splitting before the photo rate goes up.
