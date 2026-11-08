import { describe, expect, it } from "vitest";
import { unsafeChanges } from "./check-change-set.js";

function change(logicalId: string, action: string, replacement?: string) {
  return {
    Type: "Resource",
    ResourceChange: {
      Action: action,
      LogicalResourceId: logicalId,
      ResourceType: "AWS::Test::Thing",
      ...(replacement ? { Replacement: replacement } : {}),
    },
  };
}

describe("unsafeChanges", () => {
  it("allows changes made in place and new resources", () => {
    const changeSet = {
      Changes: [change("BackupWriter", "Modify", "False"), change("Alarm", "Add")],
    };
    expect(unsafeChanges(changeSet)).toEqual([]);
  });

  it("refuses to replace a resource", () => {
    const changeSet = { Changes: [change("Server", "Modify", "True")] };
    expect(unsafeChanges(changeSet)).toEqual(["Server (AWS::Test::Thing) would be replaced"]);
  });

  it("refuses a change that may replace a resource", () => {
    const changeSet = { Changes: [change("Server", "Modify", "Conditional")] };
    expect(unsafeChanges(changeSet)).toEqual(["Server (AWS::Test::Thing) might be replaced"]);
  });

  it("refuses to remove a resource", () => {
    const changeSet = { Changes: [change("BackupBucket", "Remove")] };
    expect(unsafeChanges(changeSet)).toEqual(["BackupBucket (AWS::Test::Thing) would be removed"]);
  });

  it("lists every unsafe change", () => {
    const changeSet = {
      Changes: [
        change("Server", "Modify", "True"),
        change("Budget", "Modify", "False"),
        change("StaticIp", "Remove"),
      ],
    };
    expect(unsafeChanges(changeSet)).toHaveLength(2);
  });

  it("allows an empty change set", () => {
    expect(unsafeChanges({ Changes: [] })).toEqual([]);
    expect(unsafeChanges({})).toEqual([]);
  });
});
