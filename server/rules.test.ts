import { describe, expect, it } from "vitest";
import { canChangeStatus, tefapBags } from "./rules.js";

describe("tefapBags", () => {
  it.each([
    [1, 1],
    [4, 1],
    [5, 2],
    [8, 2],
    [9, 3],
    [20, 3],
  ])("gives a family of %i people %i bags", (familySize, bags) => {
    expect(tefapBags(familySize)).toBe(bags);
  });
});

describe("canChangeStatus", () => {
  it("lets the front desk call a family forward", () => {
    expect(canChangeStatus("front_desk", "entered", "called")).toBe(true);
  });

  it("lets the front desk undo a call", () => {
    expect(canChangeStatus("front_desk", "called", "entered")).toBe(true);
  });

  it("stops the front desk confirming or distributing", () => {
    expect(canChangeStatus("front_desk", "called", "confirmed")).toBe(false);
    expect(canChangeStatus("front_desk", "confirmed", "distributed")).toBe(false);
  });

  it("lets distribution move a called card forward through each step", () => {
    expect(canChangeStatus("distribution", "called", "confirmed")).toBe(true);
    expect(canChangeStatus("distribution", "confirmed", "distributed")).toBe(true);
  });

  it("lets distribution step back one to correct a mistake", () => {
    expect(canChangeStatus("distribution", "distributed", "confirmed")).toBe(true);
    expect(canChangeStatus("distribution", "confirmed", "called")).toBe(true);
  });

  it("stops distribution acting on a card that has not been called", () => {
    expect(canChangeStatus("distribution", "entered", "called")).toBe(false);
    expect(canChangeStatus("distribution", "entered", "confirmed")).toBe(false);
  });

  it("does not allow skipping a step", () => {
    expect(canChangeStatus("distribution", "called", "distributed")).toBe(false);
    expect(canChangeStatus("admin", "entered", "confirmed")).toBe(false);
  });

  it("lets an admin make any single step", () => {
    expect(canChangeStatus("admin", "entered", "called")).toBe(true);
    expect(canChangeStatus("admin", "called", "confirmed")).toBe(true);
    expect(canChangeStatus("admin", "distributed", "confirmed")).toBe(true);
  });
});
