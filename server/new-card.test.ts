import { describe, expect, it } from "vitest";
import type { Account } from "./accounts.js";
import { newCardFrom } from "./card-routes.js";
import type { NewCard } from "./cards.js";

const frontDesk: Account = { id: 1, username: "front-desk", role: "front_desk" };
const distribution: Account = { id: 2, username: "distribution", role: "distribution" };

const WALK_IN: NewCard = {
  clientId: "c1",
  number: 1,
  familySize: 3,
  arrivalMethod: "Walk",
  seniorBox: false,
  cheese: false,
  other: "",
  intakeInitials: "ab",
  status: "entered",
};

// The route's schema also drops unknown fields. These tests hold the handler's own layer in
// place, so that removing the schema's strictness one day does not open the status to requests.
describe("newCardFrom", () => {
  it("builds the card from the allowed fields only", () => {
    const body = { ...WALK_IN, status: "distributed", revision: 9, id: 4 } as NewCard;
    const input = newCardFrom(frontDesk, body);
    expect(input).toMatchObject({ status: "entered", intakeInitials: "AB" });
    expect(input).not.toHaveProperty("revision");
    expect(input).not.toHaveProperty("id");
  });

  it("starts a partner Family as distributed, whatever status is sent", () => {
    const body = {
      ...WALK_IN,
      arrivalMethod: "DD",
      intakeInitials: undefined,
      status: "entered",
    } as NewCard;
    expect(newCardFrom(distribution, body)).toMatchObject({ status: "distributed" });
  });

  it("refuses a request the role may not make", () => {
    expect(newCardFrom(distribution, WALK_IN)).toEqual({
      code: 403,
      error: "Walk-in Families are entered at the front desk",
    });
    expect(newCardFrom(frontDesk, { ...WALK_IN, arrivalMethod: "DD" })).toMatchObject({
      code: 400,
    });
    expect(newCardFrom(frontDesk, { ...WALK_IN, loads: [10, null, null] })).toMatchObject({
      code: 403,
    });
  });

  it("refuses initials that are not 2 to 4 letters", () => {
    expect(newCardFrom(frontDesk, { ...WALK_IN, intakeInitials: "A1" })).toMatchObject({
      code: 400,
    });
  });

  it("refuses Cheese without a Senior Box before it looks at anything else", () => {
    expect(newCardFrom(distribution, { ...WALK_IN, cheese: true })).toMatchObject({
      code: 400,
      error: "Cheese comes only with a senior box",
    });
  });
});
