# Per-record timestamps so the newer change always wins

**Status:** Active — not yet implemented
**Date:** 2026-08-02
**Type:** refactor
**Scope:** Give every mutable record a change timestamp, and make the sync merge decide by it. Replaces the current mixture of per-type heuristics that cannot always tell which side is newer.

## The problem

The merge added earlier today decides "which side is newer" differently for each record type:

| Record | How recency is judged today | Fails when |
| --- | --- | --- |
| `tasks[id]` | `last` completion date | Both empty, or same day |
| `health[id]` | `updated` (date only) | Two changes on the same day |
| `profiles[id]` | line-wise union of text | Deletions and edits are indistinguishable from additions |
| `observations` | union by id | — (safe, append-only) |
| `kiRead` | additive, local wins | Cannot represent "mark unread" |
| `photoMeta` | assignment beats unassigned | Two different assignments |
| `customPlants` / `customTasks` | union by id, local wins | An edit on one device loses to a stale copy on the other |
| `suppressedTasks` | `since` (date only) | Same-day suppress/restore |

Where there is no way to tell which side is newer, **local wins by design** — that protects your own edits from being clobbered, but it means a stale device can hold its ground indefinitely and a change made elsewhere never lands. Day-resolution dates make this worse: most edits happen on the same day, so the comparison is a coin toss.

Observed symptom: an iPad and a phone both reporting "Verbunden", holding demonstrably different state, with the Drive copy verifiably correct (26 findings, 26 read markers, written by a v29 device) and at least one device not converging on it.

## The change

**Every mutable record carries `ts`, a full ISO-8601 timestamp**, set whenever that record is written. The merge becomes one rule: *for each record id, the side with the later `ts` wins*. No per-type heuristics.

Records to stamp: `tasks[id]`, `health[id]`, `profiles[id]`, `photoMeta[key]`, `customPlants[]`, `customTasks[]`, `kiProposals[]`, `suppressedTasks[id]`, and `kiRead[id]` (store the ISO timestamp as the value instead of `true` — a truthy string keeps every existing read check working).

`observations` and `history` stay append-only unions keyed by id; they are never edited in place and need no stamp.

### Deletions need tombstones

Today a delete on one device is undone by the other device's surviving copy, because a union cannot distinguish "deleted here" from "not yet known here". Deleting a photo, an observation or a custom plant must therefore write a tombstone — `{id, deletedAt}` in `state.tombstones[]` — which the merge honours when its `deletedAt` is later than the record's `ts`. Tombstones older than, say, 180 days can be pruned.

### Clock skew

Two devices can disagree about the time. Ties and near-ties should break deterministically rather than randomly: on equal `ts`, order by a stable per-device id (`state.meta.deviceId`, generated once per install) so both devices independently reach the same answer. This is not a distributed-systems-grade solution; it is enough for two devices owned by one person.

### Migration

Existing records have no `ts`. Treat missing as "oldest" — any stamped record beats an unstamped one. On first run after upgrade, stamp everything with the current time so the two sides don't fight over which unstamped copy wins; the device that upgrades first will simply win once, and thereafter timestamps govern.

## Why this is not a patch

This changes the shape of stored data and the semantics of every merge. It wants doing carefully, with the tests below written first, and **not at the end of a long session** — the system is currently showing divergence, and a rushed data-model change on top of that risks turning a recoverable inconsistency into an unrecoverable one.

Prerequisite before implementing: a full backup exported from **each** device, so that whatever state exists today survives the change.

---

## Testing Strategy

**Approach:** spec-driven-tdd

- Given two devices edit the same task, when merged, then the later `ts` wins regardless of which side is "local".
- Given the same record edited twice on the same day on different devices, when merged, then the later edit wins (the case day-resolution dates get wrong today).
- Given a record deleted on A and untouched on B, when merged, then it stays deleted.
- Given a record deleted on A and edited on B *after* the deletion, when merged, then B's edit wins and the record returns.
- Given identical `ts` on both sides, when merged on either device independently, then both reach the same result.
- Given a pre-upgrade record with no `ts` and a stamped record, when merged, then the stamped one wins.
- Given a device marks 26 diagnoses read and the other device has none marked, when merged, then all 26 are read on both — the case that prompted this spec.
- Given a full round trip (A edits → push → B pulls → B edits → push → A pulls), then no edit from either side is lost.
