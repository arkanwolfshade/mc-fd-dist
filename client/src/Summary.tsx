import { shiftSummary } from "../../server/summary.js";
import type { ShiftWithCards } from "./types.js";

interface TotalsRow {
  key: string;
  label: string;
  value: string | number;
  // A breakdown of the row above it.
  detail?: boolean;
}

function totalsRows(summary: ReturnType<typeof shiftSummary>): TotalsRow[] {
  const { families, weight } = summary;
  return [
    { key: "families", label: "Total # of families", value: families.total },
    { key: "families-cards", label: "Cards", value: families.cards, detail: true },
    {
      key: "families-partners",
      label: "Door Dash and Helping Hands",
      value: families.partners,
      detail: true,
    },
    { key: "left", label: "Left without food", value: families.left },
    { key: "weight", label: "Total weight", value: `${weight.total} lb` },
    { key: "weight-cards", label: "Cards", value: `${weight.cards} lb`, detail: true },
    {
      key: "weight-partners",
      label: "Door Dash and Helping Hands",
      value: `${weight.partners} lb`,
      detail: true,
    },
    { key: "returned", label: "Total return weight", value: `${summary.returnedWeight} lb` },
    { key: "net", label: "Net weight", value: `${summary.netWeight} lb` },
    { key: "tefap", label: "Total # of TEFAP bags", value: summary.tefapBags },
    { key: "senior", label: "Total # of senior boxes", value: summary.seniorBoxes },
    { key: "cheese", label: "Total # of cheese", value: summary.cheese },
  ];
}

export function Summary(props: { shift: ShiftWithCards }) {
  const { cards, returnedBatches } = props.shift;
  const summary = shiftSummary(cards, returnedBatches);

  return (
    <div class="columns">
      <section class="panel">
        <h2>Shift totals</h2>
        <table class="totals">
          <tbody>
            {totalsRows(summary).map((row) => (
              <tr key={row.key} class={row.detail ? "detail" : undefined}>
                <th>{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {summary.distributedWithoutWeight > 0 && (
          <p class="warning-inline">
            {summary.distributedWithoutWeight} distributed{" "}
            {summary.distributedWithoutWeight === 1 ? "card has" : "cards have"} no weight, so the
            weight totals may be low.
          </p>
        )}
      </section>
    </div>
  );
}
