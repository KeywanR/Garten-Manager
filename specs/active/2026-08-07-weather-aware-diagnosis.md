# Weather-aware diagnosis for Perchtoldsdorf

**Date:** 2026-08-07
**Status:** Active
**Type:** new-feature
**Scope:** Give the daily run the actual weather at the garden, so irrigation advice, heat and frost stress are judged against conditions rather than inferred from a photograph.

## The problem

The run sees a picture and a care schedule. It cannot tell drought from overwatering, and a wilting leaf looks much the same either way. Watering intervals are fixed numbers set once, so "alle 3 Tage giessen" means the same thing in a rainy May and in a week at 39 degrees with no rain at all.

The gap is not theoretical. On the day this was written the previous seven days at Perchtoldsdorf delivered 21.6 mm of rain against 47.1 mm of reference evapotranspiration, a deficit of 25.5 mm, with two days above 39 degrees and no rain in the following seven-day forecast. None of that reached the diagnosis.

## Data source

**Open-Meteo**, `api.open-meteo.com/v1/forecast`. No API key, no account, no cost, which is the deciding factor: an API that bills separately from the Claude subscription is out of scope for this project by standing preference.

Fixed coordinates for the garden, resolved once via Open-Meteo geocoding and hardcoded so the run never has to guess:

- Perchtoldsdorf, Niederoesterreich: **48.11935 N, 16.26607 E**, 259 m

Daily fields requested: `temperature_2m_max`, `temperature_2m_min`, `precipitation_sum`, `et0_fao_evapotranspiration`, `wind_speed_10m_max`, with `past_days=7` and `forecast_days=7`, timezone `Europe/Vienna`. The response is about 1 kB.

`et0_fao_evapotranspiration` is the useful one and the reason for choosing this API. Rain alone says nothing; rain minus ET0 is the water balance, which is what actually decides whether a pot is drying out.

## How the run uses it

**Irrigation.** Compute the seven-day balance (precipitation minus ET0) and the rain in the forecast window. A negative balance with no rain coming means watering advice tightens; a wet week means it relaxes. Container plants are called out separately, because a Kuebel dries out in a fraction of the time a bed does and most of this garden is in pots.

**Heat stress.** Days above 30 degrees, and especially a run of them, change how a photograph should be read: limp leaves in a heatwave are usually transpiration outrunning uptake rather than disease, and the correct advice is shade and water, not treatment.

**Frost.** From autumn, a forecast minimum near or below zero matters more than anything in the photo, and matters most for potted plants whose roots have no soil mass to buffer them.

**Restraint, which is the important part.** Weather informs the written assessment and the report. It does NOT generate a care-plan proposal every time it is hot. A `proposePlan` may only be raised for a durable shift, such as a multi-day heatwave or a change of season, never for one warm afternoon. The user confirms every proposal by hand; a run that proposes a watering change daily would train them to dismiss proposals unread, which costs more than the feature is worth.

## Changes

- Cloud routine `trig_01WGicrr1NgzQ11gYRMcxT6w`: add `WebFetch` to `allowed_tools`, add a weather step to the prompt, and reference the weather in the photo assessment, the user-input step and the report.
- `skills/garten/SKILL.md`: the same, since the two must not drift.

## Risks

| Risk | Cover |
| --- | --- |
| Open-Meteo unreachable during a run | The weather step is best-effort. If it fails, note it in one line and carry on with the normal assessment; a missing forecast must never abort the run |
| Weather advice contradicts what the photo shows | The photo wins on what the plant looks like; the weather explains why. Stated explicitly in the prompt |
| Proposal spam from routine hot weather | Plan changes gated on durable shifts only, and `kiProposals` already prevents repeating a rejected suggestion |
| Coordinates drift or the user moves | Hardcoded with the resolved values recorded here |

## Testing Strategy

Behavioural, observed over the following mornings rather than unit tested, since the change lives in a prompt:

- A run during a dry spell mentions the water deficit and tightens irrigation advice for potted plants.
- A run after heavy rain does not advise watering.
- A heatwave produces at most one plan proposal, not one per day.
- A run where the weather fetch fails still produces a normal diagnosis and says the forecast was unavailable.
