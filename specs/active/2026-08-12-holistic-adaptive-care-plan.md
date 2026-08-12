# A holistic, adaptive care plan

**Date:** 2026-08-12
**Status:** Active - design agreed, not built
**Type:** new-feature
**Scope:** Make the care plan one living regime per plant, reasoned about as a whole and executed as individual scheduled tasks, each naming a product and a dose, adapting each run to season, weather, what was actually applied, what is in the shed, and the choices the user has made.

Supersedes the single-pick resolver shipped in v56 as the *primary* mechanism. v56 stays as the offline fallback: it answers "which bottle for this one task, right now" when a task has no product of its own.

## The problem

v56 made the task card concrete - it names a product instead of "Passender organischer Dünger". But it is stateless and single-product:

- `pickFertilizer()` takes only the season-derived requirement and the current inventory. It never sees when the plant was last fed or with what. Feed on Monday, and Tuesday's recommendation is identical.
- It returns exactly one choice. "Naturrein as a base in spring, Naturen liquid weekly while fruiting" cannot be expressed at all.
- Feeding history exists but only as prose: `buildPlantDossier` flattens the timeline to `{date, type, text}` with the product buried inside the text.

A real feeding regime is two or three components with different jobs and rhythms. On the current shelf that is: Naturrein Langzeitdünger as the slow-release base, Naturen 3-3-5 as the weekly liquid during fruiting, Blattgrün PLUS as a corrective when leaves yellow, Dehner Phosphat-Kali as a late potassium application for woody plants. Four products, four jobs. Nothing in the app can currently say that.

## The model

**Evaluated as one system. Executed as individual scheduled tasks.**

The user never acts on "a regime". They act on `Tomaten düngen` appearing in Heute. But that task exists because the whole care plan was reasoned about, and the task must say so on its face.

- **Holistic evaluation.** Whenever the run touches a plant it assesses the whole care system together - watering, feeding, treatments, pruning - never patching one task in isolation. `proposePlan` already has this shape; it just carries no products and no grouping.
- **Atomic execution.** The regime materialises as scheduled recurring tasks, each with its own product, dose and interval, each surfacing on its own day.
- **Visible grouping.** A task carries `planId` and `planTitle`, so the card reads "Teil von: Düngeplan Tomaten (Sommer 2026)" and the user can see it is one move of three.
- **Living, not frozen.** The plan is re-derived every run from season, weather, the feeding log, the inventory, and the user's prior choices. A confirmed plan is a starting point, not a settlement.

## The choice rule

This governs every recommendation the system makes, and the four rows are not interchangeable.

| Situation | Behaviour |
| --- | --- |
| One option is better for the role | Decide. Name it with a dose. Second-best in a subordinate clause, never a menu. |
| Two products genuinely equivalent for that role - two potassium-led feeds, both on hand, either would do | May ask. One question, both named, the answer recorded against the plan. |
| The trade-off is money or values - buy versus don't, organic versus mineral | Ask, as competing whole plans, each internally coherent. |
| Any choice the user makes | Feeds forward. The next feeding adapts to it. |

The last row is the test for the middle two: **a choice that does not change what comes next was not worth asking for.** If the run cannot say how the answer will alter the plan, it decides instead.

This refines rather than contradicts the standing preference ("select one best option, alternatives as sub-text, never leave choices for manual selection"). That rule bans menus where one answer is better. It does not ban a genuine fork where the options are equivalent or the trade-off belongs to the user.

## Changes

1. **Task schema.** Tasks gain `fertId`, `dose`, `planId`, `planTitle`. A task becomes "feed with X at dose Y every N days as part of plan P" rather than a bare title and interval. Touches `customTasks`, `proposePlan.addTasks` / `changeTasks`, and the task card.
2. **Structured feeding log.** `buildPlantDossier` exports `feedingLog: [{date, product, dose, note}]` alongside the prose timeline, built from `history` entries that already carry `fertilizer`. Without this the run cannot reason about what actually went on.
3. **Competing plans.** A new proposal shape carrying two or more internally coherent variants with an A/B confirmation in the KI section. Confirming one applies its whole task set and discards the other.
4. **Equivalent-product question.** A lighter proposal type: one question, two named products, the answer stored on the plan so subsequent feedings use the chosen one.
5. **Both prompt copies.** Evaluate the whole care system together; propose it as scheduled tasks carrying products; mark the grouping; apply the choice rule above; account for what the feeding log shows was already applied this season; a purchase may be part of a plan, flagged as such.

## Slices

Built in order, each landing in a working state rather than one PR that has to be right all at once.

**Slice 1 - task schema and memory (built, v57, not shipped).** Tasks carry `fertId`, `dose`, `planId`, `planTitle`; `rebuildCatalog` preserves them; `changeTasks` treats unspecified as unchanged; `buildPlantDossier` exports a structured `feedingLog`. The card prefers a task's own product over the v56 resolver. Nothing user-visible changes except that a planned task names its own feed.

The hazard found while building it, worth keeping: `rebuildCatalog` does not mutate tasks, it RECONSTRUCTS each one from a fixed field list, and runs on nearly every state change. Any field it forgets is destroyed within seconds of being written. A regression test in `test-photo-identity.js` now fails if the four fields are dropped again; it was verified to fail by reintroducing the bug, not merely written.

**SHIPPING GATE for slice 1.** Both prompt copies must be updated in the same sitting the slice merges - not before, because they describe the contract of the DEPLOYED app, and not after, because that is the drift this project keeps paying for. They need: tasks in `addTasks`/`changeTasks` may carry `fertId`, `dose`, `planId`, `planTitle`; `feedingLog` exists per plant and is the record of what actually went on; unspecified fields on a `changeTasks` entry mean unchanged, not cleared.

**Slice 2 - the regime.** The run proposes a whole feeding plan as several scheduled tasks in one `proposePlan`, each with product, dose and interval, sharing a `planId`. Prompt work is the bulk of this.

**Slice 3 - choices.** The A/B surface for competing plans, and the lighter one-question form for genuinely equivalent products, with the answer stored on the plan so later feedings adapt.

## Risks

| Risk | Cover |
| --- | --- |
| The living plan churns - tasks rewritten every morning | The existing cap applies: one weather-driven plan proposal per plant per seven days. A regime change needs a reason beyond "today is a different day" |
| Choice fatigue returns through the new question types | The fourth row of the choice rule is the gate: no question unless the answer demonstrably changes the next action. Judgment-enforced, so watch it in practice |
| Task proliferation - three feeding tasks per plant across 30 plants | Group by `planId` in the UI and count a plan as one line in Heute where its tasks fall on the same day |
| A regime is confirmed, then the inventory changes and it silently rots | The plan is re-derived each run; an unavailable product in an active plan is a reason to revise, and the run already sees `available: false` |
| The A/B surface becomes the place where all hard calls get dumped | Competing plans are for money and values, nothing else. If the run cannot name what makes the two genuinely different, there is one plan |

## Testing

- A plant with a slow-release applied in June is not told to apply it again in July; the liquid feed continues on its own rhythm.
- A feeding ticked off with a substituted product changes the next recommendation to that product with a recalculated dose.
- Two potassium-led feeds on hand produces at most one question, and the answer is visible in later recommendations.
- A regime spanning three tasks shows the same `planTitle` on all three cards.
- No plan proposal appears on consecutive mornings for the same plant without a stated reason.
