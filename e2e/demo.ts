// Walks through one whole shift in real browser windows, side by side, for showing the app
// to people. It uses the real server and client with made-up data in a temporary database.
// The front desk is on the left and distribution on the right. An admin window opens over
// the front desk when an admin is needed.
//
//   npm run demo
//
// DEMO_STEP_SECONDS sets the shortest time each step is shown before it happens (default 4).
// DEMO_HEADLESS=true runs it without windows, to check that the script still works.
// DEMO_VIDEO_DIR=<folder> records each window to a .webm file in that folder. The windows
// close by themselves at the end, so that the videos are saved.
// DEMO_VIDEO_SIZE=<width>x<height> sets the video size (default 960x1040, or the window size
// when headless).
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, expect } from "@playwright/test";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { createAccount } from "../server/accounts.js";
import { buildApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";

const STEP_MS = Number(process.env.DEMO_STEP_SECONDS ?? 4) * 1000;
const HEADLESS = process.env.DEMO_HEADLESS === "true";
const SETTLE_MS = STEP_MS > 0 ? 1500 : 0;
const TYPING_DELAY_MS = STEP_MS > 0 ? 150 : 0;
const HEADLESS_VIEWPORT = { width: 720, height: 850 };
const VIDEO_DIR = process.env.DEMO_VIDEO_DIR ? resolve(process.env.DEMO_VIDEO_DIR) : undefined;
const VIDEO_SIZE = videoSize(process.env.DEMO_VIDEO_SIZE);

function videoSize(setting: string | undefined): { width: number; height: number } {
  const match = setting?.match(/^(\d+)x(\d+)$/);
  if (match) return { width: Number(match[1]), height: Number(match[2]) };
  return HEADLESS ? HEADLESS_VIEWPORT : { width: 960, height: 1040 };
}

interface Station {
  name: string;
  file: string;
  context: BrowserContext;
  page: Page;
}

interface Step {
  station: Station;
  say: string;
  target?: () => Locator;
  act?: () => Promise<void>;
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

// Long captions need longer than the minimum, at a comfortable 200 words per minute.
function readingTime(caption: string): number {
  return STEP_MS > 0 ? Math.max(STEP_MS, caption.split(" ").length * 300) : 0;
}

async function openStation(
  browser: Browser,
  name: string,
  url: string,
  side: "left" | "right",
): Promise<Station> {
  const context = await browser.newContext({
    ...(HEADLESS ? { viewport: HEADLESS_VIEWPORT } : { viewport: null }),
    ...(VIDEO_DIR ? { recordVideo: { dir: VIDEO_DIR, size: VIDEO_SIZE } } : {}),
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`${name} page error: ${error.message}`));
  if (!HEADLESS) await moveWindow(page, side);
  await page.goto(url);
  const file = `demo-${name.toLowerCase().replaceAll(" ", "-")}.webm`;
  return { name, file, context, page };
}

async function moveWindow(page: Page, side: "left" | "right"): Promise<void> {
  const screen = await page.evaluate(() => ({
    width: window.screen.availWidth,
    height: window.screen.availHeight,
  }));
  const width = Math.floor(screen.width / 2);
  const cdp = await page.context().newCDPSession(page);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", {
    windowId,
    bounds: { left: side === "left" ? 0 : width, top: 0, width, height: screen.height },
  });
  await cdp.detach();
}

// The caption is added by this script and is not part of the app.
async function showCaption(
  page: Page,
  caption: { title: string; text: string; acting: boolean },
): Promise<void> {
  await page.evaluate(({ title, text, acting }) => {
    let bar = document.getElementById("demo-caption");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "demo-caption";
      bar.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:1000;padding:12px 16px;" +
        "font:18px/1.35 system-ui,sans-serif;pointer-events:none;box-shadow:0 -2px 8px #0005";
      document.body.append(bar);
      document.body.style.paddingBottom = "150px";
    }
    bar.style.background = acting ? "#1c5d99" : "#495057";
    bar.style.color = "#fff";
    bar.replaceChildren();
    const heading = document.createElement("div");
    heading.style.cssText = "font-size:14px;font-weight:700;letter-spacing:.03em";
    heading.textContent = title;
    const body = document.createElement("div");
    body.textContent = text;
    bar.append(heading, body);
  }, caption);
}

async function highlight(target: Locator): Promise<void> {
  await target.evaluate((element: HTMLElement) => {
    element.scrollIntoView({ block: "center" });
    element.dataset.demoHighlight = "true";
    element.style.outline = "4px solid #f59f00";
    element.style.outlineOffset = "3px";
  });
}

async function clearHighlights(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>("[data-demo-highlight]")) {
      delete element.dataset.demoHighlight;
      element.style.outline = "";
      element.style.outlineOffset = "";
    }
  });
}

// What the sections of the walkthrough share: the three stations, and the ways of finding
// things on their screens.
interface Scene {
  frontDesk: Station;
  distribution: Station;
  admin: Station;
  fd: Page;
  dist: Page;
  adm: Page;
  type: (target: Locator, text: string) => Promise<void>;
  ticket: (page: Page, number: number) => Locator;
  fdCard: (number: number, page?: Page) => Locator;
  queueCard: (number: number) => Locator;
  doneCard: (number: number) => Locator;
  infoFrom: Locator;
  returned: Locator;
  partners: Locator;
  partnerRow: (number: number) => Locator;
  finish: Locator;
  closing: Locator;
  reports: Locator;
  newAdmin: Locator;
  samRow: Locator;
  signIn: (station: Station, username: string, say: string) => Step;
  stationSignIn: string;
  // Set when the card typed during the Wi-Fi dropout is saved on the device.
  offline: { number: number };
}

// Starting the shift.
function startingTheShift(scene: Scene): Step[] {
  const { frontDesk, distribution, fd, dist, signIn, stationSignIn } = scene;
  return [
    {
      station: frontDesk,
      say: "This walkthrough follows one whole shift with made-up data. The left window is the front desk and the right window is distribution, as if on two separate devices.",
    },
    signIn(frontDesk, "front-desk", stationSignIn),
    signIn(distribution, "distribution", stationSignIn),
    {
      station: frontDesk,
      say: "The first station to start opens today's shift. There is one shift per date.",
      target: () => fd.getByRole("button", { name: "Open today's shift" }),
      act: () => fd.getByRole("button", { name: "Open today's shift" }).click(),
    },
    {
      station: distribution,
      say: "Distribution sees the shift open by itself, with an empty queue and no reload.",
      target: () => dist.getByRole("heading", { name: "Queue (0)" }),
    },
  ];
}

// The front desk enters Families.
function frontDeskEntersFamilies(scene: Scene): Step[] {
  const { frontDesk, fd, type, infoFrom } = scene;
  return [
    {
      station: frontDesk,
      say: "The yellow ticket shows the next card number. Leave Card # blank to use it, or type the number on the Family's card.",
      target: () => fd.locator(".next-card"),
    },
    {
      station: frontDesk,
      say: "A Family of 5 arrives. TEFAP bags are worked out from the size: 1 to 4 people get 1 bag, 5 to 8 get 2, and 9 or more get 3.",
      target: () => fd.getByLabel("# in Family"),
      act: () => type(fd.getByLabel("# in Family"), "5"),
    },
    {
      station: frontDesk,
      say: "One tap records the Family's location or transport: East, West, Around corner, Bus or Walk. They parked East.",
      target: () => fd.getByRole("group", { name: "Location or transport" }),
      act: () => fd.getByRole("button", { name: "East", exact: true }).click(),
    },
    {
      station: frontDesk,
      say: "Cheese comes only with a Senior Box, so it can't be tapped until Senior Box is ticked. This Family gets both.",
      target: () => fd.getByRole("button", { name: "Cheese" }),
      act: async () => {
        await fd.getByRole("button", { name: "Senior Box" }).click();
        await fd.getByRole("button", { name: "Cheese" }).click();
      },
    },
    {
      station: frontDesk,
      say: "Other is for anything distribution should know. It will stand out on their card as a note from the front desk.",
      target: () => fd.getByLabel("Other"),
      act: () => type(fd.getByLabel("Other"), "Needs help carrying to the car"),
    },
    {
      station: frontDesk,
      say: "Info from records which intake volunteer gave these details, by their initials only. It is required. AB is new this shift, so it is typed.",
      target: () => infoFrom,
      act: () => type(fd.getByLabel("New initials"), "AB"),
    },
    {
      station: frontDesk,
      say: "Saving enters the card once. The green line confirms what was saved, and the form clears for the next Family.",
      target: () => fd.getByRole("button", { name: "Save card 1" }),
      act: async () => {
        await fd.getByRole("button", { name: "Save card 1" }).click();
        await expect(fd.locator(".saved")).toBeVisible();
        await highlight(fd.locator(".saved"));
      },
    },
    {
      station: frontDesk,
      say: "A Family of 9 walks in with a Senior Box: 3 TEFAP bags. AB's initials now have a quick button, so one tap fills them in.",
      target: () => infoFrom,
      act: async () => {
        await type(fd.getByLabel("# in Family"), "9");
        await fd.getByRole("button", { name: "Walk", exact: true }).click();
        await fd.getByRole("button", { name: "Senior Box" }).click();
        await infoFrom.getByRole("button", { name: "AB", exact: true }).click();
        await fd.getByRole("button", { name: "Save card 2" }).click();
      },
    },
    {
      station: frontDesk,
      say: "A Family of 6 parked around the corner. Their details came from a second intake volunteer, CD.",
      target: () => fd.getByLabel("New initials"),
      act: async () => {
        await type(fd.getByLabel("# in Family"), "6");
        await fd.getByRole("button", { name: "Around corner", exact: true }).click();
        await type(fd.getByLabel("New initials"), "CD");
        await fd.getByRole("button", { name: "Save card 3" }).click();
      },
    },
    {
      station: frontDesk,
      say: "By mistake, the same Family is entered a second time, as card 4. An admin will remove it later.",
      target: () => infoFrom,
      act: async () => {
        await type(fd.getByLabel("# in Family"), "6");
        await fd.getByRole("button", { name: "Around corner", exact: true }).click();
        await infoFrom.getByRole("button", { name: "CD", exact: true }).click();
        await fd.getByRole("button", { name: "Save card 4" }).click();
        await expect(fd.getByRole("heading", { name: "Cards (4)" })).toBeVisible();
      },
    },
  ];
}

// Calling back.
function callingBack(scene: Scene): Step[] {
  const { frontDesk, fdCard } = scene;
  return [
    {
      station: frontDesk,
      say: "When it is a Family's turn, the front desk taps Call back, as on the radio. Here card 2 is called by mistake.",
      target: () => fdCard(2).getByRole("button", { name: "Call back" }),
      act: () => fdCard(2).getByRole("button", { name: "Call back" }).click(),
    },
    {
      station: frontDesk,
      say: "Undo call back sends the card back to waiting, and it leaves distribution's queue.",
      target: () => fdCard(2).getByRole("button", { name: "Undo call back" }),
      act: () => fdCard(2).getByRole("button", { name: "Undo call back" }).click(),
    },
    {
      station: frontDesk,
      say: "Card 1 is called back instead.",
      target: () => fdCard(1).getByRole("button", { name: "Call back" }),
      act: () => fdCard(1).getByRole("button", { name: "Call back" }).click(),
    },
  ];
}

// Distribution serves the first Family.
function firstFamilyServed(scene: Scene): Step[] {
  const { frontDesk, distribution, type, fdCard, queueCard, doneCard } = scene;
  return [
    {
      station: distribution,
      say: "The card appears in distribution's queue straight away, with what to give on its own line, who the details came from, and the front desk's note.",
      target: () => queueCard(1),
    },
    {
      station: distribution,
      say: "Distribution checks the card number and details against the call back, then confirms.",
      target: () => queueCard(1).getByRole("button", { name: "Confirm card 1" }),
      act: () => queueCard(1).getByRole("button", { name: "Confirm card 1" }).click(),
    },
    {
      station: frontDesk,
      say: "The front desk sees the card confirmed on its own list.",
      target: () => fdCard(1).locator(".status.confirmed"),
    },
    {
      station: distribution,
      say: "There is one cart weight for each TEFAP bag, so this Family of 5 has two carts.",
      target: () => queueCard(1).getByLabel("Cart 1 (lb)"),
      act: async () => {
        await type(queueCard(1).getByLabel("Cart 1 (lb)"), "12.5");
        await type(queueCard(1).getByLabel("Cart 2 (lb)"), "8");
      },
    },
    {
      station: distribution,
      say: "Families of 5 to 7, 9 to 11, and 13 or more can get extras, such as meat, deli or bakery. Distribution ticks Extras added and notes what was added.",
      target: () => queueCard(1).getByLabel("Extras added"),
      act: async () => {
        await queueCard(1).getByLabel("Extras added").check();
        await type(queueCard(1).getByLabel("What was added"), "Bakery bread");
      },
    },
    {
      station: distribution,
      say: "Everything is filled in, so Mark distributed moves the card straight to the distributed list, with its 20.5 lb and the extras.",
      target: () => queueCard(1).getByRole("button", { name: "Mark distributed" }),
      act: async () => {
        await queueCard(1).getByRole("button", { name: "Mark distributed" }).click();
        await highlight(doneCard(1));
      },
    },
  ];
}

// A correction and the warnings.
function correctionAndWarnings(scene: Scene): Step[] {
  const { frontDesk, distribution, type, fdCard, queueCard } = scene;
  return [
    {
      station: frontDesk,
      say: "The front desk calls back cards 2 and 3.",
      act: async () => {
        await fdCard(2).getByRole("button", { name: "Call back" }).click();
        await fdCard(3).getByRole("button", { name: "Call back" }).click();
      },
    },
    {
      station: distribution,
      say: "Card 2's Family says there are really 8 of them, not 9. Distribution can correct the card.",
      target: () => queueCard(2).getByRole("button", { name: "Correct details" }),
      act: async () => {
        await queueCard(2).getByRole("button", { name: "Correct details" }).click();
        await queueCard(2).locator(".correct").getByLabel("# in Family").fill("8");
      },
    },
    {
      station: distribution,
      say: "Saving the correction changes TEFAP bags from 3 to 2 by themselves, and so the number of carts too.",
      target: () => queueCard(2).getByRole("button", { name: "Save correction" }),
      act: () => queueCard(2).getByRole("button", { name: "Save correction" }).click(),
    },
    {
      station: frontDesk,
      say: "The front desk sees the correction too, so both stations always share one record.",
      target: () => fdCard(2).filter({ hasText: "Family of 8" }),
    },
    {
      station: distribution,
      say: "Distribution confirms card 2 but enters only the first cart before tapping Mark distributed.",
      target: () => queueCard(2).getByRole("button", { name: "Confirm card 2" }),
      act: async () => {
        await queueCard(2).getByRole("button", { name: "Confirm card 2" }).click();
        await type(queueCard(2).getByLabel("Cart 1 (lb)"), "30");
        await queueCard(2).getByRole("button", { name: "Mark distributed" }).click();
      },
    },
    {
      station: distribution,
      say: "The app names what is missing before the card moves on. Go back keeps the card in the queue.",
      target: () => queueCard(2).locator(".confirm"),
      act: () => queueCard(2).getByRole("button", { name: "Go back" }).click(),
    },
    {
      station: distribution,
      say: "The second cart is weighed, and now the card is marked distributed without a warning.",
      target: () => queueCard(2).getByLabel("Cart 2 (lb)"),
      act: async () => {
        await type(queueCard(2).getByLabel("Cart 2 (lb)"), "12");
        await queueCard(2).getByRole("button", { name: "Mark distributed" }).click();
      },
    },
    {
      station: distribution,
      say: "Card 3, a Family of 6, has both carts weighed, but Extras added is not ticked.",
      target: () => queueCard(3),
      act: async () => {
        await queueCard(3).getByRole("button", { name: "Confirm card 3" }).click();
        await type(queueCard(3).getByLabel("Cart 1 (lb)"), "15");
        await type(queueCard(3).getByLabel("Cart 2 (lb)"), "10");
        await queueCard(3).getByRole("button", { name: "Mark distributed" }).click();
      },
    },
    {
      station: distribution,
      say: "If no extras were available this time, Mark distributed anyway goes ahead after all.",
      target: () => queueCard(3).locator(".confirm"),
      act: () => queueCard(3).getByRole("button", { name: "Mark distributed anyway" }).click(),
    },
  ];
}

// An admin removes the duplicate card.
function adminRemovesDuplicate(scene: Scene): Step[] {
  const { frontDesk, admin, fd, adm, fdCard, signIn } = scene;
  return [
    signIn(
      admin,
      "pat",
      "Staff have their own admin sign-in. An admin window opens over the front desk to remove the duplicate card 4.",
    ),
    {
      station: admin,
      say: "Only an admin sees Delete. It asks once more, because deleting cannot be undone.",
      target: () => fdCard(4, adm).getByRole("button", { name: "Delete" }),
      act: async () => {
        await fdCard(4, adm).getByRole("button", { name: "Delete" }).click();
        await highlight(fdCard(4, adm));
      },
    },
    {
      station: admin,
      say: "Confirming removes the card at every station. Recent activity keeps a record of what it held.",
      target: () => fdCard(4, adm).getByRole("button", { name: "Yes, delete" }),
      act: () => fdCard(4, adm).getByRole("button", { name: "Yes, delete" }).click(),
    },
    {
      station: frontDesk,
      say: "Back at the front desk, card 4 has gone from the list.",
      target: () => fd.getByRole("heading", { name: "Cards (3)" }),
    },
  ];
}

// A Wi-Fi dropout.
function wifiDropout(scene: Scene): Step[] {
  const { frontDesk, fd, type, fdCard, infoFrom, offline } = scene;
  return [
    {
      station: frontDesk,
      say: "What if the Wi-Fi drops? Here the front desk loses its connection, and a warning appears.",
      act: async () => {
        await fd.context().setOffline(true);
        await expect(fd.getByText("Connection lost")).toBeVisible();
      },
    },
    {
      station: frontDesk,
      say: "The line keeps moving. A Family of 2 arrives by bus, and the card is saved on this device.",
      target: () => fd.getByLabel("# in Family"),
      act: async () => {
        await type(fd.getByLabel("# in Family"), "2");
        await fd.getByRole("button", { name: "Bus", exact: true }).click();
        await infoFrom.getByRole("button", { name: "AB", exact: true }).click();
        await fd.getByRole("button", { name: "Save card" }).click();
        await expect(fd.locator(".pending-card")).toBeVisible();
        offline.number = Number(await fd.locator(".pending-card .ticket").textContent());
      },
    },
    {
      station: frontDesk,
      say: "The card is marked as waiting to send, so nobody mistakes it for one that has arrived.",
      target: () => fd.locator(".pending-card"),
    },
    {
      station: frontDesk,
      say: "When the connection returns, waiting entries are sent by themselves, in order and without duplicates.",
      act: async () => {
        await fd.context().setOffline(false);
        await expect(fd.getByText("waiting to send")).toHaveCount(0, { timeout: 15000 });
      },
    },
    {
      station: frontDesk,
      say: "The card is now a normal card on the shared record, waiting to be called back.",
      target: () => fdCard(offline.number).locator(".status.entered"),
    },
  ];
}

// Returned items.
function returnedItems(scene: Scene): Step[] {
  const { distribution, type, returned } = scene;
  return [
    {
      station: distribution,
      say: "Returned items are weighed through the shift and added with Add returned weight. They are not tied to a card.",
      target: () => returned.getByLabel("Weight (lb)"),
      act: async () => {
        await type(returned.getByLabel("Weight (lb)"), "3.5");
        await returned.getByRole("button", { name: "Add returned weight" }).click();
        // The form clears once the first weight is saved, so the second waits for that.
        await expect(returned.locator("li").filter({ hasText: /^3\.5 lb/ })).toBeVisible();
        await type(returned.getByLabel("Weight (lb)"), "2");
        await returned.getByRole("button", { name: "Add returned weight" }).click();
        await expect(returned.locator("li").filter({ hasText: /^2 lb/ })).toBeVisible();
      },
    },
    {
      station: distribution,
      say: "The 2 lb entry was a mistake, so Remove takes it away.",
      target: () => returned.locator("li").filter({ hasText: /^2 lb/ }),
      act: () =>
        returned
          .locator("li")
          .filter({ hasText: /^2 lb/ })
          .getByRole("button", { name: "Remove" })
          .click(),
    },
  ];
}

// Door Dash and Helping Hands.
function partnerFamilies(scene: Scene): Step[] {
  const { distribution, type, partners, partnerRow } = scene;
  return [
    {
      station: distribution,
      say: "At the end of the shift, distribution enters each Door Dash and Helping Hands Family as a card, from the same card stack. This Door Dash Family of 4 has card 50 and one cart.",
      target: () => partners,
      act: async () => {
        await partners.getByRole("button", { name: "Door Dash", exact: true }).click();
        await type(partners.getByLabel("Card #"), "50");
        await type(partners.getByLabel("# in Family"), "4");
        await type(partners.getByLabel("Cart 1 (lb)"), "40");
        await partners.getByRole("button", { name: "Add partner Family" }).click();
        await expect(partnerRow(50)).toBeVisible();
      },
    },
    {
      station: distribution,
      say: "A Helping Hands Family of 6 has card 51, two carts, and the extras check, as at the queue.",
      target: () => partners.getByRole("button", { name: "Add partner Family" }),
      act: async () => {
        await partners.getByRole("button", { name: "Helping Hands", exact: true }).click();
        await type(partners.getByLabel("Card #"), "51");
        await type(partners.getByLabel("# in Family"), "6");
        await type(partners.getByLabel("Cart 1 (lb)"), "20");
        await type(partners.getByLabel("Cart 2 (lb)"), "15");
        await partners.getByLabel("Extras added").check();
        await type(partners.getByLabel("What was added"), "Meat");
        await partners.getByRole("button", { name: "Add partner Family" }).click();
        await expect(partnerRow(51)).toBeVisible();
      },
    },
    {
      station: distribution,
      say: "Both partner Families are listed here. They never pass the front desk, so they stay off its list.",
      target: () => partnerRow(51),
    },
  ];
}

// Live totals.
function liveTotals(scene: Scene): Step[] {
  const { frontDesk, fd, dist } = scene;
  return [
    {
      station: frontDesk,
      say: "Nobody adds up pages by hand any more. Both stations can open the same live totals at any time.",
      target: () => fd.getByRole("button", { name: "Totals", exact: true }),
      act: async () => {
        await fd.getByRole("button", { name: "Totals", exact: true }).click();
        await dist.getByRole("button", { name: "Totals", exact: true }).click();
      },
    },
    {
      station: frontDesk,
      say: "Door Dash and Helping Hands have their own lines under Families and weight: 2 Families and 75 lb.",
      target: () => fd.locator(".totals"),
    },
  ];
}

// Closing: a Family who left, and its undo.
function closingTheShift(scene: Scene): Step[] {
  const { frontDesk, distribution, fd, dist, type, fdCard, queueCard, finish, closing, offline } =
    scene;
  return [
    {
      station: distribution,
      say: "Before closing, distribution taps Close shift. The warning lists every card not yet marked distributed.",
      act: async () => {
        await dist.getByRole("button", { name: "Distribution", exact: true }).click();
        await finish.getByRole("button", { name: "Close shift" }).click();
        await highlight(closing);
      },
    },
    {
      station: distribution,
      say: "The Family of 2 left before being served. Left without food records that, and they are counted on their own line.",
      target: () => closing.getByRole("button", { name: "Left without food" }),
      act: async () => {
        await closing.getByRole("button", { name: "Left without food" }).click();
        await closing.getByRole("button", { name: "Yes, left without food" }).click();
      },
    },
    {
      station: distribution,
      say: "But the Family comes back after all. Distribution keeps the shift open for them.",
      target: () => closing.getByRole("button", { name: "Keep it open" }),
      act: () => closing.getByRole("button", { name: "Keep it open" }).click(),
    },
    {
      station: distribution,
      say: "Undo on the left-without-food card sends it back to the front desk as waiting.",
      target: () => dist.locator(".cards > li", { hasText: "Left without food" }),
      act: () =>
        dist
          .locator(".cards > li", { hasText: "Left without food" })
          .getByRole("button", { name: "Undo" })
          .click(),
    },
    {
      station: frontDesk,
      say: "The front desk calls them back again.",
      act: async () => {
        await fd.getByRole("button", { name: "Front desk", exact: true }).click();
        await fdCard(offline.number).getByRole("button", { name: "Call back" }).click();
      },
    },
    {
      station: distribution,
      say: "Distribution confirms, weighs their one cart at 9 lb, and marks them distributed.",
      target: () => queueCard(offline.number),
      act: async () => {
        const card = queueCard(offline.number);
        await card.getByRole("button", { name: `Confirm card ${offline.number}` }).click();
        await type(card.getByLabel("Cart 1 (lb)"), "9");
        await card.getByRole("button", { name: "Mark distributed" }).click();
        await expect(dist.getByRole("heading", { name: "Queue (0)" })).toBeVisible();
      },
    },
    {
      station: distribution,
      say: "Every Family is served, so closing has nothing to warn about. It must still be confirmed, and only an admin can reopen the shift.",
      target: () => finish.getByRole("button", { name: "Close shift" }),
      act: () => finish.getByRole("button", { name: "Close shift" }).click(),
    },
    {
      station: distribution,
      say: "Confirming locks the shift.",
      target: () => dist.getByRole("button", { name: "Yes, close the shift" }),
      act: () => dist.getByRole("button", { name: "Yes, close the shift" }).click(),
    },
    {
      station: frontDesk,
      say: "Both stations lock at once and show the final totals: 6 Families, 171.5 lb out, 3.5 lb back, so 168 lb net. TEFAP bags, Senior Boxes and Cheese are counted too.",
      target: () => fd.getByText("This shift is closed"),
    },
  ];
}

// The admin screen.
function adminScreen(scene: Scene): Step[] {
  const { admin, adm, type, reports, newAdmin, samRow } = scene;
  return [
    {
      station: admin,
      say: "The Admin screen gives totals over any range of dates. Show totals lists each shift, and a closed shift can be reopened to correct it.",
      act: async () => {
        await adm.getByRole("button", { name: "Admin", exact: true }).click();
        await reports.getByRole("button", { name: "Show totals" }).click();
        await expect(reports.getByText("All shifts in range")).toBeVisible();
        await highlight(reports.locator(".report-combined"));
      },
    },
    {
      station: admin,
      say: "Two downloads open in a spreadsheet: one row per shift, or one row per card with its carts, extras and intake initials.",
      target: () => reports.getByRole("link", { name: "Download cards (CSV)" }),
    },
    {
      station: admin,
      say: "Admins manage sign-ins. Here a new admin, sam, is added.",
      target: () => newAdmin,
      act: async () => {
        await type(newAdmin.getByLabel("Username"), "sam");
        await newAdmin.getByLabel("Password").fill(randomBytes(12).toString("base64url"));
        await newAdmin.getByRole("button", { name: "Add admin" }).click();
        await expect(samRow).toBeVisible();
      },
    },
    {
      station: admin,
      say: "Change password sets a new one. Changing a station's password signs that station out on every device.",
      target: () => samRow.getByRole("button", { name: "Change password" }),
      act: async () => {
        await samRow.getByRole("button", { name: "Change password" }).click();
        await samRow.getByLabel("New password").fill(randomBytes(12).toString("base64url"));
        await samRow.getByRole("button", { name: "Save password" }).click();
        await expect(adm.getByText("Password changed for sam")).toBeVisible();
      },
    },
    {
      station: admin,
      say: "Remove takes away an admin who no longer needs access. Nobody can remove themselves.",
      target: () => samRow.getByRole("button", { name: "Remove" }),
      act: async () => {
        await samRow.getByRole("button", { name: "Remove" }).click();
        await samRow.getByRole("button", { name: "Yes, remove" }).click();
        await expect(samRow).toHaveCount(0);
      },
    },
    {
      station: admin,
      say: "Recent activity shows which station or admin made each change.",
      target: () => adm.locator("section.panel", { hasText: "Recent activity" }),
    },
  ];
}

// Help.
function helpScreen(scene: Scene): Step[] {
  const { frontDesk, distribution, fd, dist } = scene;
  return [
    {
      station: frontDesk,
      say: "Every station has a Help tab with its own guide, which works even during a Wi-Fi dropout.",
      target: () => fd.getByRole("button", { name: "Help", exact: true }),
      act: async () => {
        await fd.getByRole("button", { name: "Help", exact: true }).click();
        await expect(fd.locator(".guide")).toBeVisible();
      },
    },
    {
      station: frontDesk,
      say: "Getting started explains signing in, opening the shift and what to do if the Wi-Fi drops.",
      target: () => fd.getByRole("button", { name: "Getting started" }),
      act: () => fd.getByRole("button", { name: "Getting started" }).click(),
    },
    {
      station: distribution,
      say: "Distribution's Help tab opens the distribution guide.",
      target: () => dist.getByRole("button", { name: "Help", exact: true }),
      act: async () => {
        await dist.getByRole("button", { name: "Help", exact: true }).click();
        await expect(dist.locator(".guide")).toBeVisible();
      },
    },
  ];
}

async function run(
  frontDesk: Station,
  distribution: Station,
  admin: Station,
  password: string,
): Promise<void> {
  const fd = frontDesk.page;
  const dist = distribution.page;
  const adm = admin.page;
  const type = (target: Locator, text: string) =>
    target.pressSequentially(text, { delay: TYPING_DELAY_MS });
  // Cards are found by the number on their ticket.
  const ticket = (page: Page, number: number) =>
    page.locator(".ticket").filter({ hasText: new RegExp(`^${number}$`) });
  const fdCard = (number: number, page = fd) =>
    page.locator(".cards > li").filter({ has: ticket(page, number) });
  const queueCard = (number: number) =>
    dist.locator(".queue-card").filter({ has: ticket(dist, number) });
  const doneCard = (number: number) =>
    dist
      .locator("section", { hasText: "Distributed (" })
      .locator("li")
      .filter({ has: ticket(dist, number) });
  const infoFrom = fd.getByRole("group", { name: "Info from" });
  const returned = dist.locator("section", { hasText: "Returned items" });
  const partners = dist.locator("section", { hasText: "End of shift" });
  const partnerRow = (number: number) =>
    partners.locator("li").filter({ has: ticket(dist, number) });
  const finish = dist.locator("section.panel", { hasText: "Finish" });
  const closing = dist.locator(".confirm");
  const reports = adm.locator("section.panel", { hasText: "Shifts and reports" });
  const accounts = adm.locator("section.panel", { hasText: "Accounts" });
  const newAdmin = accounts.locator("form", { hasText: "Add admin" });
  const samRow = accounts.locator(".account").filter({ hasText: "sam" });
  // Set when the card typed during the Wi-Fi dropout is saved on the device.
  const offline = { number: 0 };

  const signIn = (station: Station, username: string, say: string): Step => ({
    station,
    say,
    target: () => station.page.getByRole("button", { name: "Sign in" }),
    act: async () => {
      await type(station.page.getByLabel("Username"), username);
      await station.page.getByLabel("Password").fill(password);
      await station.page.getByRole("button", { name: "Sign in" }).click();
      await expect(station.page.getByRole("button", { name: "Sign out" })).toBeVisible();
    },
  });
  const stationSignIn =
    "Each station signs in with its own login, which decides what it can do. Stations stay signed in, so volunteers rarely see this.";

  const scene: Scene = {
    frontDesk,
    distribution,
    admin,
    fd,
    dist,
    adm,
    type,
    ticket,
    fdCard,
    queueCard,
    doneCard,
    infoFrom,
    returned,
    partners,
    partnerRow,
    finish,
    closing,
    reports,
    newAdmin,
    samRow,
    signIn,
    stationSignIn,
    offline,
  };
  const steps: Step[] = [
    ...startingTheShift(scene),
    ...frontDeskEntersFamilies(scene),
    ...callingBack(scene),
    ...firstFamilyServed(scene),
    ...correctionAndWarnings(scene),
    ...adminRemovesDuplicate(scene),
    ...wifiDropout(scene),
    ...returnedItems(scene),
    ...partnerFamilies(scene),
    ...liveTotals(scene),
    ...closingTheShift(scene),
    ...adminScreen(scene),
    ...helpScreen(scene),
  ];

  const stations = [frontDesk, distribution, admin];
  for (const [index, step] of steps.entries()) {
    // The admin window covers the front desk, so the acting window comes to the front.
    if (!HEADLESS) await step.station.page.bringToFront();
    for (const station of stations) {
      const acting = station === step.station;
      await showCaption(station.page, {
        title: `STEP ${index + 1} OF ${steps.length} · ${station.name}${acting ? " · WATCH THIS SCREEN" : ""}`,
        text: step.say,
        acting,
      });
    }
    if (step.target) await highlight(step.target());
    await pause(readingTime(step.say));
    if (step.act) await step.act();
    await clearHighlights(step.station.page);
    await pause(SETTLE_MS);
  }

  // Figures the captions state, so that a change to the app can't leave them wrong.
  const expected: [string, string][] = [
    ["Total # of families", "6"],
    ["Total weight", "171.5 lb"],
    ["Total return weight", "3.5 lb"],
    ["Net weight", "168 lb"],
  ];
  for (const station of [frontDesk, distribution]) {
    const page = station.page;
    const row = (label: string) =>
      page
        .locator(".totals tr")
        .filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
    await page.getByRole("button", { name: "Totals", exact: true }).click();
    for (const [label, value] of expected) {
      await expect(row(label).locator("td")).toHaveText(value);
    }
    await expect(row("Door Dash and Helping Hands").locator("td")).toHaveText(["2", "75 lb"]);
  }

  for (const station of stations) {
    await showCaption(station.page, {
      title: `END OF WALKTHROUGH · ${station.name}`,
      text: VIDEO_DIR ? "The recording is being saved." : "Close any window to finish.",
      acting: false,
    });
  }
}

// Closes each window so that its video is written, then names the files by station.
async function saveVideos(stations: Station[]): Promise<void> {
  if (!VIDEO_DIR) return;
  for (const station of stations) {
    const video = station.page.video();
    await station.context.close();
    if (!video) continue;
    try {
      const path = join(VIDEO_DIR, station.file);
      await video.saveAs(path);
      await video.delete();
      console.log(`Saved video: ${path}`);
    } catch (error) {
      console.error(`Could not save the ${station.name} video: ${String(error)}`);
    }
  }
}

const db = openDatabase(":memory:");
// Only for this temporary database, which disappears when the demo ends.
const password = randomBytes(18).toString("base64url");
await createAccount(db, { username: "front-desk", password, role: "front_desk" });
await createAccount(db, { username: "distribution", password, role: "distribution" });
await createAccount(db, { username: "pat", password, role: "admin" });
const app = await buildApp({ db, cookieSecure: false, clientDir: resolve("dist/client") });
await app.listen({ port: 0, host: "127.0.0.1" });
const { port } = app.server.address() as AddressInfo;
const url = `http://127.0.0.1:${port}/`;

if (VIDEO_DIR) mkdirSync(VIDEO_DIR, { recursive: true });
const browser = await chromium.launch({
  headless: HEADLESS,
  ignoreDefaultArgs: ["--enable-automation"],
});
const stations: Station[] = [];
let failed = false;
try {
  const admin = await openStation(browser, "ADMIN", url, "left");
  const frontDesk = await openStation(browser, "FRONT DESK", url, "left");
  const distribution = await openStation(browser, "DISTRIBUTION", url, "right");
  stations.push(frontDesk, distribution, admin);
  await run(frontDesk, distribution, admin, password);
  console.log("Walkthrough finished.");
  if (!HEADLESS && !VIDEO_DIR) {
    await Promise.race([
      ...stations.map((station) => new Promise((done) => station.page.once("close", done))),
      new Promise((done) => browser.once("disconnected", done)),
    ]);
  }
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await saveVideos(stations);
  await browser.close();
  await app.close();
  db.close();
}
process.exit(failed ? 1 : 0);
