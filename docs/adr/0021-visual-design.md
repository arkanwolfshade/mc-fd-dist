# 0021. Give the screens a quiet design with the card number as a ticket

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

A usability review found that almost everything on the screens had the same visual weight. The family's card number, the one thing that ties a person in line to their row, was the least visible text. Distribution had to dig through a dense line to find what to hand over. Text was small for a tablet at arm's length, and the volunteers are of mixed ages. The developer reviewed a mock-up of a new direction, published as a private claude.ai page, and asked for it to be built into the app.

## Decision

- **One bold element:** The card number is drawn as a canary-yellow claim-check ticket, the one strong color on every screen. Rows, queue cards, the closing warning and the save confirmation all lead with it.
- **Everything else quiet:** Sage-grey paper, white work surfaces, deep green-black ink, and green for actions and good states. Red is kept for problems and corrections.
- **Type:** Atkinson Hyperlegible Next for text and Atkinson Hyperlegible Mono for numbers, both designed by the Braille Institute for readers with low vision. They are bundled from the Fontsource packages, under the SIL Open Font License, so they work offline and within the content security policy. Text starts at 18px.
- **Screens:**
  - The header names the station and the day in words and shows whether it is connected. Sign out is a small link.
  - The front desk shows the next card number as a ticket, names it on the Save button, and confirms each saved card.
  - Card rows put the ticket, the family, a status word with a mark, and actions in fixed columns.
  - Distribution's cards list what to give on their own line.
  - Totals read like the tally on the paper sheet, each figure written on its line.
- **Words:** Statuses read Waiting, Called back, Confirmed, Distributed and Left without food. "Distributed" stays, because it is the paper sheet's word.

## Alternatives considered

- **Keep the generic look and fix only the worst problems:** Less work, but it would leave every element at the same weight, which was the review's main finding.
- **Load the fonts from Google Fonts:** Simpler, but blocked by the app's content security policy, and unavailable offline.
- **System fonts only:** No extra download, but legibility would vary from device to device.

## Consequences

- Card numbers can be matched to people in line at a glance, and distribution sees what to hand over first.
- The bundled fonts are eight WOFF2 files totalling 88 KB on disk. A browser fetches only the character sets a page uses, about 56 KB for English text, and caches them.
- Tests now find cards by their ticket number, not by "#1" text.
- The admin, sign-in and help screens use the same tokens but were not redesigned. Phone-size layouts follow the same rules but still need checking on real devices.
