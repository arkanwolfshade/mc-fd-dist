import { useState } from "preact/hooks";
import { PARTNERS } from "../../server/batches.js";
import type { Partner } from "../../server/batches.js";
import { api } from "./api.js";
import type { ShiftView } from "./pending.js";
import type { Submit } from "./types.js";

function errorText(failure: unknown): string {
  return failure instanceof Error ? failure.message : "Could not save that";
}

function families(count: number): string {
  return `${count} ${count === 1 ? "family" : "families"}`;
}

export function ReturnedBatches(props: { shift: ShiftView; submit: Submit }) {
  const { shift, submit } = props;
  const [weight, setWeight] = useState("");
  const [error, setError] = useState("");

  async function add(event: Event) {
    event.preventDefault();
    setError("");
    try {
      await submit({
        kind: "returned",
        method: "POST",
        url: `/api/shifts/${shift.id}/returned-batches`,
        body: { clientId: crypto.randomUUID(), weight: Number(weight) },
        label: `Returned batch (${weight} lb)`,
      });
      setWeight("");
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  async function remove(id: number) {
    setError("");
    try {
      await api("DELETE", `/api/returned-batches/${id}`);
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  return (
    <section class="panel">
      <h2>Returned items ({shift.returnedBatches.length + shift.pendingReturned.length})</h2>
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
            <button onClick={() => remove(batch.id)}>Remove</button>
          </li>
        ))}
        {shift.pendingReturned.map((batch) => (
          <li key={batch.id}>
            <span>{batch.weight} lb · waiting to send</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PartnerBatches(props: { shift: ShiftView; submit: Submit }) {
  const { shift, submit } = props;
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
      await submit({
        kind: "partner",
        method: "POST",
        url: `/api/shifts/${shift.id}/partner-batches`,
        body: {
          clientId: crypto.randomUUID(),
          partner,
          familyCount: Number(familyCount),
          weight: Number(weight),
        },
        label: `${partner} (${families(Number(familyCount))}, ${weight} lb)`,
      });
      setPartner(null);
      setFamilyCount("");
      setWeight("");
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  async function remove(id: number) {
    setError("");
    try {
      await api("DELETE", `/api/partner-batches/${id}`);
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  return (
    <section class="panel">
      <h2>
        End of shift: last cards ({shift.partnerBatches.length + shift.pendingPartners.length})
      </h2>
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
              {batch.partner} · {families(batch.familyCount)} · {batch.weight} lb
            </span>
            <button onClick={() => remove(batch.id)}>Remove</button>
          </li>
        ))}
        {shift.pendingPartners.map((batch) => (
          <li key={batch.id}>
            <span>
              {batch.partner} · {families(batch.familyCount)} · {batch.weight} lb · waiting to send
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
