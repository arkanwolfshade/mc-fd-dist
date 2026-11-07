import { describe, expect, it } from "vitest";
import { toCsv } from "./csv.js";

describe("toCsv", () => {
  it("writes a header row and one row per record", () => {
    expect(toCsv(["a", "b"], [[1, "x"], [2, "y"]])).toBe("a,b\r\n1,x\r\n2,y\r\n");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(toCsv(["note"], [['one, "two"\nthree']])).toBe('note\r\n"one, ""two""\nthree"\r\n');
  });

  it("writes null as an empty field", () => {
    expect(toCsv(["a", "b"], [[null, 1]])).toBe("a,b\r\n,1\r\n");
  });

  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"])(
    "stops spreadsheets running free text %j as a formula",
    (text) => {
      const row = toCsv(["note"], [[text]]).split("\r\n")[1] ?? "";
      expect(row.replace(/^"/, "").startsWith("'")).toBe(true);
    },
  );

  it("leaves numbers alone, including negative ones", () => {
    expect(toCsv(["n"], [[-1.5]])).toBe("n\r\n-1.5\r\n");
  });
});
