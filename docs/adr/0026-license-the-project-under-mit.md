# 0026. License the project under MIT

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

The repository is public but had no license. Under default copyright law that means anyone may read it and nobody may use, copy or change it. The maintainer wants other food banks and volunteer developers to be able to reuse the app.

An analysis of the dependencies on 2026-11-13 found 225 installed packages and none under a copyleft license (GPL, LGPL or AGPL). The 98 packages that ship in the app are all permissive: 79 MIT, 9 ISC, 6 BlueOak-1.0.0 and 4 BSD-3-Clause. Three licenses are worth knowing about:

- **OFL-1.1:** the two Atkinson Hyperlegible font packages, which are bundled into the client. The license allows that, but its text and copyright notice must accompany the fonts.
- **MPL-2.0:** `lightningcss`, a build tool that is not shipped. It matters only to someone who modifies and distributes that tool's own files.
- **CC-BY-4.0:** `caniuse-lite`, data used at build time and not shipped. It asks for attribution.

The dependencies allow MIT, GPL-3.0 and AGPL-3.0 alike, so the choice rests on what the maintainer wants. The analysis also showed that the built client carried no license text for Preact or the fonts, which their licenses require, whichever license this project uses.

## Decision

- **License:** MIT, for everything in the repository: the code, the guides, the screenshots and the icons. Third-party material keeps its own license. The text is in `LICENSE`, and `package.json`, the container image's `org.opencontainers.image.licenses` label and the README say so.
- **Holder:** the maintainer. The copyright line reads "Copyright (c) 2026 arkanwolfshade and contributors", using the GitHub handle and not a legal name. The maintainer decided not to ask the food bank for a sign-off. None was obtained, and this record does not claim one.
- **Contributions:** `CONTRIBUTING.md` says contributions are licensed under the project's MIT license. There is no contributor license agreement and no sign-off line on commits.
- **Notices:** the client build generates `third-party-notices.txt` from the license files of the packages that are in the bundle, including the two fonts, and the app serves it at `/third-party-notices.txt`.
- **Dependency check:** CI runs `npm run licenses:check`, which fails on a package whose license is not on an allowlist. Two dev-only packages are named exceptions: `lightningcss` (MPL-2.0) and `caniuse-lite` (CC-BY-4.0).

## Alternatives considered

- **GPL-3.0:** Anyone who distributes a modified copy must share their changes. A modified copy run as a website is not distribution, so it protects little for a web app, and some organizations avoid it.
- **AGPL-3.0:** Covers modified copies run as a service, but many organizations refuse AGPL software outright, which would cut against other food banks adopting the app.
- **Apache-2.0:** Adds a patent grant and an explicit trademark exclusion. Longer, with a NOTICE file to keep, and not needed for a small tool whose dependencies are mostly MIT.
- **BSD-3-Clause:** Adds a clause against using the maintainer's or the food bank's name to endorse derived products. Less common among JavaScript projects than MIT.
- **A separate license for the guides (CC BY 4.0):** The conventional split, but MIT already covers documentation files and a second license would be one more thing to explain.
- **No license:** The previous state. Nobody could lawfully reuse the code.

## Consequences

- Anyone may use, change and sell the app, including in closed-source products, as long as the copyright notice stays.
- The grant cannot be withdrawn for copies already obtained. A later release could use other terms, but the MIT copies remain MIT.
- MIT says nothing about the food bank's name or marks, so using this license does not give anyone rights to them.
- Much of the code was written with an AI assistant. How far copyright applies to AI-assisted work is unsettled in some countries, so the license covers whatever rights the contributors hold.
- Without a sign-off, if the food bank were ever to claim rights in the work, the maintainer would need to resolve that.
- A Dependabot update can change a package's license, which is why the check runs in CI. Adding a copyleft dependency will fail it and need a decision.
- The notices file depends on the Vite plugin that generates it. If the build stops producing it, the end-to-end test fails.
