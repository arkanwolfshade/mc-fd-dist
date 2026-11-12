# Distribution guide
**Version 1.1.0** · Food bank shift tracker · 2026-11-11 · For distribution volunteers

---

## AI READING INSTRUCTION

Read `[SPEC]` and `[BUG]` blocks for the steps a volunteer follows and the problems they may meet.
Read `[NOTE]` only if the reason behind a step is needed.
`[?]` blocks are unverified.

---

## 1. Your screen

**[SPEC]**
- **Queue**: Families called back by the front desk, with their details and any note from the front desk.
- Each card leads with the Family's yellow ticket number, then **Info from** with the initials of the intake volunteer who gave the details, then a **Give** line listing the TEFAP bags, Senior Box and Cheese to hand over.
- **Distributed**: Families served today, with the weight they received and any extras added.
- **Returned items**, **End of shift: Door Dash and Helping Hands** and **Finish** are further along.

![The distribution screen](../images/distribution.png)

**[NOTE]**
You never type a walk-in Family's details. They arrive from the front desk. Only Door Dash and Helping Hands Families are entered here, at the end of the shift.

---

## 2. Serving a Family

**[SPEC]**
1. When the front desk calls a card back, check its number and details against the call, then tap **Confirm card** with its number, for example **Confirm card 16**. The front desk sees the card confirmed.
2. Enter the weight of each cart: **Cart 1 (lb)**, and **Cart 2 (lb)** and **Cart 3 (lb)** if shown. The card shows one cart for each TEFAP bag. They are added up for you.
3. For a Family of 5 to 7, 9 to 11, or 13 or more, tick **Extras added** once you have added the extras. Under **What was added**, you can note what they were, for example meat, deli or bakery. The note is optional.
4. Tap **Mark distributed**.

A note from the front desk, if there is one, appears in yellow under the card's details.

![Weights entered for a Family](../images/distribution-weights.png)

**[SPEC]**
- The number of carts follows the Family size:

| People in Family | Carts |
|---|---|
| 1 to 4 | 1 |
| 5 to 8 | 2 |
| 9 or more | 3 |

**[SPEC]**
- The Family moves to **Distributed**, with their total weight and any extras added.
- Tapped by mistake? **Undo confirm** takes a confirmed card back. **Undo** on a distributed card takes it back to confirmed.

![Families served today](../images/distribution-done.png)

**[BUG] A yellow box appears instead of marking the Family distributed**
Symptom: A yellow box lists what is missing, for example **Cart 2 has no weight.** or **Extras added is not ticked.**
Cause: A cart shown has no weight, or the Family's extras were not ticked.
Fix: Tap **Go back**, enter the weights or tick **Extras added**, then **Mark distributed** again. Only tap **Mark distributed anyway** if the food truly was not weighed, or the Family truly got no extras. The totals will then show that a card has no weight.

![The warning before marking distributed](../images/distribution-no-weight.png)

**[NOTE]**
A typed zero counts as a weight.

---

## 3. Correcting a card

**[SPEC]**
- If the Family size, location or transport, Senior Box or Cheese is wrong, tap **Correct details**.
- Make the change, then tap **Save correction**.
- TEFAP bags and carts are worked out again. The front desk sees the change straight away.

![Correcting a card](../images/distribution-correct.png)

---

## 4. A Family who leaves without food

**[SPEC]**
- It is recorded when closing the shift, not during it. Closing lists every card not yet distributed: for a Family who left, tap **Left without food**, then **Yes, left without food**.
- The card leaves the queue and moves to the **Distributed** list, marked **Left without food**.
- The Family is not counted as served. Totals show them on their own line, **Left without food**.
- Recorded by mistake? Tap **Undo** on that card. It goes back to the front desk, which taps **Call back** again when the Family is ready.

**[NOTE]**
Only distribution and staff can record this. A card entered by mistake, such as a duplicate, is different: ask staff to delete it.

---

## 5. Returned items

**[SPEC]**
- When items come back, enter their weight under **Returned items** and tap **Add returned weight**.
- Each weight is separate. Returned items are not tied to any card.
- Entered by mistake? Tap **Remove** next to it.

![A returned weight](../images/distribution-returned.png)

---

## 6. End of shift: Door Dash and Helping Hands

**[SPEC]**
- At the end of the shift, enter each Door Dash and Helping Hands Family under **End of shift: Door Dash and Helping Hands**, one at a time.
- For each Family:
  1. Tap **Door Dash** or **Helping Hands**.
  2. **Card #**: the number on the Family's card. Partner Families use the same card stack as the front desk.
  3. **# in Family**: how many people. TEFAP bags are worked out for you.
  4. Tap **Senior Box**, and **Cheese**, if they apply.
  5. **Extras added** and **What was added**, if shown.
  6. Enter the weight of each cart shown.
  7. Tap **Add partner Family**.
- Each Family is saved as distributed and listed below the form. They never go into the queue.

![A Door Dash Family](../images/distribution-last-cards.png)

**[NOTE]**
Door Dash and Helping Hands Families do not pass the intake computers, so their cards have no **Info from** initials.

**[BUG] A partner Family was not saved because its number is already in use**
Symptom: A red message says the number is already in use.
Cause: That card number was already entered today, at the front desk or here.
Fix: Check the number on the Family's card, type the right one in **Card #**, then **Add partner Family** again.

---

## 7. Totals

**[SPEC]**
- Tap **Totals** at the top to see the shift totals.

| Total | How it is worked out |
|---|---|
| Total # of Families | Cards entered at the front desk, plus Door Dash and Helping Hands Families. Families who left without food are not included |
| Left without food | Cards recorded as leaving without food |
| Total weight | Cart weights of every Family, with Door Dash and Helping Hands shown on their own line |
| Total return weight | All returned weights |
| Net weight | Total weight minus return weight |
| TEFAP bags, Senior Boxes, Cheese | Counted from the cards of Families served, including Door Dash and Helping Hands |

![Shift totals](../images/totals.png)

**[NOTE]**
A card entered at the front desk counts as a Family even before it is distributed. By the end of the shift, every card should be either distributed or recorded as left without food.

---

## 8. Closing the shift

**[SPEC]**
- When the last Family is served and every Door Dash and Helping Hands Family is entered, tap **Close shift** under **Finish**.
- If any card has not been distributed, the app lists it. Correct each one before closing:
  - the Family was served: go back to the queue and finish their card;
  - the Family left: tap **Left without food**;
  - the card was entered by mistake: staff can **Delete** it.
- Then tap **Yes, close the shift**.
- Both stations lock and show the final totals.
- Only staff can reopen a closed shift.
- A shift left open closes by itself overnight.

![Closing the shift](../images/close-shift.png)

![A closed shift, as both stations see it](../images/shift-closed.png)

**[BUG] Something needs fixing after the shift was closed**
Symptom: The screens say **This shift is closed**, and nothing can be changed.
Cause: The shift was closed.
Fix: Ask staff to reopen it from the Admin screen. Make the correction, then close it again.
