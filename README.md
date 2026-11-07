# mc-fd-dist

Shift tracker for the food bank. It replaces the printed MC-FD (front desk) and MC-Dist (distribution) sheets with a web app that shares one live record between the two stations, stores it permanently, and produces reports.

The project is in early development and is not yet in use.

## Documentation

- [Project plan](docs/project-plan.md): requirements, data model, build order and open questions
- [Architecture decision records](docs/adr/README.md): why the system is built this way
- [Contributing](CONTRIBUTING.md): how changes are made

## Development

Requires Node.js 24.22.1 or later, which includes a security fix.

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

The service worker that makes the app installable and available offline only runs in production builds, and browsers only allow it over HTTPS or on localhost. Stations keep working through a connection dropout by holding entries on the device, as described in [ADR 0014](docs/adr/0014-keep-working-through-dropouts.md).

To regenerate the app icons, run `node scripts/generate-icons.mjs`.

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
