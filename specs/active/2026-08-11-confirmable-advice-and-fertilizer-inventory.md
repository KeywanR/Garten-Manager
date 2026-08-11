# Confirmable care advice, weather in the care plan, and a fertilizer inventory

**Date:** 2026-08-11
**Status:** Active - Phase 1 (v52) and Phase 2 (v53) implemented 2026-08-11, neither deployed yet
**Type:** new-feature / bug-fix
**Scope:** Stop care advice from being buried unconfirmed in the plant description, let the weather actually change a care plan instead of only colouring the prose, and give the run a list of the fertilizers on hand so its dosing advice refers to something the user owns.

Two phases, in the order the user asked for them. Phase 2 depends on Phase 1 being in place, because a fertilizer recommendation is exactly the kind of advice that must be confirmable rather than silently filed.

## The problem

Three findings, one root cause: the run has two ways to say something, and only one of them is visible.

**1. Profile appends are silent.** `applyKiDiagnosis` (`app.js:893-905`) takes any `e.profile.<field>` and appends it to the plant description as a `[KI <date>] <text>` line. It is never proposed, never confirmed, never turned into a task, and is only discoverable by opening the plant file and reading. The routine prompt sends care advice down this path on purpose: "Giesshinweise aus dem Wetter gehoeren in `watering`". The single most actionable thing the weather step produces therefore lands where it cannot be acted on.

**2. An empty plan proposal vanishes.** `proposePlan` (`app.js:836-840`) filters `addTasks` against tasks that already exist, and `changeTasks`/`removeTasks` against ids that must already exist. When all three filter to empty, `addProposal` is never called. Nothing is shown, nothing is logged, and `kiReviewed` is still stamped further down, so the plant is not looked at again. A plan change naming a task id slightly wrong disappears silently. This is the same class of defect as the delegation failure: the system reports success while doing nothing.

**3. Weather is deliberately barred from the care plan.** The current restraint clause allows a weather-driven `proposePlan` only for a "dauerhafte Verschiebung". That was the right call when the alternative was daily unconfirmable churn. With advice made confirmable it is too strict: the user wants the weather to change watering and feeding, and the confirmation step is what protects against noise.

## Phase 1 - confirmable advice (SHIPPED v52)

### Design

**A new proposal type `advice`.** Care-relevant profile text stops being a silent append and becomes a pending item in the KI section, alongside `plan` and `newPlant`, with three actions: confirm, comment, reject.

- **Confirm** does what happens today: appends `[KI <date>] <text>` to the profile field.
- **Reject** drops it and records the decision so the run does not repeat it.
- **Comment** is new and is the point of the feature: the user writes a sentence back, the proposal stays resolved, and the comment travels to the run in the next dossier.

**Which fields become confirmable.** Judgment call, stated so it can be overridden: `watering`, `fertilizing` and `treatments` are care instructions and become `advice` proposals. `location`, `planted`, `diseases`, `harvest` and `notes` are descriptive records and keep appending silently - making every observed fact a confirmation prompt would train the user to click through without reading, which is the failure the restraint clause was written to avoid.

**No silent drops.** When `proposePlan` filters to empty, raise a proposal anyway stating what the run wanted and why it did not apply (task already exists, unknown task id). The user can then ignore it or correct the id. Never swallow.

**Comments reach the run.** `buildDossierPayload` already exports `kiProposals` with `status`. Add `comment` and `decidedAt` so the run can read a rejection reason or a question and answer it next morning. The routine prompt gains a step: a proposal carrying a comment is treated like a user observation - answer it, and re-propose only if the comment asks for it.

### Weather in the care plan

Replace the "only for a durable shift" bar with a narrower guard now that the user sees and confirms every change:

- A weather-driven `proposePlan` is allowed when the seven-day water balance or the heat-day count justifies a different interval, not only at a season boundary.
- At most **one** weather-driven plan proposal per plant per seven days, so a heatwave produces one proposal rather than one per morning.
- Container plants are still called out separately - they are most of this garden and they are what a water deficit actually hits.
- The existing rules stand: nothing already `rejected` in `kiProposals` is repeated, nothing in `suppressedTasks` is proposed again.

### Changes

- `app.js`: `applyKiDiagnosis` routes care-relevant profile fields through `addProposal` with `type:'advice'`; `confirmProposal` applies the append; new `commentProposal`; empty-plan guard; KI view renders `advice` with a comment box; `buildDossierPayload` exports `comment`.
- `skills/garten/SKILL.md` and the routine prompt (`trig_01WGicrr1NgzQ11gYRMcxT6w`): the weather guard, the profile-vs-advice split, and reading comments on prior proposals. All three copies in the same sitting, per the standing rule.

## Phase 2 - fertilizer inventory (SHIPPED v53)

Only once Phase 1 is in place, because a dosing recommendation is precisely the advice that must be confirmable.

### Design

**`state.fertilizers[]`**, each entry: `id`, `name`, `kind` (mineral / organisch / Kompost), `form` (fluessig / Granulat / Staebchen), `npk` as written on the pack, `dosage` as written on the pack, `photo` key, `amountLeft` (rough: viel / wenig / leer), `note`.

**Photos** reuse the existing photo pipeline - the same import, the same Drive upload, the same identity handling, so nothing new has to be taught about dedup or `photosPendingUpload`.

**The run gets the list** in `buildDossierPayload`. Feeding advice must then either name a product the user owns with a concrete dose for that plant, or raise a `proposePurchase` proposal naming what is missing and why the stock does not cover it. A generic "duengen" instruction with no product is no longer acceptable output.

**Reading the pack.** Where a photo of the label exists, the run may read the NPK and dosage off it rather than relying on what was typed - with the pack text winning over any guess, and the plant file's own history winning over both.

### Decisions taken (both questions answered by the user, 2026-08-11)

- **No quantity tracking.** Ruled out explicitly. What replaced it is a single availability switch: `available: false` with an `outSince` date, set by an "Aufgebraucht" button. That is not a stock figure nobody maintains - it is a fact the user states once, and it changes the advice completely.
- **Confirming is not doing.** A confirmed plan or recommendation means "this is right", never "I have fed the plant". The `duengen` task is ticked off separately. Merging the two would reset the interval as though the plant had been fed, the reminder would vanish, and the plant would wait a full cycle.

### Added during implementation

- **"✓ mit Notiz" on every task card.** Ticking a feeding off now optionally records WHICH product actually went on - picked from the available inventory - and a remark or question. The remark is filed as an observation, which stamps the plant for re-assessment, so the run answers it the next morning. Repeated divergence from the suggestion is treated in the prompt as evidence about the suggestion, not about the user.
- **Home-brewed feeds.** `selfmade: true`, with a one-tap "Brennnesseljauche ansetzen" that records the date it was set up. This matters because the built-in `fertilizerPlans` table names Brennnesseljauche as the early-season default for most vegetables without knowing whether any exists. When a self-made feed runs out the correct advice is not "buy more" but "set a new batch today", with two to three weeks of lead time and a bridge product named for the interval.
- **Pack shots ride the normal photo pipeline** under key `duenger|<id>` with `kind:'duenger'` on photoMeta - excluded from the orphan-photo lists in both the KI view and the dossier, or every pack shot would sit in the inbox asking which plant it belongs to.

### Added in v54, after the first real inventory was photographed

Six products came in and two of them were not fertilizer: Dehner Algenkalk (a liming soil conditioner) and Dehner Antikalk (a citric-acid water softener). Both sit on the same shelf, both get photographed with the feeds, and neither feeds a plant. The rule written in v53 - "name a product from `fertilizers[]`" - would happily have answered a nitrogen shortage with lime, which is not merely useless: it moves soil pH the wrong way.

- **`type` field**: `Dünger` / `Bodenhilfsstoff` / `Wasseraufbereitung`. Only `Dünger` can satisfy a feeding recommendation. The other two are context the run may cite when relevant (hard tap water, an alkaline bed, box hedge) but never as a feed. Enforced in `feedsOnHand()`, which now gates the task card, the completion picker and the prompt rule.
- **Paste importer**: one line per product, fields separated by `|`. Four prompts per product is fine for one bottle and absurd for a shelf. Duplicate names are skipped rather than merged - a second "Blaukorn" is almost always the same tub entered twice, and merging two records that differ in dosage would lose whichever was typed second.

Observed from the first inventory, worth keeping: the seasonal switch in `fertilizerPlans` is fully covered by what is already owned - Florissa Blattgrün PLUS (8-0-0) as the nitrogen-led early feed, Naturen Bio Dünger (3-3-5) as the potassium-led one from June. No purchase is needed for the vegetables this season. There is no Brennnesseljauche on hand, which is precisely the case the availability flag exists for.

### Added in v55, after the first inventory was used

- **Own tab.** The shed outgrew a settings panel the moment it held six products. `Dünger` now sits next to `Pflanzen` in the nav, with a count that separates what is owned from what can actually feed something ("6 erfasst, 4 einsetzbar").
- **Card layout.** The old row flattened type, form, NPK, dosage and note into one dot-joined line, which read as noise. A fertilizer label is a table of facts, so it is laid out as one, reusing the existing `.plant-card` structure rather than inventing a second card style.
- **Photo-first creation, mirroring plants.** `addFertilizerByPhoto()` creates an entry with `needsReview: true` and no name, stores the pack shot, and lets it reach Drive on the next sync. The run opens the label and returns `identifyFertilizer` (id, name, type, form, npk, dosage, note); the app fills the record, clears the flag and raises a `fertilizer` proposal so a misread label is corrected rather than believed. The prompt requires an unreadable field to be left EMPTY rather than guessed: an empty dosage is an open question, an invented one gets carried out.

**What could not be done, and why it is written down:** the user asked for six pack photos he had already shared to be added directly. That is not possible from outside the app. `restorePhotos` (`app.js:1778`) clears the whole IndexedDB photo store and replaces it, so the only Drive-to-app image route is destructive, and photo records are keyed to entries only the app creates. Editing the synced state file by hand would mean forging the per-record timestamps the merge depends on. The photo-first flow above is the answer to that request, not a substitute for it.

## Risks

| Risk | Cover |
| --- | --- |
| Confirmation fatigue - too many pending items, user clicks through unread | Only care-relevant fields become proposals; descriptive facts stay silent appends. One weather plan proposal per plant per week |
| A weather proposal contradicts what the photo shows | Unchanged and still explicit: the photo decides what the plant shows, the weather explains it, and a contradiction is stated rather than resolved silently |
| Comments are written and never read | The comment travels in the dossier and the prompt requires an answer; if a comment goes unanswered two mornings running that is a visible bug, not a silent one |
| Advice proposals pile up unresolved and the plant is never re-examined | `kiReviewed` semantics need checking against the new type - an unresolved advice item must not block re-assessment |
| Dosing advice from a misread label | The pack photo is evidence, not authority; the run states what it read and the user confirms. No dosing that would need professional advice |

## Testing

- A run during a dry spell produces a watering proposal in the KI section, not a line buried in the description.
- The same dry spell on the following morning does not produce a second proposal for the same plant.
- A `proposePlan` naming a non-existent task id produces a visible proposal explaining why it did not apply, instead of nothing.
- A comment written on a proposal appears in the next dossier and is answered in the next morning's run.
- Phase 2: a feeding recommendation names a fertilizer from the list with a dose, or proposes a purchase.
