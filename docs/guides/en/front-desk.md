# Front desk guide
**Version 1.1.0** · Food bank shift tracker · 2026-11-11 · For front desk volunteers

---

## AI READING INSTRUCTION

Read `[SPEC]` and `[BUG]` blocks for the steps a volunteer follows and the problems they may meet.
Read `[NOTE]` only if the reason behind a step is needed.
`[?]` blocks are unverified.

---

## 1. Your screen

**[SPEC]**
- Left: the **New card** form.
- Right: the list of today's cards, newest first.

![The front desk screen](../images/front-desk.png)

---

## 2. Entering a Family

**[SPEC]**
1. **Card #**: the yellow ticket at the top shows the number the card will get. Leave **Card #** blank to use it, or type the number on the Family's card.
2. **Info from**: who gave you the Family's details, from the intake computers. Tap their initials if they are already shown, or type new ones (2 to 4 letters) in the box.
3. **# in Family**: type how many people are in the Family.
4. **Location or transport**: tap one: East, West, Around corner, Bus or Walk.
5. Tap **Senior Box** if it applies. **Cheese** comes only with a Senior Box, so it can be tapped once **Senior Box** is ticked. Tap again to undo.
6. **Other**: anything else distribution should know. Optional. It appears on distribution's card as a note from the front desk.
7. Tap **Save card**, which shows the card number, for example **Save card 18**. A green line below confirms what was saved, for example **Saved: Family of 4**.

![A card being entered](../images/front-desk-new-card.png)

**[SPEC]**
- TEFAP bags are worked out for you from the Family size:

| People in Family | TEFAP bags |
|---|---|
| 1 to 4 | 1 |
| 5 to 8 | 2 |
| 9 or more | 3 |

**[NOTE]**
The form clears as soon as you tap **Save card**, so you can start the next Family straight away, even before the last card has finished saving. Initials used earlier in the shift stay as buttons, so you rarely need to type them twice.

**[NOTE]**
Only the initials are recorded, never a volunteer's name. Distribution sees them on the card as **Info from** and the initials.

**[BUG] The card is not saved and asks who the details came from**
Symptom: A message says **Choose who the Family's details came from.**
Cause: No initials were chosen or typed in **Info from**, or the typed initials are not 2 to 4 letters.
Fix: Tap the intake volunteer's initials, or type them, then **Save card** again.

**[BUG] The card is not saved and asks for the location or transport**
Symptom: A message says **Choose the Family's location or transport.**
Cause: Nothing was chosen under **Location or transport**.
Fix: Tap East, West, Around corner, Bus or Walk, then **Save card** again.

**[BUG] A card was not saved because its number is already in use**
Symptom: A red message says the card was not saved because the number is already in use. The Family's details are back in the form.
Cause: That card number was already entered today. Door Dash and Helping Hands Families use numbers from the same card stack.
Fix: Check the number on the Family's card. Type the right number in **Card #**, then **Save card**.

---

## 3. Calling a Family back

**[SPEC]**
- When it is the Family's turn, tap **Call back** on their card, as you would call back to distribution on the radio.
- The card goes to the distribution queue straight away.
- Tapped it by mistake? Tap **Undo call back**.

![Cards called back](../images/front-desk-cards.png)

**[SPEC]**
Each card shows where it is:

| Label | Meaning |
|---|---|
| Waiting | Saved, not yet called back |
| Called back | Called back to distribution, waiting for them to confirm |
| Confirmed | Distribution has checked the card number and details and confirmed them |
| Distributed | Food given out |
| Left without food | The Family left before being served |

**[NOTE]**
A card marked **waiting to send** has no **Call back** button yet. It gets one once the connection returns and the card reaches the server.

---

## 4. Changes from distribution

**[SPEC]**
- If distribution corrects a card, for example the Family size, your list updates by itself.
- If you and distribution change the same card at the same moment, a message asks you to check it. Look at the card again, then make your change.
- Door Dash and Helping Hands Families are entered by distribution at the end of the shift. They are not shown in your list, but they count in the totals.

---

## 5. Totals

**[SPEC]**
- Tap **Totals** at the top to see the shift totals at any time.
- They update live. There is no page footer to add up.
