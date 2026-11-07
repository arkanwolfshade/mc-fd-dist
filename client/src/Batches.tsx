import { useState } from "preact/hooks";
import { PARTNERS } from "../../server/batches.js";
import type { Partner } from "../../server/batches.js";
import { api } from "./api.js";
import type { ShiftWithCards } from "./types.js";

function errorText(failure: unknown): string {
  return failure instanceof Error ? failure.message : "Could not save that";
}

export function ReturnedBatches(props: { shift: ShiftWithCards }) {
  const { shift } = props;
  const [weight, setWeight] = useState("");
  const [error, setError] = useState("");

  async function add(event: Event) {
    event.preventDefault();
    setError("");
    try {
      await api("POST", `/api/shifts/${shift.id}/returned-batches`, {
        clientId: crypto.randomUUID(),
        weight: Number(weight),
      });
      setWeight("");
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  return (
    <section class="panel">
      <h2>Returned items ({shift.returnedBatches.length})</h2>
      <form class="row end" onSubmit={add}>
        <label>
          Weight (lb)
          <input
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            required
            value={weight}
            onInput={(e) => setWeight(e.currentTarget.value)}
          />
        </label>
        <button type="submit">Add returned batch</button>
      </form>
      {error && <p class="error">{error}</p>}
      <ul class="cards">
        {shift.returnedBatches.map((batch) => (
          <li key={batch.id}>
            <span>{batch.weight} lb</span>
            <button
              onClick={() => api("DELETE", `/api/returned-batches/${batch.id}`).catch(() => {})}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PartnerBatches(props: { shift: ShiftWithCards }) {
  const { shift } = props;
  const [partner, setPartner] = useState<Partner | null>(null);
  const [familyCount, setFamilyCount] = useState("");
  const [weight, setWeight] = useState("");
  const [error, setError] = useState("");

  async function add(event: Event) {
    event.preventDefault();
    if (!partner) {
      setError("Choose a partner.");
      return;
    }
    setError("");
    try {
      await api("POST", `/api/shifts/${shift.id}/partner-batches`, {
        clientId: crypto.randomUUID(),
        partner,
        familyCount: Number(familyCount),
        weight: Number(weight),
      });
      setPartner(null);
      setFamilyCount("");
      setWeight("");
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  return (
    <section class="panel">
      <h2>End of shift: last cards ({shift.partnerBatches.length})</h2>
      <form class="stack" onSubmit={add}>
        <div class="choices">
          {PARTNERS.map((option) => (
            <button
              type="button"
              key={option}
              class={partner === option ? "selected" : ""}
              aria-pressed={partner === option}
              onClick={() => setPartner(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <div class="row">
          <label>
            # of families
            <input
              type="number"
              inputmode="numeric"
              min="1"
              required
              value={familyCount}
              onInput={(e) => setFamilyCount(e.currentTarget.value)}
            />
          </label>
          <label>
            Weight (lb)
            <input
              type="number"
              inputmode="decimal"
              min="0"
              step="any"
              required
              value={weight}
              onInput={(e) => setWeight(e.currentTarget.value)}
            />
          </label>
        </div>
        {error && <p class="error">{error}</p>}
        <button type="submit">Add last cards</button>
      </form>
      <ul class="cards">
        {shift.partnerBatches.map((batch) => (
          <li key={batch.id}>
            <span>
              {batch.partner} · {batch.familyCount}{" "}
              {batch.familyCount === 1 ? "family" : "families"} · {batch.weight} lb
            </span>
            <button
              onClick={() => api("DELETE", `/api/partner-batches/${batch.id}`).catch(() => {})}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
