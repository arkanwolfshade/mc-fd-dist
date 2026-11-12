import { describe, expect, it } from "vitest";
import {
  arrivalLabel,
  canChangeStatus,
  cartCount,
  isPartnerMethod,
  needsExtrasCheck,
  normalizeInitials,
  tefapBags,
} from "./rules.js";

describe("cartCount", () => {
  it("gives a Family one cart for each TEFAP bag", () => {
    expect(cartCount({ tefapBags: 1 })).toBe(1);
    expect(cartCount({ tefapBags: 2 })).toBe(2);
    expect(cartCount({ tefapBags: 3 })).toBe(3);
  });

  it("follows bags set by hand rather than the Family's size", () => {
    const card = { familySize: 2, tefapBags: 3 };
    expect(cartCount(card)).toBe(3);
  });
});

describe("needsExtrasCheck", () => {
  it.each([
    [1, false],
    [4, false],
    [5, true],
    [7, true],
    [8, false],
    [9, true],
    [11, true],
    [12, false],
    [13, true],
    [16, true],
  ])("for a Family of %i is %s", (familySize, expected) => {
    expect(needsExtrasCheck(familySize)).toBe(expected);
  });
});

describe("partner methods", () => {
  it("marks Door Dash and Helping Hands as partners", () => {
    expect(isPartnerMethod("DD")).toBe(true);
    expect(isPartnerMethod("HH")).toBe(true);
    expect(isPartnerMethod("Walk")).toBe(false);
  });

  it("names partners in full", () => {
    expect(arrivalLabel("DD")).toBe("Door Dash");
    expect(arrivalLabel("HH")).toBe("Helping Hands");
  });
});

describe("normalizeInitials", () => {
  it("accepts 2 to 4 letters and stores them in capitals", () => {
    expect(normalizeInitials("ab")).toBe("AB");
    expect(normalizeInitials(" jqp ")).toBe("JQP");
    expect(normalizeInitials("ABCD")).toBe("ABCD");
  });

  it("refuses anything else", () => {
    expect(normalizeInitials("A")).toBeNull();
    expect(normalizeInitials("ABCDE")).toBeNull();
    expect(normalizeInitials("A1")).toBeNull();
    expect(normalizeInitials("")).toBeNull();
  });
});

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
    expect(canChangeStatus("front_desk", "left", "entered")).toBe(false);
  });

  it("undoes leaving without food by returning the card to the front desk", () => {
    expect(canChangeStatus("distribution", "left", "entered")).toBe(true);
    expect(canChangeStatus("admin", "left", "entered")).toBe(true);
  });

  // Otherwise distribution could put a card in its own queue that the front desk never called.
  it("does not let undoing it skip calling the family forward", () => {
    expect(canChangeStatus("distribution", "left", "called")).toBe(false);
    expect(canChangeStatus("admin", "left", "called")).toBe(false);
    expect(canChangeStatus("distribution", "left", "distributed")).toBe(false);
  });

  it("lets an admin make any single step", () => {
    expect(canChangeStatus("admin", "entered", "called")).toBe(true);
    expect(canChangeStatus("admin", "called", "confirmed")).toBe(true);
    expect(canChangeStatus("admin", "distributed", "confirmed")).toBe(true);
  });
});
