# 0007. Use shared role logins and named admin accounts

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Access controls are required on a hosted system. Volunteers rotate, the data holds no names (see 0002), and login delays would slow a busy shift. Dedicated food bank devices will stay at each station.

## Decision

Use one shared login per station role (front desk, distribution), kept signed in on station devices. Staff who see reports and manage settings have individual admin accounts with shorter sessions. Permissions are enforced on the server. An audit log records the station or admin behind each change.

## Alternatives considered

- **Individual accounts for all volunteers:** Full accountability, but account setup for each person, and login delays.
- **Shift PIN or code:** Quick, with access that lapses automatically, but a custom security design.
- **Google sign-in:** No passwords to manage, but every volunteer needs a Google account on a maintained list.

## Consequences

Fast to use and easy for rotating volunteers. Entries are attributed to a station, not a person, and a leaked role password must be changed for everyone. Changing it must end that role's existing sessions. Personal devices are backup only and must sign out afterward.
