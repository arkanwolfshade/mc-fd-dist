import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "./api.js";
import { Outbox } from "./outbox.js";
import type { QueuedWrite } from "./outbox.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

function write(overrides: Partial<QueuedWrite> = {}): Omit<QueuedWrite, "id"> {
  return {
    kind: "returned",
    method: "POST",
    url: "/api/shifts/1/returned-batches",
    body: { clientId: "a", weight: 1 },
    label: "Returned batch",
    ...overrides,
  };
}

const NETWORK_DOWN = new Error("Failed to fetch");

describe("Outbox", () => {
  let storage: ReturnType<typeof memoryStorage>;
  let sent: QueuedWrite[];
  let respond: (write: QueuedWrite) => Promise<unknown>;
  let rejected: { label: string; error: ApiError }[];
  let sessionEnded: number;

  function outbox() {
    return new Outbox({
      storage,
      key: "outbox:test",
      send: (item) => {
        sent.push(item);
        return respond(item);
      },
      onRejected: (item, error) => rejected.push({ label: item.label, error }),
      onSent: () => {},
      onSessionEnded: () => {
        sessionEnded += 1;
      },
    });
  }

  beforeEach(() => {
    storage = memoryStorage();
    sent = [];
    respond = async () => ({ ok: true });
    rejected = [];
    sessionEnded = 0;
  });

  describe("submit", () => {
    it("sends straight away when online and returns the response", async () => {
      const box = outbox();
      await expect(box.submit(write())).resolves.toEqual({ status: "sent", data: { ok: true } });
      expect(box.items).toEqual([]);
    });

    it("queues the write when the network is down", async () => {
      respond = () => Promise.reject(NETWORK_DOWN);
      const box = outbox();
      await expect(box.submit(write())).resolves.toEqual({ status: "queued" });
      expect(box.items).toHaveLength(1);
    });

    it.each([500, 503, 429])("queues the write on a temporary %i error", async (status) => {
      respond = () => Promise.reject(new ApiError(status, {}));
      const box = outbox();
      await expect(box.submit(write())).resolves.toEqual({ status: "queued" });
    });

    it("throws a rejection so the person can correct it right away", async () => {
      respond = () => Promise.reject(new ApiError(409, { error: "Number in use" }));
      const box = outbox();
      await expect(box.submit(write())).rejects.toThrow("Number in use");
      expect(box.items).toEqual([]);
    });

    it("keeps the write and reports it when the session has ended", async () => {
      respond = () => Promise.reject(new ApiError(401, {}));
      const box = outbox();
      await expect(box.submit(write())).resolves.toEqual({ status: "queued" });
      expect(box.items).toHaveLength(1);
      expect(sessionEnded).toBe(1);
    });

    it("queues behind earlier writes so that order is kept", async () => {
      respond = () => Promise.reject(NETWORK_DOWN);
      const box = outbox();
      await box.submit(write({ label: "first" }));
      respond = async () => ({ ok: true });
      await expect(box.submit(write({ label: "second" }))).resolves.toEqual({ status: "queued" });
      expect(box.items.map((item) => item.label)).toEqual(["first", "second"]);
    });
  });

  describe("persistence", () => {
    it("keeps queued writes across a reload", async () => {
      respond = () => Promise.reject(NETWORK_DOWN);
      await outbox().submit(write({ label: "kept" }));
      expect(outbox().items.map((item) => item.label)).toEqual(["kept"]);
    });

    it("forgets a write once it has been sent", async () => {
      respond = () => Promise.reject(NETWORK_DOWN);
      const box = outbox();
      await box.submit(write());
      respond = async () => ({ ok: true });
      await box.flush();
      expect(outbox().items).toEqual([]);
    });

    it("starts empty if the stored queue is unreadable", () => {
      storage.setItem("outbox:test", "not json");
      expect(outbox().items).toEqual([]);
    });
  });

  describe("flush", () => {
    async function queued(...labels: string[]) {
      respond = () => Promise.reject(NETWORK_DOWN);
      const box = outbox();
      for (const label of labels) {
        await box.submit(write({ label }));
      }
      sent = [];
      return box;
    }

    it("sends queued writes in the order they were made", async () => {
      const box = await queued("first", "second", "third");
      respond = async () => ({ ok: true });
      await box.flush();
      expect(sent.map((item) => item.label)).toEqual(["first", "second", "third"]);
      expect(box.items).toEqual([]);
    });

    it("stops when the network fails again, keeping what is left", async () => {
      const box = await queued("first", "second", "third");
      respond = (item) =>
        item.label === "second" ? Promise.reject(NETWORK_DOWN) : Promise.resolve({ ok: true });
      await box.flush();
      expect(box.items.map((item) => item.label)).toEqual(["second", "third"]);
    });

    it("reports a rejected write, drops it and carries on", async () => {
      const box = await queued("first", "second");
      respond = (item) =>
        item.label === "first"
          ? Promise.reject(new ApiError(409, { error: "Number in use" }))
          : Promise.resolve({ ok: true });
      await box.flush();
      expect(rejected.map((entry) => entry.label)).toEqual(["first"]);
      expect(box.items).toEqual([]);
      expect(sent.map((item) => item.label)).toEqual(["first", "second"]);
    });

    it("stops and keeps everything if the session has ended", async () => {
      const box = await queued("first", "second");
      respond = () => Promise.reject(new ApiError(401, {}));
      await box.flush();
      expect(box.items).toHaveLength(2);
      expect(sessionEnded).toBe(1);
    });

    it("does not send anything twice when flushed twice at once", async () => {
      const box = await queued("only");
      respond = async () => ({ ok: true });
      await Promise.all([box.flush(), box.flush()]);
      expect(sent).toHaveLength(1);
    });

    it("sends a later change to a card using the revision from the earlier one", async () => {
      respond = () => Promise.reject(NETWORK_DOWN);
      const box = outbox();
      const change = (status: string) =>
        write({
          kind: "card-update",
          method: "PATCH",
          url: "/api/cards/5",
          cardId: 5,
          body: { revision: 3, status },
        });
      await box.submit(change("confirmed"));
      await box.submit(change("distributed"));
      await box.submit(
        write({
          kind: "card-update",
          method: "PATCH",
          url: "/api/cards/6",
          cardId: 6,
          body: { revision: 3, status: "confirmed" },
        }),
      );
      sent = [];

      respond = async (item) => ({ id: item.cardId, revision: (item.body.revision as number) + 1 });
      await box.flush();

      expect(sent.map((item) => [item.cardId, item.body.revision])).toEqual([
        [5, 3],
        [5, 4],
        [6, 3],
      ]);
    });

    it("notifies listeners when the queue changes", async () => {
      const seen: number[] = [];
      respond = () => Promise.reject(NETWORK_DOWN);
      const box = outbox();
      box.subscribe((items) => seen.push(items.length));
      await box.submit(write());
      respond = async () => ({ ok: true });
      await box.flush();
      expect(seen).toEqual([1, 0]);
    });
  });
});
