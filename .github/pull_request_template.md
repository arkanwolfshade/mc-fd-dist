## What and why

<!-- What does this change, and why? Link the issue if there is one, for example "Closes #123". -->

## How it was checked

<!-- The commands you ran and what you saw. For a bug fix, say that the test failed before the fix. -->

## Checklist

- [ ] One logical change, with a [Conventional Commit](https://www.conventionalcommits.org/) title, such as `fix: correct TEFAP count at nine people`
- [ ] A test was written first and seen to fail for the expected reason
- [ ] `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm run test:coverage` pass, and so does `npm run test:e2e` if a screen changed
- [ ] An [architecture decision record](https://github.com/arkanwolfshade/mc-fd-dist/blob/main/docs/adr/README.md) is included if the change is hard to undo or affects several parts of the system
- [ ] If a screen changed: the guides and screenshots are updated, and [ACCESSIBILITY.md](https://github.com/arkanwolfshade/mc-fd-dist/blob/main/ACCESSIBILITY.md) is still true
- [ ] No personal details about Families or volunteers, no secrets and no database files
- [ ] Commits are signed, and the pull request will be merged with **Squash and merge**
