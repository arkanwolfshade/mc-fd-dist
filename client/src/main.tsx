import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api } from "./api.js";
import type { Identity } from "./types.js";
import { Login } from "./Login.js";
import { Station } from "./Station.js";
import "./styles.css";

function App() {
  const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);

  useEffect(() => {
    api<Identity>("GET", "/api/me")
      .then(setIdentity)
      .catch(() => setIdentity(null));
  }, []);

  if (identity === undefined) {
    return <p class="notice">Loading…</p>;
  }
  if (identity === null) {
    return <Login onSignedIn={setIdentity} />;
  }
  return <Station identity={identity} onSignedOut={() => setIdentity(null)} />;
}

render(<App />, document.getElementById("app") as HTMLElement);
