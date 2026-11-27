# 0041. Offer color-blind friendly colors

- **Status:** Accepted
- **Date:** 2026-11-27

## Context

The maintainer asked for a color-blind mode as well as Light and Dark. The colors that carry meaning are green for actions and good states, red for problems and stops, and amber for cards called back (ADR 0021, ADR 0039). Red-green color blindness is the most common kind, and those are the colors it confuses.

The developer measured the current colors with the Machado 2009 simulation at full severity, as color differences (CIELAB ΔE; under about 10 is hard to tell apart):

| Pair | Normal | Deuteranopia | Protanopia |
|---|---|---|---|
| Green vs red text, light | 83.6 | 30.3 | 13.9 |
| Green vs red text, dark | 72.6 | 18.3 | 11.5 |
| Save box vs stop box (tints), light | 13.1 | 4.2 | 2.4 |
| Red vs amber text, light | 35.9 | 7.4 | 19.2 |

Status labels already pair each color with a word and a dot whose fill differs, so color is never the only cue. The boxes are where it shows: a red stop and a green confirmation can look the same.

## Decision

- **A separate switch:** The Help screen gets **Color-blind friendly colors**, **Off** or **On**, under **Colors on this device**. It works with Same as this device, Light and Dark, so a color-blind volunteer can still have dark colors. It is kept on that device only (`localStorage`, `client/src/scheme.ts`) and marks the page with `data-color-blind`. No device setting asks for it, so it starts off.
- **Blue and orange for red-green color blindness:** Green becomes blue and red becomes vermilion orange, the hues of the Okabe-Ito palette. "Called back" text becomes the ink color, because orange and amber look alike to the same readers. Its yellow-filled dot still sets it apart from Waiting's hollow one. The canary ticket is unchanged.
- **Only six colors change:**

  | Variable | Light | Dark |
  |---|---|---|
  | `--go` | `#0068a6` | `#2479b3` |
  | `--go-text` | `#005a8f` | `#7cc4f2` |
  | `--go-tint` | `#dcebf5` | `#17303f` |
  | `--alert` | `#b33c00` | `#ff9a52` |
  | `--alert-tint` | `#fbe6d6` | `#45291a` |
  | `--called` | ink | ink |

- **Checked by hand:** Text is at least 4.5 to 1 against its background, white on the go fill too, and the focus outline is at least 3 to 1 against the paper and the surface. Simulated, go and alert now differ by a ΔE of 76 or more for both kinds of red-green color blindness.

## Alternatives considered

- **A fourth choice beside Light and Dark:** Less code, but light colors only.
- **Separate modes for each kind of color blindness:** Better for the rare kinds, but twice the colors to keep up and a choice most volunteers would not understand.
- **Make the usual colors color-blind safe and add no mode:** No switch needed, but it changes the look ADR 0021 chose for everyone, which was not asked for.

## Consequences

- The dark tints of a stop and a warning (orange and yellow) stay close for deuteranopia, ΔE 2.6. They still differ by text color and wording.
- Blue-yellow color blindness (tritanopia) is not targeted. Go and alert stay far apart for it in the simulation, but some tints are close.
- The wall display has no Help screen, so the switch can't be set there. The display uses only the offline and ticket tints.
- A new meaning color needs a color-blind value as well as a dark one. `docs/developer/development.md` says how.
- The simulation is a model. No color-blind volunteer has tried the colors yet.
