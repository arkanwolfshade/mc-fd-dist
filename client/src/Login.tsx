import { useState } from "preact/hooks";
import { api } from "./api.js";
import type { Identity } from "./types.js";

export function Login(props: { onSignedIn: (identity: Identity) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: Event) {
    event.preventDefault();
    setError("");
    try {
      props.onSignedIn(await api<Identity>("POST", "/api/login", { username, password }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not sign in");
    }
  }

  return (
    <form class="login panel" onSubmit={submit}>
      <h1>Shift tracker</h1>
      <label>
        Username
        <input
          value={username}
          autocomplete="username"
          autocapitalize="off"
          required
          onInput={(e) => setUsername(e.currentTarget.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          autocomplete="current-password"
          required
          onInput={(e) => setPassword(e.currentTarget.value)}
        />
      </label>
      {error && <p class="error">{error}</p>}
      <button class="primary" type="submit">
        Sign in
      </button>
    </form>
  );
}
