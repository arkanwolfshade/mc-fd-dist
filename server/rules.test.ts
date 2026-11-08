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

  it("lets distribution record that a family left without food, at any point before serving", () => {
    expect(canChangeStatus("distribution", "entered", "left")).toBe(true);
    expect(canChangeStatus("distribution", "called", "left")).toBe(true);
    expect(canChangeStatus("distribution", "confirmed", "left")).toBe(true);
    expect(canChangeStatus("admin", "entered", "left")).toBe(true);
  });

  it("does not let a served family be recorded as leaving without food", () => {
    expect(canChangeStatus("distribution", "distributed", "left")).toBe(false);
    expect(canChangeStatus("admin", "distributed", "left")).toBe(false);
  });

  it("keeps leaving without food out of the front desk's hands", () => {
    expect(canChangeStatus("front_desk", "entered", "left")).toBe(false);
    expect(canChangeStatus("front_desk", "left", "called")).toBe(false);
  });

  it("undoes leaving without food by putting the card back in the queue", () => {
    expect(canChangeStatus("distribution", "left", "called")).toBe(true);
    expect(canChangeStatus("admin", "left", "called")).toBe(true);
    expect(canChangeStatus("distribution", "left", "distributed")).toBe(false);
    expect(canChangeStatus("admin", "left", "entered")).toBe(false);
  });

  it("lets an admin make any single step", () => {
    expect(canChangeStatus("admin", "entered", "called")).toBe(true);
    expect(canChangeStatus("admin", "called", "confirmed")).toBe(true);
    expect(canChangeStatus("admin", "distributed", "confirmed")).toBe(true);
  });
});
