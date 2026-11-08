// A release may change the stack in place, but never replace or remove a resource.
// Replacing the Lightsail server would lose the live database with it, so such changes
// are left for a person to make by hand.
interface ChangeSet {
  Changes?: {
    ResourceChange?: {
      Action?: string;
      LogicalResourceId?: string;
      ResourceType?: string;
      Replacement?: string;
    };
  }[];
}

// Lists the changes in a CloudFormation change set that a release must not make.
export function unsafeChanges(changeSet: ChangeSet): string[] {
  const problems: string[] = [];
  for (const { ResourceChange: change } of changeSet.Changes ?? []) {
    if (!change) continue;
    const name = `${change.LogicalResourceId} (${change.ResourceType})`;
    if (change.Action === "Remove") problems.push(`${name} would be removed`);
    else if (change.Replacement === "True") problems.push(`${name} would be replaced`);
    else if (change.Replacement === "Conditional") problems.push(`${name} might be replaced`);
  }
  return problems;
}
