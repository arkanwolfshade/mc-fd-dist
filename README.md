# mc-fd-dist

Shift tracker for the food bank. It replaces the printed MC-FD (front desk) and MC-Dist (distribution) sheets with a web app that shares one live record between the two stations, stores it permanently, and produces reports.

The project is in early development and is not yet in use.

## Documentation

For volunteers and staff, in the app's Help tab and as printable PDFs (`npm run docs:pdf`):

- [Getting started](docs/guides/en/getting-started.md)
- [Front desk guide](docs/guides/en/front-desk.md) and [quick card](docs/guides/en/front-desk-card.md)
- [Distribution guide](docs/guides/en/distribution.md) and [quick card](docs/guides/en/distribution-card.md)
- [Admin guide](docs/guides/en/admin.md)

For developers and the maintainer:

- [Architecture](docs/developer/architecture.md): how the system is built
- [Development](docs/developer/development.md): setup, commands, CI and known pitfalls
- [Operations runbook](docs/developer/operations.md): deploying, updating, backups, restoring and handoff
- [Project plan](docs/project-plan.md): requirements, data model, build order and open questions
- [Architecture decision records](docs/adr/README.md): why the system is built this way
- [Contributing](CONTRIBUTING.md): how changes are made
- [Security policy](SECURITY.md): how to report a vulnerability

## Development

Requires Node.js 26.13.0 or later, the current LTS release.

```sh
npm install
npm test
npm run typecheck
```

End-to-end tests drive real browser sessions against a real server. Each test gets its own server and in-memory database. Install the browser once, then run them:

```sh
npx playwright install chromium
npm run test:e2e
```

To run the server locally over plain HTTP, create an account and start it with secure cookies turned off:

```sh
npm run account -- pat admin
COOKIE_SECURE=false npm run dev
npm run dev:client   # in a second terminal, then open the address it prints
```

For a production build, run `npm run build` and then `npm start`. The server also serves the client from `dist/client`.

`GET /api/health` answers without signing in, for uptime monitoring. It returns 503 if the database cannot be read.

Backups are made with SQLite's backup method, which is safe while the server runs, and each one is checked before it is kept. After a build:

```sh
node dist/server/cli/backup.js create backup.db    # write a verified backup
node dist/server/cli/backup.js check backup.db     # verify one and show what it holds
node dist/server/cli/backup.js restore backup.db   # replace the database (stop the server first)
```

A restore keeps the previous database beside the new one, so that restoring the wrong backup can be undone.

The service worker that makes the app installable and available offline only runs in production builds, and browsers only allow it over HTTPS or on localhost. Stations keep working through a connection dropout by holding entries on the device, as described in [ADR 0014](docs/adr/0014-keep-working-through-dropouts.md).

To regenerate the app icons, run `node scripts/generate-icons.mjs`.

To show the app to someone, run `npm run demo`. It walks through one shift in two windows, side by side, using made-up data in a temporary database. `DEMO_STEP_SECONDS` sets the shortest time each step is shown (default 4).

The server reads these environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_PATH` | `data/mc-fd-dist.db` | Location of the SQLite database |
| `PORT` | `3000` | Port to listen on |
| `HOST` | `127.0.0.1` | Address to listen on |
| `COOKIE_SECURE` | `true` | Set to `false` only for local HTTP development |
| `CLIENT_DIR` | `dist/client` | Location of the built client |
| `TIME_ZONE` | `America/Phoenix` | The food bank's time zone, used to close old shifts overnight |
| `TRUST_PROXY` | `false` | Set to `true` behind the HTTPS proxy, so that login limits see the real client address |

## License

MIT, for the code, the guides and the pictures alike: see [LICENSE](LICENSE). The licenses of the libraries and fonts the app ships are collected in `/third-party-notices.txt`, served by the app itself ([ADR 0026](docs/adr/0026-license-the-project-under-mit.md)).
