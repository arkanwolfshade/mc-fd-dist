// Walks through one shift in two real browser windows, side by side, for showing the app
// to people. It uses the real server and client with made-up data in a temporary database.
//
//   npm run demo
//
// DEMO_STEP_SECONDS sets the shortest time each step is shown before it happens (default 4).
// DEMO_HEADLESS=true runs it without windows, to check that the script still works.
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, expect } from "@playwright/test";
import type { Browser, Locator, Page } from "@playwright/test";
import { createAccount } from "../server/accounts.js";
import { buildApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";

const STEP_MS = Number(process.env.DEMO_STEP_SECONDS ?? 4) * 1000;
const HEADLESS = process.env.DEMO_HEADLESS === "true";
const SETTLE_MS = STEP_MS > 0 ? 1500 : 0;
const TYPING_DELAY_MS = STEP_MS > 0 ? 150 : 0;

interface Station {
  name: string;
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
  const context = await browser.newContext(
    HEADLESS ? { viewport: { width: 720, height: 850 } } : { viewport: null },
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`${name} page error: ${error.message}`));
  if (!HEADLESS) await moveWindow(page, side);
  await page.goto(url);
  return { name, page };
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

async function run(frontDesk: Station, distribution: Station, password: string): Promise<void> {
  const fd = frontDesk.page;
  const dist = distribution.page;
  const type = (target: Locator, text: string) =>
    target.pressSequentially(text, { delay: TYPING_DELAY_MS });
  // Cards are found by the number on their ticket.
  const ticket = (page: Page, number: number) =>
    page.locator(".ticket").filter({ hasText: new RegExp(`^${number}$`) });
  const fdCard = (number: number) => fd.locator(".cards > li").filter({ has: ticket(fd, number) });
  const queueCard = (number: number) =>
    dist.locator(".queue-card").filter({ has: ticket(dist, number) });
  const doneCard = (number: number) =>
    dist
      .locator("section", { hasText: "Distributed (" })
      .locator("li")
      .filter({ has: ticket(dist, number) });
  const returned = dist.locator("section", { hasText: "Returned items" });
  const partners = dist.locator("section", { hasText: "End of shift" });

  const signIn = (station: Station, username: string): Step => ({
    station,
    say: `Each station signs in with its own login, which decides what it can do. Stations stay signed in, so volunteers rarely see this.`,
    target: () => station.page.getByRole("button", { name: "Sign in" }),
    act: async () => {
      await type(station.page.getByLabel("Username"), username);
      await station.page.getByLabel("Password").fill(password);
      await station.page.getByRole("button", { name: "Sign in" }).click();
    },
  });

  const steps: Step[] = [
    {
      station: frontDesk,
      say: "This walkthrough uses made-up data. The left window is the front desk and the right window is distribution, as if on two separate devices.",
    },
    signIn(frontDesk, "front-desk"),
    signIn(distribution, "distribution"),
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
    {
      station: frontDesk,
      say: "A family of 5 arrives. The next card number is suggested, and TEFAP bags are worked out from family size: 5 people is 2 bags.",
      target: () => fd.getByLabel("# in family"),
      act: () => type(fd.getByLabel("# in family"), "5"),
    },
    {
      station: frontDesk,
      say: "One tap records how they arrived. A senior box comes with the option of cheese, so both are ticked.",
      target: () => fd.locator("fieldset"),
      act: async () => {
        await fd.getByRole("button", { name: "East", exact: true }).click();
        await fd.getByRole("button", { name: "Senior box" }).click();
        await fd.getByRole("button", { name: "Cheese" }).click();
      },
    },
    {
      station: frontDesk,
      say: "Saving enters the card once. Nobody writes these details on a second sheet.",
      target: () => fd.getByRole("button", { name: "Save card" }),
      act: () => fd.getByRole("button", { name: "Save card" }).click(),
    },
    {
      station: frontDesk,
      say: "When it is their turn, the front desk calls them back to distribution, as on the radio, and the card goes across.",
      target: () => fdCard(1).getByRole("button", { name: "Call back" }),
      act: () => fdCard(1).getByRole("button", { name: "Call back" }).click(),
    },
    {
      station: distribution,
      say: "It appears in the distribution queue straight away, with the family's details already filled in.",
      target: () => queueCard(1),
    },
    {
      station: distribution,
      say: "Distribution checks the card number and details against the call back, then confirms. The front desk sees it confirmed.",
      target: () => queueCard(1).getByRole("button", { name: "Confirm" }),
      act: () => queueCard(1).getByRole("button", { name: "Confirm" }).click(),
    },
    {
      station: frontDesk,
      say: "The front desk can see that progress on its own list.",
      target: () => fdCard(1).locator(".status.confirmed"),
    },
    {
      station: distribution,
      say: "Distribution enters the weight of each load, up to three per card, and they are added up.",
      target: () => queueCard(1).getByLabel("Load 1 (lb)"),
      act: async () => {
        await type(queueCard(1).getByLabel("Load 1 (lb)"), "12.5");
        await type(queueCard(1).getByLabel("Load 2 (lb)"), "8");
      },
    },
    {
      station: distribution,
      say: "The family is marked as distributed.",
      target: () => queueCard(1).getByRole("button", { name: "Mark distributed" }),
      act: () => queueCard(1).getByRole("button", { name: "Mark distributed" }).click(),
    },
    {
      station: distribution,
      say: "The card moves to the distributed list with its total weight of 20.5 lb.",
      target: () => doneCard(1),
    },
    {
      station: frontDesk,
      say: "A second family arrives: 9 people, on foot, with a senior box. That is 3 TEFAP bags.",
      target: () => fd.getByLabel("# in family"),
      act: async () => {
        await type(fd.getByLabel("# in family"), "9");
        await fd.getByRole("button", { name: "Walk", exact: true }).click();
        await fd.getByRole("button", { name: "Senior box" }).click();
      },
    },
    {
      station: frontDesk,
      say: "The card is saved and the family is called back.",
      target: () => fd.getByRole("button", { name: "Save card" }),
      act: async () => {
        await fd.getByRole("button", { name: "Save card" }).click();
        await fdCard(2).getByRole("button", { name: "Call back" }).click();
      },
    },
    {
      station: distribution,
      say: "Suppose the family says there are really 8 of them. Distribution can correct the card.",
      target: () => queueCard(2).getByRole("button", { name: "Correct details" }),
      act: async () => {
        await queueCard(2).getByRole("button", { name: "Correct details" }).click();
        await queueCard(2).locator(".correct").getByLabel("# in family").fill("8");
      },
    },
    {
      station: distribution,
      say: "Saving the correction updates the card, and TEFAP bags change from 3 to 2 by themselves.",
      target: () => queueCard(2).getByRole("button", { name: "Save correction" }),
      act: () => queueCard(2).getByRole("button", { name: "Save correction" }).click(),
    },
    {
      station: frontDesk,
      say: "The front desk sees the correction too, so both stations always share one record.",
      target: () => fdCard(2).filter({ hasText: "family of 8" }),
    },
    {
      station: distribution,
      say: "Distribution finishes this family with a single load of 30 lb.",
      target: () => queueCard(2).getByRole("button", { name: "Confirm" }),
      act: async () => {
        await queueCard(2).getByRole("button", { name: "Confirm" }).click();
        await type(queueCard(2).getByLabel("Load 1 (lb)"), "30");
        await queueCard(2).getByRole("button", { name: "Mark distributed" }).click();
      },
    },
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
      say: "The line keeps moving. A family of 2 arrives by bus, and the card is saved on this device.",
      target: () => fd.getByLabel("# in family"),
      act: async () => {
        await type(fd.getByLabel("# in family"), "2");
        await fd.getByRole("button", { name: "Bus", exact: true }).click();
        await fd.getByRole("button", { name: "Save card" }).click();
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
      act: () => fd.context().setOffline(false),
    },
    {
      station: frontDesk,
      say: "Card 3 is now a normal card on the shared record.",
      target: () => fdCard(3).locator(".status.entered"),
    },
    {
      station: distribution,
      say: "Returned items are logged as separate weights through the shift. They are not tied to a card.",
      target: () => returned.getByLabel("Weight (lb)"),
      act: async () => {
        await type(returned.getByLabel("Weight (lb)"), "3.5");
        await returned.getByRole("button", { name: "Add returned batch" }).click();
      },
    },
    {
      station: distribution,
      say: "At the end of the shift, Door Dash and Helping Hands are entered as batches: here, 4 families and 40 lb.",
      target: () => partners.getByRole("button", { name: "Add last cards" }),
      act: async () => {
        await partners.getByRole("button", { name: "Door Dash" }).click();
        await type(partners.getByLabel("# of families"), "4");
        await type(partners.getByLabel("Weight (lb)"), "40");
        await partners.getByRole("button", { name: "Add last cards" }).click();
      },
    },
    {
      station: frontDesk,
      say: "Nobody adds up pages by hand any more. Both stations can open the same live totals.",
      target: () => fd.getByRole("button", { name: "Totals" }),
      act: async () => {
        await fd.getByRole("button", { name: "Totals" }).click();
        await dist.getByRole("button", { name: "Totals" }).click();
      },
    },
    {
      station: frontDesk,
      say: "7 families: 3 cards plus 4 from Door Dash. 90.5 lb went out, 3.5 lb came back, so net weight is 87 lb. Bags, senior boxes and cheese are counted too.",
      target: () => fd.locator(".totals"),
    },
    {
      station: distribution,
      say: "Distribution sees exactly the same figures, because they come from one shared calculation.",
      target: () => dist.locator(".totals"),
    },
    {
      station: distribution,
      say: "Distribution closes the shift at the end of the day. It must be confirmed, and only an admin can reopen it.",
      target: () => dist.getByRole("button", { name: "Distribution", exact: true }),
      act: async () => {
        await dist.getByRole("button", { name: "Distribution", exact: true }).click();
        await dist.getByRole("button", { name: "Close shift" }).click();
      },
    },
    {
      station: distribution,
      say: "Confirming locks the shift.",
      target: () => dist.getByRole("button", { name: "Yes, close the shift" }),
      act: () => dist.getByRole("button", { name: "Yes, close the shift" }).click(),
    },
    {
      station: frontDesk,
      say: "Both stations lock at once and show the final totals. The record stays saved for reports and spreadsheet exports.",
      target: () => fd.getByText("This shift is closed"),
    },
  ];

  const stations = [frontDesk, distribution];
  for (const [index, step] of steps.entries()) {
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
    ["Total # of families", "7"],
    ["Total weight", "90.5 lb"],
    ["Total return weight", "3.5 lb"],
    ["Net weight", "87 lb"],
    ["Total # of TEFAP bags", "5"],
    ["Total # of senior boxes", "2"],
    ["Total # of cheese", "1"],
  ];
  for (const station of stations) {
    for (const [label, value] of expected) {
      const row = station.page
        .locator(".totals tr")
        .filter({ has: station.page.getByRole("rowheader", { name: label, exact: true }) });
      await expect(row.locator("td")).toHaveText(value);
    }
  }

  for (const station of stations) {
    await showCaption(station.page, {
      title: `END OF WALKTHROUGH · ${station.name}`,
      text: "Close either window to finish.",
      acting: false,
    });
  }
}

const db = openDatabase(":memory:");
// Only for this temporary database, which disappears when the demo ends.
const password = randomBytes(18).toString("base64url");
await createAccount(db, { username: "front-desk", password, role: "front_desk" });
await createAccount(db, { username: "distribution", password, role: "distribution" });
const app = await buildApp({ db, cookieSecure: false, clientDir: resolve("dist/client") });
await app.listen({ port: 0, host: "127.0.0.1" });
const { port } = app.server.address() as AddressInfo;
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({
  headless: HEADLESS,
  ignoreDefaultArgs: ["--enable-automation"],
});
let failed = false;
try {
  const frontDesk = await openStation(browser, "FRONT DESK", url, "left");
  const distribution = await openStation(browser, "DISTRIBUTION", url, "right");
  await run(frontDesk, distribution, password);
  console.log("Walkthrough finished.");
  if (!HEADLESS) {
    await Promise.race([
      new Promise((done) => frontDesk.page.once("close", done)),
      new Promise((done) => distribution.page.once("close", done)),
      new Promise((done) => browser.once("disconnected", done)),
    ]);
  }
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
  await app.close();
  db.close();
}
process.exit(failed ? 1 : 0);
