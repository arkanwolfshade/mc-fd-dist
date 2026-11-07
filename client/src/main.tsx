import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ApiError, api } from "./api.js";
import type { Identity } from "./types.js";
import { Login } from "./Login.js";
import { Station } from "./Station.js";
import "./styles.css";

const IDENTITY_KEY = "identity";

// Only the username and role are kept, so that a reload during an outage can still
// show the station. The session itself stays in its protected cookie.
function cachedIdentity(): Identity | null {
  try {
    return JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? "null") as Identity | null;
  } catch {
    return null;
  }
}

function App() {
  const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);

  function signedIn(account: Identity) {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(account));
    setIdentity(account);
  }

  function signedOut() {
    localStorage.removeItem(IDENTITY_KEY);
    setIdentity(null);
  }

  useEffect(() => {
    api<Identity>("GET", "/api/me")
      .then(signedIn)
      .catch((failure) => {
        if (failure instanceof ApiError && failure.status === 401) {
          signedOut();
        } else {
          setIdentity(cachedIdentity());
        }
      });
  }, []);

  if (identity === undefined) {
    return <p class="notice">Loading…</p>;
  }
  if (identity === null) {
    return <Login onSignedIn={signedIn} />;
  }
  return <Station identity={identity} onSignedOut={signedOut} />;
}

render(<App />, document.getElementById("app") as HTMLElement);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js");
}
