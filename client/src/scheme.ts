// Light or dark colors, chosen for each device on the Help screen. "auto" follows the
// device's own setting, which the stylesheet reads; the other two mark the page for it.
export const SCHEMES = ["auto", "light", "dark"] as const;
export type Scheme = (typeof SCHEMES)[number];

const SCHEME_KEY = "color-scheme";

export function schemeFrom(stored: string | null): Scheme {
  return SCHEMES.find((scheme) => scheme === stored) ?? "auto";
}

export function savedScheme(): Scheme {
  return schemeFrom(localStorage.getItem(SCHEME_KEY));
}

export function showScheme(scheme: Scheme): void {
  const { dataset } = document.documentElement;
  if (scheme === "auto") delete dataset.scheme;
  else dataset.scheme = scheme;
}

export function saveScheme(scheme: Scheme): void {
  if (scheme === "auto") localStorage.removeItem(SCHEME_KEY);
  else localStorage.setItem(SCHEME_KEY, scheme);
  showScheme(scheme);
}

// Blue and orange instead of green and red, with Light or Dark. No device setting asks for
// it, so it is off until chosen on the Help screen. See ADR 0041.
const COLOR_BLIND_KEY = "color-blind";

export function savedColorBlind(): boolean {
  return localStorage.getItem(COLOR_BLIND_KEY) === "on";
}

export function showColorBlind(on: boolean): void {
  const { dataset } = document.documentElement;
  if (on) dataset.colorBlind = "on";
  else delete dataset.colorBlind;
}

export function saveColorBlind(on: boolean): void {
  if (on) localStorage.setItem(COLOR_BLIND_KEY, "on");
  else localStorage.removeItem(COLOR_BLIND_KEY);
  showColorBlind(on);
}
