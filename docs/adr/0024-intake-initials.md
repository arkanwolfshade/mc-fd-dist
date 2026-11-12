# 0024. Record the intake volunteer's initials on each walk-in card

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Up to three volunteers at the intake computers take each Family's details. The front desk's radio person collects those details from one of them, then enters the card. The food bank asked for each card to record which intake volunteer the details came from.

An earlier reading of the request took it as a per-shift record of who worked intake, entered once at close. That was a misunderstanding: the food bank wants the source of each card's details.

The project's standing rule is that no personal data is added without a decision record (`CONTRIBUTING.md`). Families stay anonymous (ADR 0002). Initials identify volunteers, not Families, but they are still personal data.

## Decision

- **What is stored:** The initials of the intake volunteer whose details the radio person took for the card. Initials are 2 to 4 letters and are stored in capitals. No names are stored.
- **Where it is entered:** In an **Info from** field on the Front Desk's new-card form, as each card is entered. Initials already used on this shift's cards appear as quick buttons, and a text box takes new ones.
- **Required for walk-in cards:** The server refuses a front-desk card without valid initials. The error reads "Choose who the Family's details came from."
- **Not for partner cards:** Door Dash and Helping Hands cards carry none (ADR 0023). Cards entered before this change have none either.
- **Where it shows:** On Distribution's queue card ("Info from AB"), and in the cards CSV as `intake_initials`.

## Alternatives considered

- **Record intake volunteers once per shift, on Admin at close:** Rejected. The information belongs to each card, not to the shift, and this design came from misreading the request.
- **Keep the last initials for the next card:** Faster to enter, but a card could silently get the wrong volunteer's initials when the radio person switches between them.
- **Make the field optional:** Fewer blocked saves, but the record would have gaps the food bank could not tell apart from mistakes.
- **Full names:** Clearer to read, but more personal data than the food bank needs. Initials are enough among three volunteers on a shift.

## Consequences

- Each walk-in card can be traced to the intake volunteer who gave its details, without recording who the Family is.
- The app now holds a small amount of personal data about volunteers. It is kept as long as the cards are, and appears in backups and CSV exports.
- Queued cards keep the initials unencrypted in `localStorage` during a dropout. ADR 0014 accepted that because cards held no personal data. *Assumed:* initials alone are low enough risk to keep that arrangement. Revisit it if more personal data is added.
- Two volunteers with the same initials on one shift cannot be told apart. They can add a letter, since up to four are allowed.
- Any further personal data, such as names, still needs a new decision record.
