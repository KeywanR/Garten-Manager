# Split photos out of the sync payload

**Status:** Active - implemented, awaiting per-device backups before merge
**Date:** 2026-08-07
**Type:** refactor
**Scope:** Stop embedding base64 images in `gartenmanager-data.json`. The images already exist as individual files in the Drive `photos/` folder; the copy inside the data blob is pure duplication and is the whole reason the file reached 52 MB.

## The problem

`buildPayload` serialises `photoCache` wholesale into the synced JSON:

```js
const core={format:'gartenmanager-backup',...,state:normalizeState(state),photos:photoCache};
```

Every sync therefore uploads and downloads every photo ever taken, base64-encoded at roughly 1.33x their real size, on top of the identical images already sitting in `photos/`. Consequences, in order of how much they hurt:

- Every push takes minutes on a phone, which widens the conflict window between two devices and makes a partial write more likely.
- The upload comment in `pushLocalInner` already concedes the point: photos go up first precisely because the blob is so slow that running it first starved the image uploads of a fresh access token.
- Drive holds the same bytes twice.

## Why it was not simply deleted

A second device needs some way to obtain images. Today the embedded copy is that way. Removing it strands any device that has state but no local blobs.

The blocker is smaller than it looks, and precise: **`photoMeta` does not record the Drive filename.** Resolution runs the other way round, through `gmDrivePhotoName(key, dataUrl)`, which reads the per-device `gm_drive_photo_index` in localStorage, and falls back to deriving `key + date + extension` from the data URL. Both inputs are things a device without the blob does not have - the index is local-only, and the extension is read off the very bytes that are missing. So a device can hold complete `photoMeta` and still be unable to name the file it needs.

## The change

**1. Record the Drive filename in the synced state.** `uploadPhotoFile` writes `state.photoMeta[key].file` (and `.driveId`) alongside its localStorage index entry. `photoMeta` is in `TS_MAPS`, so this travels between devices like any other record. A one-time backfill stamps `file` for photos already present in the local index.

**2. Fetch missing images from `photos/` on merge.** `mergeRemote` and `adoptRemote` gain a pass that walks the merged `photoMeta`, and for every key with no local blob but a known `file`, downloads it from `photos/` and stores it. The download helper already exists - the KI inbox path uses it to pull images Claude uploaded - so this generalises rather than invents.

**3. Omit from the payload only what is provably safe to omit.** This is the part that makes the change safe by construction rather than by sequencing:

> A photo is embedded in the cloud payload if, and only if, it is **not** confirmed present in Drive.

Confirmed means: the upload index holds a record for the key whose fingerprint matches the current bytes, and `photoMeta[key].file` is set. Anything else - a photo taken seconds ago, a failed upload, a device that has not finished its queue - still travels inside the payload exactly as it does today.

There is no flag day and no window in which a photo exists in neither place. The payload shrinks on its own as uploads confirm, and re-inflates automatically for anything at risk.

**4. Local backups stay self-contained.** `buildPayload` gains an `includePhotos` argument. `exportData` passes `true`; the cloud push passes `false`. A backup file that cannot be restored without a working Drive connection is not a backup, and this is the one place the duplication earns its cost.

**5. Reading old cloud files keeps working.** `remote.photos` is still honoured when present. A device on the new build reading a file written by the old one loses nothing.

## What this does not change

Photo deletion, tombstones, and the orphan purge are untouched. `photos/` remains an append-only archive that is never pruned - the same rule the diagnosis routine depends on.

## Risks, and what covers them

| Risk | Cover |
| --- | --- |
| A photo omitted from the payload that is not actually in Drive | Impossible by the rule in point 3 - omission requires a fingerprint-matched index entry and a stamped `file` |
| Fresh device downloads state, cannot fetch images | Falls back to `remote.photos` for old files; for new files every referenced photo is by definition in Drive |
| Per-photo download failure on merge | Tolerated individually, logged, retried on the next merge; a missing blob degrades to a missing thumbnail, not lost data |
| Drive access revoked | Same exposure as today for `photos/`, which the diagnosis routine already depends on entirely |
| Two devices, one on the old build | Old build ignores `photoMeta.file` and still embeds everything; new build reads either shape |

## Prerequisite before merging

**A full backup exported from each device.** The 2026-08-02 timestamps spec set this condition for data-model changes and it was right then. This change alters what the synced file contains; the export path is deliberately unchanged so those backups remain complete and restorable.

## Testing Strategy

**Approach:** spec-driven-tdd, extending `test-photo-identity.js`

- Given a photo confirmed in Drive with `photoMeta.file` set, when the cloud payload is built, then its bytes are omitted and its metadata is retained.
- Given a photo with no index record, when the payload is built, then its bytes are embedded.
- Given a photo whose local bytes no longer match the index fingerprint, when the payload is built, then its bytes are embedded.
- Given a local export, when the payload is built, then every photo is embedded regardless of Drive state.
- Given merged `photoMeta` naming a file this device lacks, when the merge runs, then the image is fetched from `photos/` and stored under the right key.
- Given a fetch that fails, when the merge runs, then other photos still land and the failure is logged rather than thrown.
- Given a remote file in the old shape carrying `photos`, when merged, then those images are restored as before.
- Given `uploadPhotoFile` completes, then `photoMeta[key].file` matches the name actually written to Drive, including the alias case where the key points at another key's file.
