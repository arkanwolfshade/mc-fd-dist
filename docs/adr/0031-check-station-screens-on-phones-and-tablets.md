# 0031. Check the station screens on phones and tablets

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

The food bank has not chosen its station devices (project plan, question 7), and personal phones are the backup. Until now the browser tests ran in one desktop Chromium window. `e2e/layout.spec.ts` resized that window to three widths, but it used no touch and no WebKit, the engine under every browser on an iPhone or iPad, and it checked only that controls stayed inside their panels. ADR 0021 and the architecture document both said phone layouts were unchecked.

## Decision

- **Profiles:** `playwright.config.ts` has six projects. `desktop` is the existing 1100×900 Chromium window and runs every test file. The five others run the station files only: `iphone` (iPhone 13, WebKit), `iphone-landscape` (the same phone turned sideways), `ipad` (iPad gen 7, portrait, WebKit), `android` (Pixel 7, Chromium) and `reflow` (320×568, Chromium, touch).
- **Station files:** the files for screens people use at a station run on the five device profiles: accessibility, corrections, device, help, layout, offline and shift-flow. The list is `STATION_TESTS` in `playwright.config.ts`. A new test file for one of those screens must be added to it. Admin, licenses, feedback, colors and design stay on desktop, because the admin is used at a desk.
- **Checks on every profile:** the page never scrolls sideways, and no control leaves its panel or the screen.
- **Checks on touch profiles, for the station screens and the sign-in screen:** every button, link, field and choice (measured by its label) is at least 44×44 px, and every text field has text of at least 16 px, because iOS Safari zooms the page when a smaller field is tapped. The 44 px figure is the stricter of the two WCAG sizes (24 px in 2.2, 44 px in the AAA guideline) and matches the 44 pt guidance for iOS.
- **200% text:** the `reflow` project stands in for it. The CSS sizes text in px, so a larger root font would change nothing. Browser zoom of 200% on a 640 px window shows the page as if it were 320 px wide, which is what WCAG 1.4.10 tests.
- **The device reaches the stations:** each station opens its own browser context, so `e2e/device.spec.ts` checks on every profile that the window size and a coarse pointer arrive there. Without it a profile could quietly run as desktop. A coarse pointer is the test for touch because WebKit reports no touch points even when emulating them.
- **Offline fonts:** the first WebKit run showed that an offline reload right after the first visit lost the fonts, which the stylesheet names and the page does not. The service worker now caches the woff2 files when it installs. A font that fails to fetch is skipped, so it cannot stop installation.
- **Two tests skip WebKit:** the two that wait for the Offline banner (`offline.spec.ts` and `shift-flow.spec.ts`), because WebKit's offline mode leaves an open WebSocket connected. Each says why in the code.
- **Pictures offline:** the guide pictures are saved only once seen. Before then they fail to load and show their alt text, which `help.spec.ts` checks that every picture has. WebKit reports each missing picture as a page error, and that test sets those aside.
- **CI:** the `check` job installs WebKit next to Chromium. It is already a required check, so the ruleset does not change.
- **Real devices:** emulation cannot show what real hardware does, so a checklist for it is in the operations runbook.

## Alternatives considered

- **Real devices only:** the only true test of Safari, but manual, so a layout regression would not be caught until a dry run.
- **Every test file on every profile:** about 290 more runs for little extra value, since admin screens are used at a desk.
- **A larger root font for 200% text:** it would change nothing in a layout sized in px.
- **Precaching the guide pictures:** about 739 KB at install. The alt text already gives a fallback, so it was not worth it.
- **Skipping the sign-in and help screens:** they are the first things a volunteer on a phone sees, so the layout test visits them.

## Consequences

- The browser tests take about five times as long: on one Windows machine with two workers, 55 seconds on desktop alone and 4.9 minutes with every profile (288 runs, 6 skipped). The first CI run should be compared with that.
- Under heavy load the WebKit and 320 px runs are slower, and a 5 second wait can time out. A local run with every worker failed several of them, and each passed alone and with two workers. CI retries once.
- The first run found no tap-target or text-size failures: the existing screens already meet the 44 px and 16 px floors, so the checks guard against regressions, and no screen was redesigned.
- A change to the layout that breaks one of these rules fails the pull request, whatever the device.
- Emulation does not prove: installing the app from Safari or Chrome, the on-screen keyboard covering a field, a locked screen, rotating mid-entry, or offline behavior on iOS (including the two skipped tests). The runbook checklist covers those.
