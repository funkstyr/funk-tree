import type { NewPerson } from "@funk-tree/db/schema";
import { normalizeLocationKey } from "@funk-tree/db/utils/location";
import type { WikiTreeProfile } from "./domain/profile";

/**
 * Build a full name from WikiTree profile parts
 */
export function buildFullName(profile: WikiTreeProfile): string {
  const parts: string[] = [];
  if (profile.FirstName) parts.push(profile.FirstName);
  if (profile.MiddleName) parts.push(profile.MiddleName);
  if (profile.LastNameAtBirth) parts.push(profile.LastNameAtBirth);
  else if (profile.LastNameCurrent) parts.push(profile.LastNameCurrent);
  if (profile.Suffix) parts.push(profile.Suffix);
  return parts.length > 0 ? parts.join(" ") : (profile.Name ?? "Unknown");
}

/**
 * Extract WikiTree IDs from various API response formats
 * (Children, Spouses, Parents can be objects or arrays)
 */
export function extractIds(
  items: Record<string, unknown> | readonly unknown[] | unknown[] | null | undefined,
): string[] {
  if (!items) return [];

  if (Array.isArray(items)) {
    return items
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          return (item as Record<string, unknown>).Name as string;
        }
        return null;
      })
      .filter((id): id is string => id !== null);
  }

  if (typeof items === "object") {
    return Object.keys(items as Record<string, unknown>);
  }

  return [];
}

/**
 * Check if a WikiTree ID is valid (not 0, not empty)
 */
export function isValidId(id: unknown): boolean {
  if (!id) return false;
  if (typeof id === "number" && id === 0) return false;
  if (typeof id === "string" && (id === "0" || id === "")) return false;
  return true;
}

/**
 * Parse a WikiTree date string (YYYY-MM-DD or partial)
 * Returns null for invalid/empty dates
 */
export function parseWikiTreeDate(dateStr: string | undefined | null): string | null {
  if (!dateStr || dateStr === "0000-00-00") return null;
  // WikiTree uses 0000 for unknown parts
  if (dateStr.startsWith("0000")) return null;
  return dateStr;
}

/**
 * Convert a WikiTree profile to a database NewPerson record
 */
export function profileToNewPerson(profile: WikiTreeProfile): NewPerson | null {
  const wikiId = profile.Name;
  if (!wikiId) return null;

  const birthLocation = profile.BirthLocation ?? null;
  const deathLocation = profile.DeathLocation ?? null;

  return {
    wikiId,
    wikiNumericId: profile.Id,
    name: buildFullName(profile),
    firstName: profile.FirstName ?? null,
    middleName: profile.MiddleName ?? null,
    lastNameBirth: profile.LastNameAtBirth ?? null,
    lastNameCurrent: profile.LastNameCurrent ?? null,
    suffix: profile.Suffix ?? null,
    gender: profile.Gender ?? null,
    birthDate: profile.BirthDate ?? null,
    deathDate: profile.DeathDate ?? null,
    birthLocation,
    birthLocationKey: normalizeLocationKey(birthLocation),
    deathLocation,
    deathLocationKey: normalizeLocationKey(deathLocation),
    isLiving: profile.IsLiving === 1,
    fatherWikiId: isValidId(profile.Father) ? String(profile.Father) : null,
    motherWikiId: isValidId(profile.Mother) ? String(profile.Mother) : null,
  };
}
