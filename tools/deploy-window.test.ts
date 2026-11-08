import { describe, expect, it } from "vitest";
import { shiftAt } from "./deploy-window.js";

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
