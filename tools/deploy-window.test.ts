import { describe, expect, it } from "vitest";
import { phoenixClock, shiftAt, waitForWindow, windowOpensAt } from "./deploy-window.js";

const MINUTE = 60_000;

// Phoenix keeps UTC-7 all year, so these times are written in UTC.
describe("shiftAt", () => {
  it("finds the Monday, Tuesday, Thursday and Friday shifts from 7am to 2pm", () => {
    expect(shiftAt(new Date("2026-11-09T14:00:00Z"))).toBe("Monday 7am to 2pm");
    expect(shiftAt(new Date("2026-11-10T20:59:00Z"))).toBe("Tuesday 7am to 2pm");
    expect(shiftAt(new Date("2026-11-12T17:30:00Z"))).toBe("Thursday 7am to 2pm");
    expect(shiftAt(new Date("2026-11-13T14:00:00Z"))).toBe("Friday 7am to 2pm");
  });

  it("leaves those days free before 7am and from 2pm", () => {
    expect(shiftAt(new Date("2026-11-09T13:59:00Z"))).toBeUndefined();
    expect(shiftAt(new Date("2026-11-09T21:00:00Z"))).toBeUndefined();
  });

  it("finds the Wednesday shift from 1pm to 8pm, which runs past midnight in UTC", () => {
    expect(shiftAt(new Date("2026-11-11T20:00:00Z"))).toBe("Wednesday 1pm to 8pm");
    expect(shiftAt(new Date("2026-11-12T02:59:00Z"))).toBe("Wednesday 1pm to 8pm");
    expect(shiftAt(new Date("2026-11-11T19:59:00Z"))).toBeUndefined();
    expect(shiftAt(new Date("2026-11-12T03:00:00Z"))).toBeUndefined();
  });

  it("leaves Wednesday morning free", () => {
    expect(shiftAt(new Date("2026-11-11T16:00:00Z"))).toBeUndefined();
  });

  it("leaves the weekend free", () => {
    expect(shiftAt(new Date("2026-11-07T17:00:00Z"))).toBeUndefined();
    expect(shiftAt(new Date("2026-11-08T17:00:00Z"))).toBeUndefined();
  });
});

describe("windowOpensAt", () => {
  it("is the moment itself when no shift is running", () => {
    const free = new Date("2026-11-09T13:59:00Z");
    expect(windowOpensAt(free)).toEqual(free);
  });

  it("is the end of the running shift, and the end itself is already open", () => {
    expect(windowOpensAt(new Date("2026-11-13T14:50:00Z"))).toEqual(
      new Date("2026-11-13T21:00:00Z"),
    );
    expect(windowOpensAt(new Date("2026-11-11T20:30:00Z"))).toEqual(
      new Date("2026-11-12T03:00:00Z"),
    );
    const end = new Date("2026-11-09T21:00:00Z");
    expect(windowOpensAt(end)).toEqual(end);
  });
});

describe("phoenixClock", () => {
  it("writes Phoenix time the way the shifts are named", () => {
    expect(phoenixClock(new Date("2026-11-13T21:00:00Z"))).toBe("2pm");
    expect(phoenixClock(new Date("2026-11-13T15:20:00Z"))).toBe("8:20am");
    expect(phoenixClock(new Date("2026-11-13T19:05:00Z"))).toBe("12:05pm");
  });
});

// A clock that only moves when the code sleeps, so nothing really waits.
function fakeWait(start: string, maxWaitMs = 340 * MINUTE) {
  let time = new Date(start).getTime();
  const sleeps: number[] = [];
  const logs: string[] = [];
  return {
    sleeps,
    logs,
    run: () =>
      waitForWindow({
        now: () => new Date(time),
        sleep: (ms) => {
          sleeps.push(ms);
          time += ms;
          return Promise.resolve();
        },
        log: (line) => logs.push(line),
        maxWaitMs,
      }),
  };
}

describe("waitForWindow", () => {
  it("does not wait when no shift is running", async () => {
    const wait = fakeWait("2026-11-13T22:00:00Z");
    expect(await wait.run()).toEqual({ status: "open", opensAt: new Date("2026-11-13T22:00:00Z") });
    expect(wait.sleeps).toEqual([]);
  });

  it("waits out a shift that ends within the limit", async () => {
    const wait = fakeWait("2026-11-13T20:00:00Z"); // Friday 1pm, an hour before the end
    expect(await wait.run()).toEqual({
      status: "waited",
      opensAt: new Date("2026-11-13T21:00:00Z"),
    });
    expect(wait.sleeps).toEqual([30 * MINUTE, 30 * MINUTE]);
    expect(wait.logs[0]).toContain("Waiting until 2pm");
  });

  it("sleeps only as long as is left, and logs each time it wakes", async () => {
    const wait = fakeWait("2026-11-13T20:10:00Z"); // 50 minutes left
    await wait.run();
    expect(wait.sleeps).toEqual([30 * MINUTE, 20 * MINUTE]);
    expect(wait.logs).toHaveLength(2); // the start, then one heartbeat
  });

  it("refuses at once, without sleeping, when the window is beyond the limit", async () => {
    const wait = fakeWait("2026-11-13T14:50:00Z"); // Friday 7:50am, 6h10m before the end
    expect(await wait.run()).toEqual({
      status: "too-far",
      opensAt: new Date("2026-11-13T21:00:00Z"),
    });
    expect(wait.sleeps).toEqual([]);
  });

  it("keeps waiting if it wakes before the shift is over", async () => {
    let time = new Date("2026-11-13T20:00:00Z").getTime();
    let calls = 0;
    const result = await waitForWindow({
      now: () => new Date(time),
      sleep: () => {
        calls += 1;
        time += calls === 1 ? 5 * MINUTE : 60 * MINUTE; // the first wake is early
        return Promise.resolve();
      },
      log: () => undefined,
      maxWaitMs: 340 * MINUTE,
    });
    expect(result.status).toBe("waited");
    expect(calls).toBe(2);
  });
});
