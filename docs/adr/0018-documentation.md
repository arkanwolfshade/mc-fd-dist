# 0018. Write the guides and developer docs once, in HADS Markdown

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Volunteers need guides they can follow during a shift, staff need a runbook, and developers need to understand the system. Guides go stale quickly when screens change, and volunteers will not read Markdown on GitHub. Most volunteers are likely to read English, and some may prefer Spanish.

## Decision

- **Format:** Guides and developer docs follow HADS 1.0.0, the Human-AI Document Standard: Markdown with a version line, an AI reading instruction, and `[SPEC]`, `[NOTE]`, `[BUG]` and `[?]` blocks.
- **One source, three outputs:** The same Markdown is read on GitHub, shown in the app's Help tab, and printed as PDFs. For the Help tab and PDFs, the reading instruction and block tags are removed, and `[BUG]` blocks read as "Problem, What you see, Why, What to do".
- **Help tab:** Each station sees its own guide, and admins see all of them. Guides are converted at build time and their pictures bundled, so help works offline and the browser needs no Markdown code.
- **Printing:** `npm run docs:pdf` builds US Letter PDFs: a full guide and a one-page quick card per station. A quick card that runs past one page fails the build. CI keeps the latest PDFs as a build artifact.
- **Screenshots:** `npm run docs:screenshots` takes them from the real app, with made-up data, a fixed date and tablet size (1280×800), so they can be retaken whenever the screens change.
- **Languages:** English now, in `docs/guides/en/`, so that a Spanish edition can sit beside it later.
- **Checks:** CI checks the HADS format, every link and picture, and that every screenshot is used. The checker is our own (`tools/hads.ts`), based on the specification.

## Alternatives considered

- **Markdown on GitHub only:** The least work, but volunteers would need a link and a device, and the HADS tags would show.
- **A separate help site or wiki:** Another thing to host and keep in step with the code.
- **Hand-made screenshots:** Quicker at first, but they go stale silently.
- **The HADS reference validator:** It is a Python script from outside the project, and it skips the symptom and fix check for titled `[BUG]` blocks. Writing our own checker kept outside code from running on developer machines and in CI.

## Consequences

- One edit updates GitHub, the Help tab and the printouts, but printed copies at the food bank still need reprinting.
- Screens and guides can still drift apart, because nothing compares a guide's wording with the screen. Retake screenshots and reread the guides whenever a screen changes.
- The Help tab adds about 400 KB of pictures to the app, cached for offline use.
- A Spanish edition needs translation by a fluent speaker at the food bank, and every later change made twice.
