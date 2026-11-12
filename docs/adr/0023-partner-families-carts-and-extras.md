# 0023. Enter partner Families as cards, and match carts and extras to the Family

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The food bank sent back twelve change requests on the Front Desk and Distribution screens after using them. Most were wording. Three changed what the app records:

- A Door Dash or Helping Hands entry describes one Family, with a card number, a Family size, TEFAP bags and cart weights. The app recorded it as a batch: a partner, a number of Families and one weight.
- The number of carts follows the Family's size, the same way TEFAP bags do. Distribution could enter up to three weights on any card, and a weight could be left out.
- Families of some sizes get extra items, such as meat, deli or bakery. Nothing reminded Distribution to add them.

The decisions were settled with the developer on 2026-11-11.

## Decision

- **Partner Families are cards:** Each Door Dash or Helping Hands Family is one card. Its **Location or transport** is Door Dash or Helping Hands. It takes a number from the same card stack, unique per shift, and has a Family size, TEFAP bags, Senior Box and Cheese, extras and cart weights.
  - Distribution enters these cards in the end-of-shift panel, **End of shift: Door Dash and Helping Hands**. The server saves them as distributed.
  - The front desk cannot choose Door Dash or Helping Hands. Distribution and admins can create cards only for those two.
  - Partner cards carry no intake initials (ADR 0024). *Assumed:* these Families never pass the intake computers.
- **Partner batches are retired:** The `partner_batch` table is dropped. Migration 6 refuses to run if any batch exists, because a batch has no card numbers or sizes and cannot be split into Families. Returned batches are unchanged.
- **Carts:** A card has as many carts as TEFAP bags: 1 for 1 to 4 people, 2 for 5 to 8, and 3 for 9 or more. An admin override of the bags also sets the carts. The server rejects a weight for a cart beyond that count, on both create and update. The database columns stay `load_1` to `load_3`.
- **Required weights, with a warned exception:** Each cart shown needs a weight. If one is missing at **Mark distributed**, a warning names the carts without a weight and offers **Mark distributed anyway** or **Go back**. A typed zero still counts as a weight.
- **Extras check:** Families of 5 to 7, 9 to 11, and 13 or more get an **Extras added** checkbox and an optional **What was added** note of up to 200 characters. If the box is unticked at **Mark distributed**, the same warning says so and can be overridden. Both are stored, shown on the distributed row, and exported. *Assumed:* the note is optional.
- **Wording:**
  - "Load" becomes "Cart" on screen, in the guides, and in the cards CSV, whose columns become `cart_1`, `cart_2` and `cart_3`.
  - "Arrived by" becomes **Location or transport**. Its error reads "Choose the Family's location or transport."
  - "Add returned batch" becomes **Add returned weight**. The heading stays "Returned items".
  - **Family** and **Senior Box** take capitals in all text volunteers read. Code names are unchanged.

## Alternatives considered

- **A separate list of partner Families:** Keeps partner entries apart from cards, but would repeat the card's fields, rules and screens for the same kind of Family.
- **Keep batches and change only the words:** The least work, but a batch cannot hold the card numbers, sizes, bags and carts the food bank asked for.
- **Give partners their own numbering:** Avoids sharing the card stack, but partner Families take their numbers from the same card stack, so a separate numbering would not match the cards.
- **Let Distribution choose one to three carts:** More flexible, but the number of carts already follows the Family's size, and a free choice lets a cart be forgotten.
- **Require every weight strictly:** More reliable totals, but it blocks Distribution when the scale is down. ADR 0012 rejected this for the same reason.
- **A checkbox for each kind of extra:** Records more detail, but fixes a list of items in the app. One checkbox and a free-text note cover whatever was added.

## Consequences

- Totals count partner cards on the Door Dash and Helping Hands line, with their cart weights. Their TEFAP bags, Senior Boxes and Cheese count with the rest (amending ADR 0012).
- Any partner batches still on the server must be re-entered by hand as partner cards before the upgrade, or the release stops at migration 6. The prototype database had no shifts at the 2026-11-09 drill.
- The cards CSV's column names changed. *Assumed:* nothing reads the CSV automatically yet, so renaming them is safe.
- A write queued on a device running an older version could be refused if it holds weights for more carts than the card now has.
- Weights are still optional in the end, so the totals still count distributed cards without a weight.
