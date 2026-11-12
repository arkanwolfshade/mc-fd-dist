import { ApiError } from "./api.js";

export type WriteKind = "card-create" | "card-update" | "returned";

export interface QueuedWrite {
  id: string;
  kind: WriteKind;
  method: "POST" | "PATCH";
  url: string;
  body: Record<string, unknown>;
  label: string;
  cardId?: number;
}

export type SubmitResult = { status: "sent"; data: unknown } | { status: "queued" };

export interface OutboxOptions {
  storage: Pick<Storage, "getItem" | "setItem">;
  key: string;
  send: (write: QueuedWrite) => Promise<unknown>;
  onSent: (write: QueuedWrite, data: unknown) => void;
  onRejected: (write: QueuedWrite, error: ApiError) => void;
  onSessionEnded: () => void;
}

type Outcome = "retry-later" | "session-ended" | "rejected";

// Also decides how a failed shift load is handled, so a station and its outbox agree on
// which failures mean "the server can't be reached right now".
export function classify(error: unknown): Outcome {
  if (!(error instanceof ApiError)) return "retry-later";
  if (error.status === 401) return "session-ended";
  if (error.status >= 500 || error.status === 429 || error.status === 408) return "retry-later";
  return "rejected";
}

// Holds writes on the device during a dropout and sends them in order afterward.
// Creating records is safe to retry because the server recognizes a repeated clientId.
// See ADR 0014.
export class Outbox {
  items: QueuedWrite[];
  private flushing: Promise<void> | null = null;
  private listeners: ((items: QueuedWrite[]) => void)[] = [];

  constructor(private readonly options: OutboxOptions) {
    this.items = this.load();
  }

  subscribe(listener: (items: QueuedWrite[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((other) => other !== listener);
    };
  }

  async submit(write: Omit<QueuedWrite, "id">): Promise<SubmitResult> {
    const item: QueuedWrite = { id: crypto.randomUUID(), ...write };
    if (this.items.length > 0 || this.flushing) {
      this.enqueue(item);
      return { status: "queued" };
    }

    try {
      return { status: "sent", data: await this.options.send(item) };
    } catch (error) {
      const outcome = classify(error);
      if (outcome === "rejected") throw error;
      this.enqueue(item);
      if (outcome === "session-ended") this.options.onSessionEnded();
      return { status: "queued" };
    }
  }

  flush(): Promise<void> {
    this.flushing ??= this.run().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async run(): Promise<void> {
    let next = this.items[0];
    while (next) {
      try {
        // One at a time on purpose: writes must reach the server in the order they were made.
        // oxlint-disable-next-line no-await-in-loop
        const data = await this.options.send(next);
        this.remove(next);
        this.rebaseLaterChanges(next, data);
        this.options.onSent(next, data);
      } catch (error) {
        const outcome = classify(error);
        if (outcome === "retry-later") return;
        if (outcome === "session-ended") {
          this.options.onSessionEnded();
          return;
        }
        this.remove(next);
        this.options.onRejected(next, error as ApiError);
      }
      next = this.items[0];
    }
  }

  // Later changes to the same card were queued against a revision this one replaced.
  private rebaseLaterChanges(sent: QueuedWrite, data: unknown): void {
    const revision = (data as { revision?: unknown } | null)?.revision;
    if (sent.cardId === undefined || typeof revision !== "number") return;

    this.items = this.items.map((item) =>
      item.cardId === sent.cardId ? { ...item, body: { ...item.body, revision } } : item,
    );
    this.save();
  }

  private enqueue(item: QueuedWrite): void {
    this.items = [...this.items, item];
    this.changed();
  }

  private remove(item: QueuedWrite): void {
    this.items = this.items.filter((other) => other.id !== item.id);
    this.changed();
  }

  private changed(): void {
    this.save();
    for (const listener of this.listeners) {
      listener(this.items);
    }
  }

  private save(): void {
    this.options.storage.setItem(this.options.key, JSON.stringify(this.items));
  }

  private load(): QueuedWrite[] {
    const stored = this.options.storage.getItem(this.options.key);
    if (!stored) return [];
    try {
      const parsed: unknown = JSON.parse(stored);
      return Array.isArray(parsed) ? (parsed as QueuedWrite[]) : [];
    } catch {
      return [];
    }
  }
}
