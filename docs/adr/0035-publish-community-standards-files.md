# 0035. Publish a Code of Conduct, issue forms and an accessibility commitment

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

GitHub's community profile listed this public repository as missing a Code of Conduct, an issue template and a pull request template. The maintainer also wanted a public accessibility commitment, which GitHub does not check for.

Three facts about the project shape what these files can say:

- It is maintained by one volunteer, so there is nobody to receive a report about the maintainer, and a response time can only be an aim.
- It is public, while the food bank's Families are anonymous on purpose (ADR 0002, 0024). Anything written in an issue is public, so the forms must stop people posting Family details, passwords or screenshots of the live site.
- Staff and volunteers mostly do not use GitHub.

## Decision

- **Code of Conduct:** the Contributor Covenant 2.1, adapted in four places: a line in the unacceptable behavior about details of Families and volunteers and live-site data; a statement that the project has one community leader; a scope limited to this repository; and a reporting section that names GitHub's own tools, since the project publishes no email address. The Covenant's attribution paragraph is kept as published. A short note says how the enforcement ladder works on GitHub, which has no private messages.
- **Reports go through GitHub only:** **Report content** on the comment or issue, which reaches the maintainer only while the repository's **Reported content** setting is on, and GitHub Support for anything about the maintainer. The file says plainly that there is no private direct line. The maintainer keeps that setting on.
- **Three issue forms, and no blank issues:** a bug report, a change request and an accessibility barrier, each in plain words and each starting with a warning not to post private details, with a required tick box. The accessibility form asks about the person's device and assistive technology and does not ask for steps to reproduce. The chooser links to private vulnerability reporting and to the conduct reporting section.
- **A pull request template** that mirrors the checklist in `CONTRIBUTING.md`, with a line asking whether a screen change leaves `ACCESSIBILITY.md` true. It does not affect the history: squash merges take the commit messages, not the pull request description.
- **An accessibility file:** `ACCESSIBILITY.md` states an aim of WCAG 2.2 level AA with no conformance claim, because nothing has been audited. It lists what the browser tests check and, as plainly, what has not been checked: no real screen reader, no scanner, no full keyboard test, no measured contrast, untried real devices, unchecked PDFs. It asks for reports through the accessibility form and aims to acknowledge one within 7 days.

## Alternatives considered

- **Publish an email address for conduct reports:** it gives a reporter a private route, but it is public for good and collects spam. A project-only alias was offered and not chosen.
- **A short Code of Conduct of our own:** easier to read, but it has no track record and leaves gaps, such as how a ban works.
- **Fewer issue forms:** one combined form asks neither a defect nor a request the right questions, and a bug form asks an accessibility reporter for steps to reproduce, which they rarely have.
- **Claim partial conformance with WCAG 2.2 AA:** it needs an evaluation, which has not been done.

## Consequences

- The Code of Conduct's reporting route depends on **Reported content** staying on. Check `content_reports_enabled` in `gh api repos/arkanwolfshade/mc-fd-dist/community/profile`.
- A reporter who wants a private conversation has none, apart from GitHub's tools.
- The accessibility file goes stale if a screen changes and it does not, which is why the pull request template and `CONTRIBUTING.md` ask about it. The gaps in it should be closed or kept up to date, not left.
- The Covenant's text is used under the attribution the text itself asks for. The site and its repository did not state a license for the text when this was written (the repository's own license file covers its code), so the terms were not confirmed. Check them if the file is ever redistributed.
- The three forms have not been tried by a real person. The first real report will show whether the questions work.
