import { useState } from "preact/hooks";
import type { Role } from "../../server/accounts.js";
import admin from "../../docs/guides/en/admin.md?guide";
import distribution from "../../docs/guides/en/distribution.md?guide";
import frontDesk from "../../docs/guides/en/front-desk.md?guide";
import gettingStarted from "../../docs/guides/en/getting-started.md?guide";
import { SCHEMES, type Scheme, saveScheme, savedScheme } from "./scheme.js";

interface Guide {
  title: string;
  html: string;
}

const FRONT_DESK: Guide = { title: "Front desk guide", html: frontDesk };
const DISTRIBUTION: Guide = { title: "Distribution guide", html: distribution };
const ADMIN: Guide = { title: "Admin guide", html: admin };
const GETTING_STARTED: Guide = { title: "Getting started", html: gettingStarted };

// Each station starts on its own guide.
const GUIDES_BY_ROLE: Record<Role, [Guide, ...Guide[]]> = {
  front_desk: [FRONT_DESK, GETTING_STARTED],
  distribution: [DISTRIBUTION, GETTING_STARTED],
  admin: [ADMIN, FRONT_DESK, DISTRIBUTION, GETTING_STARTED],
};

const SCHEME_LABELS: Record<Scheme, string> = {
  auto: "Same as this device",
  light: "Light",
  dark: "Dark",
};

export function Help(props: { role: Role }) {
  const guides = GUIDES_BY_ROLE[props.role];
  const [shown, setShown] = useState(guides[0]);
  const [scheme, setScheme] = useState(savedScheme);

  return (
    <div class="help">
      <nav class="choices" aria-label="Guides">
        {guides.map((guide) => (
          <button
            key={guide.title}
            class={guide === shown ? "selected" : ""}
            aria-pressed={guide === shown}
            onClick={() => setShown(guide)}
          >
            {guide.title}
          </button>
        ))}
      </nav>
      <fieldset>
        <legend>Colors on this device</legend>
        <div class="choices">
          {SCHEMES.map((option) => (
            <button
              key={option}
              class={option === scheme ? "selected" : ""}
              aria-pressed={option === scheme}
              onClick={() => {
                saveScheme(option);
                setScheme(option);
              }}
            >
              {SCHEME_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>
      {/* Written in this repository and converted at build time, never user input. */}
      {/* oxlint-disable-next-line react/no-danger */}
      {/* nosemgrep: javascript_react_rule-dangerouslysetinnerhtml, react-dangerouslysetinnerhtml -- the HTML is converted from this repository's guides at build time */}
      <article class="guide panel" dangerouslySetInnerHTML={{ __html: shown.html }} />
    </div>
  );
}
