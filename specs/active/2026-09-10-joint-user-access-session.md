# Joint-User Access for Pat Wagner (v64 Drive scope)

**Date:** 2026-09-10
**Status:** Active
**Project:** Garten-Manager

## Summary

Made the garden app usable by a second person (Pat Wagner) against the same
shared Drive folder, rather than handing her a separate copy of the data. The
blocker was not the folder share but the OAuth scope: `drive.file` does not
cross Google's sharing boundary, so her writes would have failed with 403 while
reads worked. Shipped as v64 (PR #54, merged and verified live on GitHub Pages).
An onboarding email is drafted but unsent, and the OAuth consent screen still
needs one decision before she can sign in at all.

## Decisions

- Decided on one shared garden diary (both users write into the same pinned
  Drive folder) rather than two independent copies. The existing sync model
  already merges per record with newest-timestamp-wins and carries deletion
  tombstones, so it supports two writers without change.
- Widened the OAuth scope in `cloud-sync.js` from
  `drive.file` + `drive.readonly` to the full `drive` scope. Reason: a file
  created under the owner's account is invisible to `drive.file` for anyone the
  folder is shared with, regardless of Editor permission. Verified against
  Google's Drive API auth documentation, not from recall.
- Bumped `APP_BUILD` and the service-worker `CACHE` v63 -> v64 in lockstep, as
  `test-photo-identity.js` enforces their agreement, so installed PWAs pick up
  the new scope.
- Decided the PR would not be merged by the agent: merging `main`
  auto-deploys to GitHub Pages, so the deploy timing stays a human decision.
  User merged manually.
- Preferred publishing the OAuth app over maintaining a test-user list, because
  in Testing mode authorizations (refresh tokens included) expire after 7 days,
  which would mean weekly re-consent for both users. This preference now has a
  precondition - see Open Questions.
- Email drafted in English with the German UI labels quoted inline, left unsent
  per the email-draft-only rule.

## Open Questions

- **Which Google account Pat will use.** Resolved 26 Sep: her Gmail
  (wagnerinvienna@gmail.com) now has Editor on the data folder, with no Google
  notification sent; the email draft names that account. The older IIASA
  share still stands.
- **"Make internal" is greyed out** on the Audience page, consistent with the
  owning Google account not belonging to a Google Workspace organisation (IIASA
  runs Microsoft). So External plus publish-or-test-users are the only routes;
  there is no internal-org shortcut that would skip the warning screen.

## Follow-ups

- [x] Share the data folder `1gf3X6Ia1iVLBYoOfm94S37DioQ67Mby8` with Pat's
      Google account as Editor - done by hand in the Drive web UI, 10 Sep.
      This is the folder holding `gartenmanager-data.json`, not the
      identically named source-code folder. For the record: local sessions
      have no Drive surface (no Drive MCP registered, Claude in Chrome not
      connected, no Drive CLI) - connect Claude in Chrome to give sessions
      one.
- [x] Publish the OAuth app - In production since 26 Sep. Publish app stayed
      locked until the Branding page had both a home page and a privacy policy
      link; the privacy page shipped as `privacy.html` (PR #55). The project
      lives under the personal Gmail account, not the IIASA one, which gets
      "You need additional access". No API keys exist in the project.
- [ ] Send the drafted email (text preserved below). An Outlook-openable copy
      of the exact draft (opens in compose mode via `X-Unsent`) lives outside
      the repo at `~/.mozart/projects/garten-manager/pat-access-email-2026-09-10.eml`;
      review it there and press Send. Share the folder first - the email
      states the share as already done.
- [ ] After her first sign-in, confirm a write from her device actually lands
      (a silent 403 would look like a sync that reports success but never
      propagates).
- [ ] Pull the merged `main` locally and clean up
      `feature/v64-joint-user-drive-scope`.
- [ ] Consider whether `skills/garten/SKILL.md` and the daily routine prompt
      need a line about a second writer; both currently describe the folder as
      single-owner context.

## Artifacts

- Modified `cloud-sync.js` - `SCOPE` widened to `https://www.googleapis.com/auth/drive`,
  with a comment recording why `drive.file` cannot work for a shared-folder member.
- Modified `app.js` - `APP_BUILD` v63 -> v64.
- Modified `service-worker.js` - `CACHE` `mein-garten-v63` -> `mein-garten-v64`.
- Commit `fe719a0` on branch `feature/v64-joint-user-drive-scope`,
  [PR #54](https://github.com/KeywanR/Garten-Manager/pull/54), merged.
- Deploy verified live: all three markers current on
  `https://keywanr.github.io/Garten-Manager/`.
- Email draft (below) - unsent.

## Context

The sync file is pinned by Drive folder ID rather than found by name, because
more than one folder is called "Garten-Manager" and a name is not an identity.
Any instruction touching the data folder must use the ID.

Rollout is safe while devices run mixed versions: each device's own writes keep
working under whichever scope it holds, and v64 only adds capability. The
visible effect on existing devices is a single re-consent prompt at the next
token refresh, which is the widened scope asking permission and not an error.

Google exposes no API or CLI for consent-screen test users or for publishing;
both are console-only, so those two steps cannot be automated from a session and
have to be done by hand at console.cloud.google.com (project
`garten-manager-502221`).

The daily AI diagnosis routine is unaffected: it reaches Drive through the
claude.ai connector under a separate authorization, not through this OAuth
client.

## Email draft (unsent)

**To:** Pat Wagner <wagner@iiasa.ac.at>
**Subject:** Access to the garden app

```text
Dear Pat,

I'd like to give you direct access to our garden manager, so you can see
what's due in the garden, tick off tasks, and add your own photos and
notes. It's a small web app that installs on your phone or iPad like a
normal app and also works offline. The interface is in German, but it is
mostly pictures and buttons - here is everything you need.

One thing first: the app keeps its data in a shared folder on Google
Drive, so connecting requires a Google account (a Gmail address, or any
email you use as a Google login). I have shared the folder with your
IIASA address - if you would rather use a different Google account, just
tell me and I will share it with that one instead.

On iPhone or iPad:

1. Open this link in Safari: https://keywanr.github.io/Garten-Manager/
2. Tap the Share button (square with an arrow) and choose "Zum
   Home-Bildschirm" (add to home screen). The app now sits on your home
   screen like any other app.
3. Open it from the home screen (the first time with internet) and go to
   the "Daten & KI" tab at the top.
4. Under "Google Drive Sync", tap "Mit Google Drive verbinden" and sign in
   with your Google account.
5. Google will say the app is "unverified" - that only means it is my
   private app, not reviewed by Google. Choose "Advanced" and continue.
6. The app then loads the garden data from the cloud automatically:
   plants, care tasks, photos, notes.

On a computer it works the same in any browser - just skip step 2.

From then on we share one garden diary. Everything syncs automatically
when the app is opened and after every change, so what either of us does
- a completed task, a new photo, a note - appears on the other's device.
Editing at the same time is fine; the app keeps the newest change.

Two tips to start: tap any plant card to open its full record, and the
camera button on a card takes a picture straight into that plant's file.

If anything blocks you - an error message, "Access blocked" instead of
the sign-in, or a German button that resists translation - just write
back or call me and I will fix it from my side.

Warm wishes,
Keywan
```

## AI assistance

- Drafted by Mozart: the onboarding email above, the `cloud-sync.js` scope
  comment, the PR description, and this spec.
- Computed by Mozart: `node test-feeding-calendar.js` and
  `node test-photo-identity.js` (both pass, including the APP_BUILD/CACHE
  agreement check); deployed-asset check via curl against GitHub Pages;
  Google Drive scope behaviour verified against the vendor auth docs.
- Verified by a person: PR #54 reviewed and merged by Keywan Riahi on
  10 Sep 2026. The email is unsent and unreviewed; the OAuth publishing
  decision is open.
