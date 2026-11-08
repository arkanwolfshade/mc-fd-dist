# Security policy

This app records food bank shifts. It holds no names, addresses or other personal details: a card number is an anonymous same-day ticket (see [ADR 0002](docs/adr/0002-anonymous-same-day-tickets.md)). It does hold station and admin passwords as Argon2 hashes, shift records, and an activity log.

## Supported versions

Only the current `main` branch, and the image published from it, receive security fixes. There are no release branches.

## Reporting a vulnerability

Please report security problems privately through GitHub's [private vulnerability reporting](https://github.com/arkanwolfshade/mc-fd-dist/security/advisories/new) for this repository. Do not open a public issue, pull request or discussion about a vulnerability before it is fixed.

A useful report includes:

- what is affected, such as a screen, an API route, the container or the AWS set-up;
- how to reproduce it, step by step;
- what an attacker could do with it;
- any fix you suggest.

## What to expect

The project is maintained by one volunteer, so these are aims rather than guarantees:

- an acknowledgement within 7 days;
- an assessment, and a plan or a reason for declining, within 30 days;
- credit in the advisory when it is published, unless you would rather not be named.

If a problem is being exploited, the maintainer may take the app offline and have the food bank run shifts on paper while it is fixed.

## Scope

In scope:

- the app's code in this repository, including the server, the screens and the offline queue;
- the container image published from this repository;
- the deployment and backup scripts and the AWS template in `deploy/`.

Out of scope:

- denial-of-service or load testing against the live site;
- social engineering of food bank staff or volunteers, or physical access to station devices;
- problems in third-party services, such as AWS or GitHub, which should be reported to them;
- findings that need a station's or an admin's password.

## Testing

Test against your own copy of the app (see the [README](README.md)), never the food bank's live site. The live site runs real shifts, and its data belongs to the food bank.

## How the project looks after security

- **Code and dependencies:** CI scans every change, its dependencies, the container image and the infrastructure template, and runs a dynamic scan against the running app (see [ADR 0016](docs/adr/0016-code-health-checks.md)).
- **Updates:** Dependabot proposes dependency updates weekly.
- **Hosting:** The server applies security updates automatically each night (see [ADR 0015](docs/adr/0015-deployment-and-backups.md)).
