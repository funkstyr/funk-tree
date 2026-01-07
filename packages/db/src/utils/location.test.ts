import { describe, it, expect } from "vitest";
import { normalizeLocationKey } from "./location";

describe("normalizeLocationKey", () => {
  it("returns null for null/undefined input", () => {
    expect(normalizeLocationKey(null)).toBe(null);
    expect(normalizeLocationKey(undefined)).toBe(null);
  });

  it("returns null for empty string", () => {
    expect(normalizeLocationKey("")).toBe(null);
    expect(normalizeLocationKey("   ")).toBe(null);
  });

  it("lowercases the string", () => {
    expect(normalizeLocationKey("Lancaster")).toBe("lancaster");
    expect(normalizeLocationKey("PHILADELPHIA")).toBe("philadelphia");
  });

  it("trims whitespace", () => {
    expect(normalizeLocationKey("  Lancaster  ")).toBe("lancaster");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeLocationKey("New   York   City")).toBe("new york city");
  });

  it("standardizes comma spacing", () => {
    expect(normalizeLocationKey("Lancaster,Pennsylvania")).toBe("lancaster, pennsylvania");
    expect(normalizeLocationKey("Lancaster , Pennsylvania")).toBe("lancaster, pennsylvania");
    expect(normalizeLocationKey("Lancaster  ,  Pennsylvania")).toBe("lancaster, pennsylvania");
  });

  it("removes trailing punctuation", () => {
    expect(normalizeLocationKey("Lancaster, PA.")).toBe("lancaster, pa");
    expect(normalizeLocationKey("USA,")).toBe("usa");
  });

  it("handles full location strings", () => {
    expect(normalizeLocationKey("  Lancaster,  Pennsylvania, USA  ")).toBe(
      "lancaster, pennsylvania, usa",
    );
    expect(normalizeLocationKey("Philadelphia , PA")).toBe("philadelphia, pa");
  });

  it("produces consistent keys for equivalent locations", () => {
    const variations = [
      "Lancaster, Pennsylvania",
      "lancaster, pennsylvania",
      "LANCASTER, PENNSYLVANIA",
      "Lancaster,Pennsylvania",
      "  Lancaster , Pennsylvania  ",
    ];

    const keys = variations.map(normalizeLocationKey);
    const uniqueKeys = new Set(keys);

    expect(uniqueKeys.size).toBe(1);
    expect(keys[0]).toBe("lancaster, pennsylvania");
  });
});
