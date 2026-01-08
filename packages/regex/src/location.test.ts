import { describe, it, expect } from "vitest";
import { normalizeLocationKey } from "./location";

describe("normalizeLocationKey", () => {
  it("converts to lowercase", () => {
    expect(normalizeLocationKey("Lancaster")).toBe("lancaster");
    expect(normalizeLocationKey("NEW YORK")).toBe("new york");
  });

  it("trims whitespace", () => {
    expect(normalizeLocationKey("  Lancaster  ")).toBe("lancaster");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeLocationKey("Lancaster    County")).toBe("lancaster county");
  });

  it("standardizes comma spacing", () => {
    expect(normalizeLocationKey("Lancaster,Pennsylvania")).toBe("lancaster, pennsylvania");
    expect(normalizeLocationKey("Lancaster ,Pennsylvania")).toBe("lancaster, pennsylvania");
    expect(normalizeLocationKey("Lancaster , Pennsylvania")).toBe("lancaster, pennsylvania");
    expect(normalizeLocationKey("Lancaster,  Pennsylvania")).toBe("lancaster, pennsylvania");
  });

  it("removes trailing punctuation", () => {
    expect(normalizeLocationKey("USA,")).toBe("usa");
    expect(normalizeLocationKey("USA.")).toBe("usa");
    expect(normalizeLocationKey("USA;")).toBe("usa");
    expect(normalizeLocationKey("USA...")).toBe("usa");
  });

  it("handles complex location strings", () => {
    expect(normalizeLocationKey("  Lancaster,  Pennsylvania, USA  ")).toBe(
      "lancaster, pennsylvania, usa",
    );
    expect(normalizeLocationKey("Philadelphia , PA")).toBe("philadelphia, pa");
  });

  it("returns null for null input", () => {
    expect(normalizeLocationKey(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeLocationKey(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeLocationKey("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normalizeLocationKey("   ")).toBeNull();
  });
});
