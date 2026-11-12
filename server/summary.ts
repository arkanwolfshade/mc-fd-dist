// Pure and free of server dependencies, so that the client's live summary and the
// server's reports use the same calculation. See ADR 0012.
import { isPartnerMethod } from "./rules.js";

export interface SummaryCard {
  arrivalMethod: string;
  seniorBox: boolean;
  cheese: boolean;
  tefapBags: number;
  status: string;
  loads: readonly (number | null)[];
}

export interface ShiftSummary {
  families: { total: number; cards: number; partners: number; left: number };
  weight: { total: number; cards: number; partners: number };
  returnedWeight: number;
  netWeight: number;
  tefapBags: number;
  seniorBoxes: number;
  cheese: number;
  distributedWithoutWeight: number;
}

export function roundWeight(weight: number): number {
  return Math.round(weight * 100) / 100;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function cartWeight(cards: readonly SummaryCard[]): number {
  return sum(cards.flatMap((card) => card.loads.map((load) => load ?? 0)));
}

export function shiftSummary(
  allCards: readonly SummaryCard[],
  returnedBatches: readonly { weight: number }[],
): ShiftSummary {
  // A family who left without food was not served, so they count only on their own line.
  const left = allCards.filter((card) => card.status === "left").length;
  const cards = allCards.filter((card) => card.status !== "left");
  // Door Dash and Helping Hands Families are cards too, shown on their own line. See ADR 0023.
  const partnerCards = cards.filter((card) => isPartnerMethod(card.arrivalMethod));
  const walkInCards = cards.filter((card) => !isPartnerMethod(card.arrivalMethod));
  const cardWeight = cartWeight(walkInCards);
  const partnerWeight = cartWeight(partnerCards);
  const returnedWeight = sum(returnedBatches.map((batch) => batch.weight));

  return {
    families: {
      total: cards.length,
      cards: walkInCards.length,
      partners: partnerCards.length,
      left,
    },
    weight: {
      total: roundWeight(cardWeight + partnerWeight),
      cards: roundWeight(cardWeight),
      partners: roundWeight(partnerWeight),
    },
    returnedWeight: roundWeight(returnedWeight),
    netWeight: roundWeight(cardWeight + partnerWeight - returnedWeight),
    tefapBags: sum(cards.map((card) => card.tefapBags)),
    seniorBoxes: cards.filter((card) => card.seniorBox).length,
    cheese: cards.filter((card) => card.cheese).length,
    distributedWithoutWeight: cards.filter(
      (card) => card.status === "distributed" && card.loads.every((load) => load === null),
    ).length,
  };
}
