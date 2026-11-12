import { shiftSummary } from "../../server/summary.js";
import type { ShiftWithCards } from "./types.js";

export function Summary(props: { shift: ShiftWithCards }) {
  const { cards, returnedBatches } = props.shift;
  const summary = shiftSummary(cards, returnedBatches);

  return (
    <div class="columns">
      <section class="panel">
        <h2>Shift totals</h2>
        <table class="totals">
          <tbody>
            <tr>
              <th>Total # of families</th>
              <td>{summary.families.total}</td>
            </tr>
            <tr class="detail">
              <th>Cards</th>
              <td>{summary.families.cards}</td>
            </tr>
            <tr class="detail">
              <th>Door Dash and Helping Hands</th>
              <td>{summary.families.partners}</td>
            </tr>
            <tr>
              <th>Left without food</th>
              <td>{summary.families.left}</td>
            </tr>
            <tr>
              <th>Total weight</th>
              <td>{summary.weight.total} lb</td>
            </tr>
            <tr class="detail">
              <th>Cards</th>
              <td>{summary.weight.cards} lb</td>
            </tr>
            <tr class="detail">
              <th>Door Dash and Helping Hands</th>
              <td>{summary.weight.partners} lb</td>
            </tr>
            <tr>
              <th>Total return weight</th>
              <td>{summary.returnedWeight} lb</td>
            </tr>
            <tr>
              <th>Net weight</th>
              <td>{summary.netWeight} lb</td>
            </tr>
            <tr>
              <th>Total # of TEFAP bags</th>
              <td>{summary.tefapBags}</td>
            </tr>
            <tr>
              <th>Total # of senior boxes</th>
              <td>{summary.seniorBoxes}</td>
            </tr>
            <tr>
              <th>Total # of cheese</th>
              <td>{summary.cheese}</td>
            </tr>
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
