// The help popouts. Each shows the lines its guide marks `<!-- help:key -->` (ADR 0038).
// A title is also the name of its ? button, so it must not contain another control's name,
// such as "Card #" or "Cheese".
export const HELP_TOPICS = {
  "card-number": { title: "Card numbers", guide: "front-desk" },
  "info-from": { title: "Who gave the details", guide: "front-desk" },
  boxes: { title: "Boxes for seniors", guide: "front-desk" },
  serving: { title: "Serving a Family", guide: "distribution" },
  closing: { title: "Finishing the shift", guide: "distribution" },
  reports: { title: "Reports and past shifts", guide: "admin" },
  accounts: { title: "Sign-ins for staff and stations", guide: "admin" },
  activity: { title: "The record of changes", guide: "admin" },
} as const;

export type HelpTopic = keyof typeof HELP_TOPICS;
