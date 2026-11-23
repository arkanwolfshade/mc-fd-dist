# Accessibility

The people who use this app are food bank volunteers and staff, of all ages and abilities, on shared tablets and a screen on the wall. The app should work for all of them. This file says what the project is aiming for, what has been checked, what has not, and how to tell us when something gets in the way.

Last reviewed: 2026-11-23.

## What we aim for

We aim to meet the [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) at level AA for:

- the station screens: front desk, distribution and admin;
- the wall display in the distribution room;
- the guides in the app's Help tab, and the printable PDFs made from them.

This is an aim. **The app has not been audited, and we do not claim that it conforms.** The two lists below are the honest picture of where it stands.

## What is in place, and how it is checked

Automated browser tests check these on every change. They check the page's markup and behavior in a test browser, not what a person using assistive technology experiences.

- **Screen readers:** every screen has one main area and a top-level heading, and moving to another screen moves focus to its heading. Buttons in a list say which card they act on, such as "Call back card 3". A missing choice, a saved card, a failed sign-in, and losing or regaining the connection are announced. A question that replaces a button moves focus to its safe answer. Totals say which total each row belongs to. (`e2e/accessibility.spec.ts`)
- **Touch and size:** on emulated phones and tablets, every button, link, field and choice on the station screens is at least 44 by 44 pixels, text fields use text of at least 16 pixels, and nothing needs a sideways scroll down to 320 pixels wide. The app does not block pinch zoom. ([ADR 0031](docs/adr/0031-check-station-screens-on-phones-and-tablets.md))
- **Colors:** light and dark colors that follow the device, which a person can also choose on the Help screen. There are styles for Windows High Contrast, and animation stops when the device asks for reduced motion.
- **Pictures:** every picture in the guides has a description, which shows if the picture cannot load. A test checks it.
- **Other:** the page language is set, and keyboard focus has a visible style.

## What has not been checked

- No one has tried the app with a real screen reader (VoiceOver, TalkBack, NVDA or JAWS), voice control or a switch.
- There is no automated accessibility scanner, such as axe, in the checks.
- Keyboard-only use has not been tested from start to finish. The browser tests click.
- Text colors are designed to contrast at least 4.5 to 1 with their background, but no tool measures it.
- There is no skip link. Each screen has a main area that a screen reader can jump to.
- The app has not been tried on real iPhones, iPads, Android devices, or on a real television for the wall display.
- The PDF guides have not been checked for tags or reading order. The same guides in the Help tab are ordinary web pages.
- The app and guides are in English only.
- A few details on the admin screen, in the activity log, use text as small as 13 pixels.

## Tell us about a barrier

If something in the app or the guides is hard or impossible to use, please [open an Accessibility barrier issue](https://github.com/arkanwolfshade/mc-fd-dist/issues/new?template=accessibility_barrier.yml). It asks what you were trying to do, what got in the way, and what device and assistive technology you use. You do not need to find steps to reproduce it.

If you cannot use GitHub, ask someone to open the issue for you. The project's one email address is for conduct reports only (see the [Code of Conduct](CODE_OF_CONDUCT.md)), not for accessibility barriers.

Please do not put details about Families, passwords or screenshots of the live site in a public issue (see the [Code of Conduct](CODE_OF_CONDUCT.md)).

The project is maintained by one volunteer, so this is an aim and not a guarantee: an acknowledgement within 7 days.

## Keeping this file true

This file goes stale if screens change and it does not. A pull request that changes a screen says whether this file is still true ([the pull request template](.github/pull_request_template.md)). When one of the gaps above is closed, move it to the first list and say how it is checked.
