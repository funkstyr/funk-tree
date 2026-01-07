import { BitmapFont } from "pixi.js";

// Character sets for family tree text
const NAME_CHARS = [
  ["a", "z"],
  ["A", "Z"],
  ["0", "9"],
  " ",
  "-",
  ".",
  ",",
  "'",
  "(",
  ")",
  '"',
  "/",
  "&",
] as const;

const DATE_CHARS = [["0", "9"], " ", "-", "c", ".", "~", "?"] as const;

const LOCATION_CHARS = [
  ["a", "z"],
  ["A", "Z"],
  ["0", "9"],
  " ",
  ",",
  ".",
  "-",
  "'",
  "(",
  ")",
  "/",
] as const;

let fontsInitialized = false;

/**
 * Initialize bitmap fonts for family tree text rendering.
 * Call once during app initialization.
 */
export function initializeBitmapFonts(): void {
  if (fontsInitialized) return;

  // Name font - shown at medium and full LOD (13px, bold)
  BitmapFont.install({
    name: "personName",
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 13,
      fontWeight: "600",
      fill: 0xffffff,
    },
    chars: NAME_CHARS as unknown as string[][],
    resolution: 2,
    padding: 4,
  });

  // Name font smaller - shown at medium LOD (11px, bold)
  BitmapFont.install({
    name: "personNameSmall",
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 11,
      fontWeight: "600",
      fill: 0xffffff,
    },
    chars: NAME_CHARS as unknown as string[][],
    resolution: 2,
    padding: 4,
  });

  // Date font - full LOD only (10px, gray)
  BitmapFont.install({
    name: "personDates",
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 10,
      fill: 0xcccccc,
    },
    chars: DATE_CHARS as unknown as string[][],
    resolution: 2,
    padding: 4,
  });

  // Location font - full LOD only (9px, darker gray)
  BitmapFont.install({
    name: "personLocation",
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 9,
      fill: 0x999999,
    },
    chars: LOCATION_CHARS as unknown as string[][],
    resolution: 2,
    padding: 4,
  });

  fontsInitialized = true;
}

/**
 * Clean up bitmap fonts when no longer needed.
 */
export function cleanupBitmapFonts(): void {
  if (!fontsInitialized) return;

  BitmapFont.uninstall("personName");
  BitmapFont.uninstall("personNameSmall");
  BitmapFont.uninstall("personDates");
  BitmapFont.uninstall("personLocation");

  fontsInitialized = false;
}

/**
 * Check if bitmap fonts are initialized.
 */
export function areFontsInitialized(): boolean {
  return fontsInitialized;
}
