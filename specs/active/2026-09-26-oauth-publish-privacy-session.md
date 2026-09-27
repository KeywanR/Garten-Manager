# OAuth Publishing, Privacy Page and Pat's Gmail Access

**Date:** 2026-09-26
**Status:** Active
**Project:** Garten-Manager

## Summary

Closed the joint-user rollout started on 10 Sep. The leaked-key item turned out to be moot: the Cloud project has no API keys. The OAuth app is published to Production, which needed a new privacy policy page (PR #55). Pat's Gmail now has Editor on the data folder, the onboarding email went out, and Pat is using the app.

## Decisions

- Treated the leaked-key item as closed after checking Credentials and AI Studio under the owning Gmail account: no API keys, no service accounts. The app itself uses only the public OAuth client ID.
- Published the OAuth app (External, In production) rather than keeping Testing mode with test users, which would force re-consent every 7 days. Skipped Google verification: the unverified-app screen is acceptable for two users, under the 100-user cap.
- Filled in the Branding page's home page (`https://keywanr.github.io/Garten-Manager/`) and privacy policy (`.../privacy.html`) fields. Publish app stays locked until both are set, even though the console only says "complete your configuration on the Branding page".
- Wrote the privacy page as a standalone bilingual (de/en) static file outside the PWA shell, so no APP_BUILD/CACHE bump was needed. It discloses the full `drive` scope and that Claude reads the shared folder for KI-Diagnose.
- Shared the data folder `1gf3X6Ia1iVLBYoOfm94S37DioQ67Mby8` with wagnerinvienna@gmail.com as Editor, with Google's notification off. The older wagner@iiasa.ac.at share was left in place.

## Follow-ups

- [ ] Confirm one of Pat's edits shows up on the owner's device. A silent 403 would look like a successful sync that never reaches the other device.
- [ ] Optionally remove the now-unused wagner@iiasa.ac.at share on the data folder.
- [ ] Clean up the merged local branches `feature/v64-joint-user-drive-scope` and `docs/privacy-page`.
- [ ] Commit the two session specs in `specs/active/` (both untracked).
- [ ] Consider a line in `skills/garten/SKILL.md` and the daily routine prompt noting that the folder now has a second writer (carried over from the 10 Sep spec).

## Artifacts

- Created `privacy.html`: bilingual privacy policy, live at https://keywanr.github.io/Garten-Manager/privacy.html (PR #55, merged, commit f9f7b57).
- Modified `specs/active/2026-09-10-joint-user-access-session.md`: marked the publishing and share-target items resolved.
- Modified `~/.mozart/projects/garten-manager/pat-access-email-2026-09-10.eml`: names Pat's Gmail and adds a privacy paragraph. Sent by the user.
- Console (project `garten-manager-502221`): Branding home page and privacy link saved; publishing status set to In production by the user.
- Drive: Editor share added for wagnerinvienna@gmail.com.

## Context

The Cloud project, the OAuth client and the Drive data folder all belong to keywan.riahi@gmail.com. The IIASA Google account gets "You need additional access" on this project, and running the key check under it earlier gave a misleading "no key" answer.

Browser automation works only in the orange Chrome profile, where the Claude extension is signed in to claude.ai. That profile has the Gmail account added as a website login, which the console addresses as `authuser=1`. When Chrome offers "Switch to existing profile" or "Sign in to Chrome", decline both. Installing the extension in the green (Gmail) profile fails because IIASA's Claude-SSO app assignment blocks the claude.ai login there (AADSTS50105).

## AI assistance

- Drafted by Mozart: `privacy.html`, edits to the onboarding email draft, both spec updates, and the PR #55 description.
- Computed by Mozart: `node test-photo-identity.js` and `node test-feeding-calendar.js` (both pass); curl check that the privacy page is live; Cloud Console and Drive changes via Claude in Chrome (Branding fields, the Editor share).
- Verified by a person: the owner merged PR #55, clicked Publish app, reviewed and sent the email on 26 Sep 2026. Pat is using the app; her first write has not yet been confirmed on the owner's device.
