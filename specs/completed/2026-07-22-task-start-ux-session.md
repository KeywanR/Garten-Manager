# Task-Start UX Clarification (v23) + Memory Sync Fix

**Date:** 2026-07-22
**Status:** COMPLETE - shipped as v23 (PR #10). Follow-ups all resolved: cache bump moot at v49, memory entries confirmed surviving consolidation, Hortensie fertilizing window closed as decided.
**Project:** Garten-Manager

## Summary

The single „Aufgabe starten" button on unstarted tasks was ambiguous — it could mean "put this on my list" or "I just did this, start the cycle". Split it into two explicit actions with an inline hint, shipped as v23 via PR #10 (merged). Along the way, discovered and fixed a Mozart memory bug: project memory entries had been written to a synced copy instead of the git-backed source and silently vanished.

## Decisions

- Split the unstarted-task action into „✓ Gerade gemacht" (records completion today, anchors the recurrence cycle to now) and „Einplanen (fällig <date>)" (adds to list without completion, due date shown in the button label).
- Added an inline `.hint` line under unstarted tasks explaining both options; toasts now state the resulting due date.
- Labelled the date input on started tasks „Erledigt am" — it sets the last-done date, which was equally ambiguous.
- Kept the design rule that fertilizing tasks (`:duengen`) never auto-start: the cycle anchors to the first real fertilization. All other in-season, non-optional tasks auto-start on app open (`initializeCareTasks()`).
- Merged PR #10 with a merge commit (`02938f7`) to match repo history; remote + local feature branches deleted.
- Memory entries (Garten-Manager, EGR26) restored to `~/.mozart/memory/core/active-work.md`; operational detail moved to archive lesson `garten-manager-ops.md`; the write-to-the-copy gotcha documented in domain-knowledge.

## Follow-ups

- [ ] iPad: close and reopen the app twice so the v23 service-worker cache takes over.
- [ ] Verify after the next session that the Garten-Manager and EGR26 memory entries survived consolidation (the real test of the memory fix).
- [ ] Hortensie: fertilizing window (Mär–Jul) is effectively closed — skip until next March rather than starting the cycle now.

## Artifacts

- [Modified] `app.js` — `taskHTML()` unstarted branch (two buttons + hint), `startTask()` toast with due date, date input label.
- [Modified] `index.html` — `.hint` CSS rule.
- [Modified] `service-worker.js` — cache bumped `mein-garten-v22` → `mein-garten-v23`.
- [Merged] PR #10 `feature/clear-task-start-actions` → main, merge commit `02938f7`.
- [Created] `~/.mozart/memory/archive/lessons/garten-manager-ops.md` — Drive mount, KI inbox schema, iPad-only sync writer, auto-start logic, cache-bump rule.

## Context

The app is a PWA; any app-shell change needs a `CACHE` bump in `service-worker.js` or iPads keep serving the stale version. Unstarted tasks only render in the Pflanzenakte view — Today/Week views filter to started tasks, so that's where the new buttons live. The memory bug matters beyond this project: on Windows, `.claude/rules/memory/*.md` in the Mozart repo and injected projects are copies, not symlinks — memory writes must target `~/.mozart/memory/core/` directly or they are lost on the next sync.
