import { describe, it, expect } from "vitest";
import { parseYear } from "./date";

describe("parseYear", () => {
  it("extracts year from ISO date format", () => {
    expect(parseYear("1750-03-15")).toBe(1750);
  });

  it("extracts year from year-only string", () => {
    expect(parseYear("1750")).toBe(1750);
  });

  it("extracts year from approximate dates", () => {
    expect(parseYear("about 1750")).toBe(1750);
    expect(parseYear("circa 1750")).toBe(1750);
    expect(parseYear("c. 1750")).toBe(1750);
  });

  it("extracts year from natural language dates", () => {
    expect(parseYear("15 March 1750")).toBe(1750);
    expect(parseYear("March 15, 1750")).toBe(1750);
  });

  it("returns null for null input", () => {
    expect(parseYear(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseYear(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseYear("")).toBeNull();
  });

  it("returns null for string without year", () => {
    expect(parseYear("unknown")).toBeNull();
    expect(parseYear("N/A")).toBeNull();
  });

  it("extracts first year when multiple present", () => {
    expect(parseYear("1750-1760")).toBe(1750);
  });

  it("handles years at different positions", () => {
    expect(parseYear("Born 1750")).toBe(1750);
    expect(parseYear("1750 approximately")).toBe(1750);
  });
});
