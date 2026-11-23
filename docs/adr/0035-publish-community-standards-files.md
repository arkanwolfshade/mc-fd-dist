# 0035. Publish a Code of Conduct, issue forms and an accessibility commitment

- **Status:** Accepted
- **Date:** 2026-11-23
- **Amended:** 2026-11-23, the same day, to correct the route for conduct reports (see Alternatives considered).

## Context

GitHub's community profile listed this public repository as missing a Code of Conduct, an issue template and a pull request template. The maintainer also wanted a public accessibility commitment, which GitHub does not check for.

Three facts about the project shape what these files can say:

- It is maintained by one volunteer, so there is nobody to receive a report about the maintainer, and a response time can only be an aim.
- It is public, while the food bank's Families are anonymous on purpose (ADR 0002, 0024). Anything written in an issue is public, so the forms must stop people posting Family details, passwords or screenshots of the live site.
- Staff and volunteers mostly do not use GitHub.

## Decision

- **Code of Conduct:** the Contributor Covenant 2.1, adapted in four places: a line in the unacceptable behavior about details of Families and volunteers and live-site data; a statement that the project has one community leader; a scope limited to this repository; and a reporting section that names the project's conduct address and GitHub Support. The Covenant's attribution paragraph is kept as published. A short note says how the enforcement ladder works on GitHub, which has no private messages.
- **Reports go to a project-only email alias:** `mc-gh.um8sm@simplelogin.com`, made for this project, which forwards to the maintainer and can be switched off if it attracts spam. GitHub Support is named for anything about the maintainer. **Report content** is mentioned, with a warning that on a repository owned by a person it reaches GitHub and not the maintainer. The alias is only for conduct reports, and not for accessibility barriers.
- **Three issue forms, and no blank issues:** a bug report, a change request and an accessibility barrier, each in plain words and each starting with a warning not to post private details, with a required tick box. The accessibility form asks about the person's device and assistive technology and does not ask for steps to reproduce. The chooser links to private vulnerability reporting and to the conduct reporting section.
- **A pull request template** that mirrors the checklist in `CONTRIBUTING.md`, with a line asking whether a screen change leaves `ACCESSIBILITY.md` true. It does not affect the history: squash merges take the commit messages, not the pull request description.
- **An accessibility file:** `ACCESSIBILITY.md` states an aim of WCAG 2.2 level AA with no conformance claim, because nothing has been audited. It lists what the browser tests check and, as plainly, what has not been checked: no real screen reader, no scanner, no full keyboard test, no measured contrast, untried real devices, unchecked PDFs. It asks for reports through the accessibility form and aims to acknowledge one within 7 days.

## Alternatives considered

- **GitHub only, with no address (the first version of this decision):** it relied on GitHub's Reported content setting to bring reports to the maintainer. GitHub's documentation says that setting is available only for repositories owned by an organization, and this one belongs to a person, so those reports would never have reached the maintainer. That premise was not checked before the file was merged, and it was found the same day.
- **The private security advisory form:** it reaches only the maintainer, but it is built for vulnerabilities, so conduct reports would be mixed in with them.
- **Move the repository to an organization:** it makes Reported content available, but every repository address, ruleset, app and workflow refers to this account, so it is not worth doing for this alone.
- **Publish the maintainer's own address:** simplest, but it is public for good and tied to the person, so a project-only alias was used instead.
- **A short Code of Conduct of our own:** easier to read, but it has no track record and leaves gaps, such as how a ban works.
- **Fewer issue forms:** one combined form asks neither a defect nor a request the right questions, and a bug form asks an accessibility reporter for steps to reproduce, which they rarely have.
- **Claim partial conformance with WCAG 2.2 AA:** it needs an evaluation, which has not been done.

## Consequences

- The alias is public for good, in the Code of Conduct and in the history, and will draw spam. If it is switched off, the Code of Conduct and the issue chooser must be changed to name another route, or reports will go nowhere.
- A report made only with **Report content** never reaches the maintainer, and the file says so.
- A reporter who has no email, or whose report is about the maintainer, has only GitHub's tools.
- The accessibility file goes stale if a screen changes and it does not, which is why the pull request template and `CONTRIBUTING.md` ask about it. The gaps in it should be closed or kept up to date, not left.
- The Covenant's text is used under the attribution the text itself asks for. The site and its repository did not state a license for the text when this was written (the repository's own license file covers its code), so the terms were not confirmed. Check them if the file is ever redistributed.
- The three forms have not been tried by a real person. The first real report will show whether the questions work.
