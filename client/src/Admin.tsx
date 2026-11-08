import { useEffect, useState } from "preact/hooks";
import type { AuditEntry } from "../../server/audit.js";
import type { ShiftSummary } from "../../server/summary.js";
import { api } from "./api.js";
import { isoDate } from "./state.js";
import type { Identity, Shift } from "./types.js";

function errorText(failure: unknown): string {
  return failure instanceof Error ? failure.message : "That did not work";
}

export function Admin(props: { identity: Identity }) {
  const [activityVersion, setActivityVersion] = useState(0);
  const refreshActivity = () => setActivityVersion((version) => version + 1);

  return (
    <div class="columns">
      <Reports onChanged={refreshActivity} />
      <Accounts identity={props.identity} onChanged={refreshActivity} />
      <Activity version={activityVersion} />
    </div>
  );
}

interface Report {
  shifts: (Shift & { summary: ShiftSummary })[];
  totals: ShiftSummary;
}

function Reports(props: { onChanged: () => void }) {
  // Initializers run once, so the dates are read on the first render only.
  const [from, setFrom] = useState(() => {
    const today = new Date();
    return isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      setReport(await api<Report>("GET", `/api/admin/reports/totals?from=${from}&to=${to}`));
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  async function change(url: string) {
    setError("");
    try {
      await api("POST", url);
      await load();
      props.onChanged();
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  const range = `from=${from}&to=${to}`;
  return (
    <section class="panel">
      <h2>Shifts and reports</h2>
      <div class="row end">
        <label>
          From
          <input type="date" value={from} onInput={(e) => setFrom(e.currentTarget.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onInput={(e) => setTo(e.currentTarget.value)} />
        </label>
        <button class="primary" onClick={load}>
          Show totals
        </button>
      </div>
      {error && <p class="error">{error}</p>}
      {report && (
        <>
          <p class="report-combined">
            <strong>All shifts in range:</strong> {report.totals.families.total}{" "}
            {report.totals.families.total === 1 ? "family" : "families"} ·{" "}
            {report.totals.weight.total} lb · {report.totals.returnedWeight} lb returned ·{" "}
            {report.totals.netWeight} lb net · {report.totals.tefapBags} TEFAP bags ·{" "}
            {report.totals.seniorBoxes} senior boxes · {report.totals.cheese} cheese ·{" "}
            {report.totals.families.left} left without food
          </p>
          {report.shifts.length === 0 && <p class="notice">No shifts in that range.</p>}
          <ul class="cards">
            {report.shifts.map((shift) => (
              <li key={shift.id}>
                <span>
                  <strong>{shift.date}</strong> · {shift.summary.families.total} families ·{" "}
                  {shift.summary.netWeight} lb net
                  <span class="status">{shift.status}</span>
                </span>
                {shift.status === "closed" ? (
                  <button onClick={() => change(`/api/admin/shifts/${shift.id}/reopen`)}>
                    Reopen
                  </button>
                ) : (
                  <button onClick={() => change(`/api/shifts/${shift.id}/close`)}>Close</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <div class="choices">
        <a class="button" href={`/api/admin/reports/shifts.csv?${range}`} download>
          Download shift totals (CSV)
        </a>
        <a class="button" href={`/api/admin/reports/cards.csv?${range}`} download>
          Download cards (CSV)
        </a>
      </div>
    </section>
  );
}

function Accounts(props: { identity: Identity; onChanged: () => void }) {
  const [accounts, setAccounts] = useState<Identity[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function load() {
    setAccounts(await api<Identity[]>("GET", "/api/admin/accounts"));
  }

  useEffect(() => {
    load().catch((failure) => setError(errorText(failure)));
  }, []);

  async function addAdmin(event: Event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api("POST", "/api/admin/accounts", { username, password });
      setUsername("");
      setPassword("");
      await load();
      props.onChanged();
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  return (
    <section class="panel">
      <h2>Accounts</h2>
      {message && <p class="success">{message}</p>}
      {error && <p class="error">{error}</p>}
      <ul class="cards">
        {accounts.map((account) => (
          <AccountRow
            key={account.username}
            account={account}
            isSelf={account.username === props.identity.username}
            onError={setError}
            onPasswordChanged={() => {
              setError("");
              setMessage(`Password changed for ${account.username}`);
              props.onChanged();
            }}
            onRemoved={async () => {
              setError("");
              await load();
              props.onChanged();
            }}
          />
        ))}
      </ul>
      <form class="stack" onSubmit={addAdmin}>
        <div class="row">
          <label>
            Username
            <input
              required
              autocomplete="off"
              autocapitalize="off"
              value={username}
              onInput={(e) => setUsername(e.currentTarget.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={10}
              autocomplete="new-password"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
        </div>
        <button type="submit">Add admin</button>
      </form>
    </section>
  );
}

function AccountRow(props: {
  account: Identity;
  isSelf: boolean;
  onError: (message: string) => void;
  onPasswordChanged: () => void;
  onRemoved: () => Promise<void>;
}) {
  const { account, isSelf, onError, onPasswordChanged, onRemoved } = props;
  const [changing, setChanging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [password, setPassword] = useState("");

  async function savePassword(event: Event) {
    event.preventDefault();
    try {
      await api("PUT", `/api/admin/accounts/${encodeURIComponent(account.username)}/password`, {
        password,
      });
      setPassword("");
      setChanging(false);
      onPasswordChanged();
    } catch (failure) {
      onError(errorText(failure));
    }
  }

  async function remove() {
    try {
      await api("DELETE", `/api/admin/accounts/${encodeURIComponent(account.username)}`);
      await onRemoved();
    } catch (failure) {
      onError(errorText(failure));
    }
  }

  return (
    <li class="account">
      <span>
        <strong>{account.username}</strong> <span class="status">{account.role}</span>
      </span>
      <span class="choices">
        <button onClick={() => setChanging(!changing)}>Change password</button>
        {account.role === "admin" && !isSelf && !confirmRemove && (
          <button onClick={() => setConfirmRemove(true)}>Remove</button>
        )}
        {confirmRemove && (
          <>
            <button onClick={remove}>Yes, remove</button>
            <button onClick={() => setConfirmRemove(false)}>Cancel</button>
          </>
        )}
      </span>
      {changing && (
        <form class="row end full" onSubmit={savePassword}>
          <label>
            New password
            <input
              type="password"
              required
              minLength={10}
              autocomplete="new-password"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
          <button type="submit">Save password</button>
        </form>
      )}
    </li>
  );
}

function Activity(props: { version: number }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<AuditEntry[]>("GET", "/api/admin/audit")
      .then(setEntries)
      .catch((failure) => setError(errorText(failure)));
  }, [props.version]);

  return (
    <section class="panel">
      <h2>Recent activity</h2>
      {error && <p class="error">{error}</p>}
      <ul class="activity">
        {entries.map((entry) => (
          <li key={entry.id}>
            <time>{new Date(entry.at).toLocaleString()}</time> <strong>{entry.actor}</strong>{" "}
            {entry.action} <code>{entry.detail}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}
