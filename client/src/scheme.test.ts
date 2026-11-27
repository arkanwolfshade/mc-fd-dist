import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  saveColorBlind,
  saveScheme,
  savedColorBlind,
  savedScheme,
  schemeFrom,
  showColorBlind,
  showScheme,
} from "./scheme.js";

describe("schemeFrom", () => {
  it("keeps a known choice", () => {
    expect(schemeFrom("light")).toBe("light");
    expect(schemeFrom("dark")).toBe("dark");
  });

  it("follows the device when nothing, or something unknown, was saved", () => {
    expect(schemeFrom(null)).toBe("auto");
    expect(schemeFrom("purple")).toBe("auto");
  });
});

describe("saving and showing a choice", () => {
  const stored = new Map<string, string>();
  const dataset: Record<string, string | undefined> = {};

  beforeEach(() => {
    stored.clear();
    for (const key of Object.keys(dataset)) delete dataset[key];
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
    vi.stubGlobal("document", { documentElement: { dataset } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("remembers Light or Dark on this device and marks the page with it", () => {
    saveScheme("dark");
    expect(savedScheme()).toBe("dark");
    expect(dataset.scheme).toBe("dark");
  });

  it("forgets the choice and unmarks the page for Auto, so the device decides", () => {
    saveScheme("light");
    saveScheme("auto");
    expect(savedScheme()).toBe("auto");
    expect(stored.size).toBe(0);
    expect(dataset.scheme).toBeUndefined();
  });

  it("shows a saved choice without saving again", () => {
    showScheme("dark");
    expect(dataset.scheme).toBe("dark");
    expect(stored.size).toBe(0);
  });

  it("remembers color-blind colors on this device and marks the page with them", () => {
    expect(savedColorBlind()).toBe(false);
    saveColorBlind(true);
    expect(savedColorBlind()).toBe(true);
    expect(dataset.colorBlind).toBe("on");
  });

  it("forgets color-blind colors when turned off, and unmarks the page", () => {
    saveColorBlind(true);
    saveColorBlind(false);
    expect(savedColorBlind()).toBe(false);
    expect(stored.size).toBe(0);
    expect(dataset.colorBlind).toBeUndefined();
  });

  it("shows color-blind colors without saving them", () => {
    showColorBlind(true);
    expect(dataset.colorBlind).toBe("on");
    expect(stored.size).toBe(0);
  });
});
