import { describe, it, expect } from "vitest";
import { buildFullName, extractIds, isValidId, parseWikiTreeDate } from "./utils";
import type { WikiTreeProfile } from "./wikitree-api";

describe("buildFullName", () => {
  it("builds full name from all parts", () => {
    const profile: WikiTreeProfile = {
      FirstName: "Heinrich",
      MiddleName: "Johannes",
      LastNameAtBirth: "Funck",
      Suffix: "Sr",
    };
    expect(buildFullName(profile)).toBe("Heinrich Johannes Funck Sr");
  });

  it("uses LastNameCurrent when LastNameAtBirth is missing", () => {
    const profile: WikiTreeProfile = {
      FirstName: "Anna",
      LastNameCurrent: "Meyer",
    };
    expect(buildFullName(profile)).toBe("Anna Meyer");
  });

  it("prefers LastNameAtBirth over LastNameCurrent", () => {
    const profile: WikiTreeProfile = {
      FirstName: "Anna",
      LastNameAtBirth: "Funck",
      LastNameCurrent: "Meyer",
    };
    expect(buildFullName(profile)).toBe("Anna Funck");
  });

  it("falls back to Name field when no parts available", () => {
    const profile: WikiTreeProfile = {
      Name: "Funck-6",
    };
    expect(buildFullName(profile)).toBe("Funck-6");
  });

  it("returns Unknown when no name data available", () => {
    const profile: WikiTreeProfile = {};
    expect(buildFullName(profile)).toBe("Unknown");
  });

  it("handles first name only", () => {
    const profile: WikiTreeProfile = {
      FirstName: "Unknown",
    };
    expect(buildFullName(profile)).toBe("Unknown");
  });
});

describe("extractIds", () => {
  it("returns empty array for undefined", () => {
    expect(extractIds(undefined)).toEqual([]);
  });

  it("extracts IDs from array of objects with Name property", () => {
    const items = [{ Name: "Funck-7" }, { Name: "Funck-8" }, { Name: "Meyer-123" }];
    expect(extractIds(items)).toEqual(["Funck-7", "Funck-8", "Meyer-123"]);
  });

  it("extracts keys from object (WikiTree format)", () => {
    const items = {
      "Funck-7": { some: "data" },
      "Funck-8": { more: "data" },
    };
    expect(extractIds(items)).toEqual(["Funck-7", "Funck-8"]);
  });

  it("filters out non-object items in array", () => {
    const items = [{ Name: "Funck-7" }, null, { Name: "Funck-8" }, "invalid"];
    expect(extractIds(items as unknown[])).toEqual(["Funck-7", "Funck-8"]);
  });

  it("handles empty array", () => {
    expect(extractIds([])).toEqual([]);
  });

  it("handles empty object", () => {
    expect(extractIds({})).toEqual([]);
  });
});

describe("isValidId", () => {
  it("returns false for null", () => {
    expect(isValidId(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isValidId(undefined)).toBe(false);
  });

  it("returns false for numeric 0", () => {
    expect(isValidId(0)).toBe(false);
  });

  it("returns false for string '0'", () => {
    expect(isValidId("0")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidId("")).toBe(false);
  });

  it("returns true for valid WikiTree ID string", () => {
    expect(isValidId("Funck-6")).toBe(true);
  });

  it("returns true for valid numeric ID", () => {
    expect(isValidId(12345)).toBe(true);
  });

  it("returns true for numeric ID as string", () => {
    expect(isValidId("12345")).toBe(true);
  });
});

describe("parseWikiTreeDate", () => {
  it("returns null for undefined", () => {
    expect(parseWikiTreeDate(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseWikiTreeDate(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseWikiTreeDate("")).toBeNull();
  });

  it("returns null for all-zeros date", () => {
    expect(parseWikiTreeDate("0000-00-00")).toBeNull();
  });

  it("returns null for date starting with 0000", () => {
    expect(parseWikiTreeDate("0000-05-15")).toBeNull();
  });

  it("returns valid date string", () => {
    expect(parseWikiTreeDate("1760-03-15")).toBe("1760-03-15");
  });

  it("returns partial date (year only)", () => {
    expect(parseWikiTreeDate("1697-00-00")).toBe("1697-00-00");
  });
});
