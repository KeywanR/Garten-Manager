# Confirmable care advice, weather in the care plan, and a fertilizer inventory

**Date:** 2026-08-11
**Status:** Active - Phase 1 implemented in v52 (2026-08-11), Phase 2 open
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

## Phase 2 - fertilizer inventory

Only once Phase 1 is in place, because a dosing recommendation is precisely the advice that must be confirmable.

### Design

**`state.fertilizers[]`**, each entry: `id`, `name`, `kind` (mineral / organisch / Kompost), `form` (fluessig / Granulat / Staebchen), `npk` as written on the pack, `dosage` as written on the pack, `photo` key, `amountLeft` (rough: viel / wenig / leer), `note`.

**Photos** reuse the existing photo pipeline - the same import, the same Drive upload, the same identity handling, so nothing new has to be taught about dedup or `photosPendingUpload`.

**The run gets the list** in `buildDossierPayload`. Feeding advice must then either name a product the user owns with a concrete dose for that plant, or raise a `proposePurchase` proposal naming what is missing and why the stock does not cover it. A generic "duengen" instruction with no product is no longer acceptable output.

**Reading the pack.** Where a photo of the label exists, the run may read the NPK and dosage off it rather than relying on what was typed - with the pack text winning over any guess, and the plant file's own history winning over both.

### Open questions for Phase 2

- Does `amountLeft` need to be tracked seriously, or is "the user will notice when it is empty" enough? Tracking consumption implies logging every feeding, which is a much bigger ask.
- Should a confirmed feeding proposal automatically log a `duengen` task completion, or stay a suggestion?

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
