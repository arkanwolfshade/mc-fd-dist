# 0038. Show help popouts taken from the guides

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

In-app help was a separate Help tab showing the user guides (ADR 0018). A volunteer who is unsure about one field during a shift has to leave the form to look it up (issue #62). The stations run on phones and tablets (ADR 0031), where there is no hover, and keep working without a connection (ADR 0014). The maintainer chose help on the tricky station fields and the Admin panels, taken from the guides, shown as a popover opened by an always-visible button.

## Decision

- **Where:** a **?** button beside **Card #**, **Info from** and the **Senior Box** and **Cheese** choices on the front desk; on the **Queue** and **Finish** headings on distribution; and on the three Admin panels. The Wall display and Totals have none. Cart weights and extras share the Queue's button, because those fields repeat on every confirmed card.
- **Text:** the guides are the only source. A guide line ending in `<!-- help:key -->` belongs to the popout of that name. The comment is invisible on GitHub, and the Help tab and PDFs drop it. The build turns the marked lines into HTML (`file.md?help`), so the text is in the app and works offline.
- **Popover:** the browser's own `popover` attribute. It handles opening, closing with Escape or a tap outside, and returning focus, with no script of ours. Before iOS 18.3 a tap outside does not close it (WebKit bug 267688), so each card has a **Close** button, which takes focus when the card opens. A browser without popovers (before iOS 17) shows no **?** and no text.
- **Names:** each button is named "Help: " and a title. A title must not contain another control's name, so that the controls stay distinct to screen readers and to the tests.
- **Kept short:** `tools/help-topics.test.ts` fails if a popout has no text, shows a picture or a table, is longer than 700 characters, or if a guide marks a popout the app does not have.

## Alternatives considered

- **New short text in the app:** quicker to read, but a second copy of the guides' rules that would drift from them.
- **Text that opens in place under the field:** never covers anything, but moves the form while it is being filled in.
- **A "show help" switch:** cleaner screens, but a new volunteer would have to find it first.
- **One button for each panel:** fewer buttons, longer and vaguer text.
- **A tooltip or popover library:** more code and a dependency for what the browser does.

## Consequences

- A change to a marked guide line changes the app. A guide edit therefore needs a release to reach the stations, and the marked sentences must read well on their own.
- Five buttons are added to the station screens and three to Admin, each at least 48 px, which takes room on a phone.
- An open popout covers the screen behind it until it is closed. Nothing typed is lost.
- The browser tests cover opening, closing and focus in emulated browsers. Real iPhones and iPads are on the device checklist in the operations runbook.

## Amendment, 2026-11-26

On the front desk the **?** now sits on the field's name line, right after the name ("Card #  ?", "Intake operator  ?", "For seniors  ?"), because a design review found the buttons too far from what they explain. Each name is its own element, tied to its field by `for` or `aria-labelledby`, so the field's accessible name is unchanged and the ? is still outside it. The ? is a 48 px target drawn as a 32 px circle, so the name line stays light. The Senior Box and Cheese pair gained the name **For seniors** to carry it. The `info-from` popout is now titled "Whose initials to enter".
