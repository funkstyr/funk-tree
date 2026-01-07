import { describe, it, expect, vi, beforeEach } from "vitest";
import { WikiTreeApi } from "./wikitree-api";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("WikiTreeApi", () => {
  let api: WikiTreeApi;

  beforeEach(() => {
    vi.clearAllMocks();
    api = new WikiTreeApi();
  });

  describe("getProfile", () => {
    it("returns profile data on successful response", async () => {
      const mockProfile = {
        Id: 123,
        Name: "Funck-6",
        FirstName: "Heinrich",
        LastNameAtBirth: "Funck",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ profile: mockProfile }]),
      });

      const result = await api.getProfile("Funck-6");

      expect(result).toEqual(mockProfile);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify URL contains required params
      const callUrl = mockFetch.mock.calls[0]![0] as string;
      expect(callUrl).toContain("action=getProfile");
      expect(callUrl).toContain("key=Funck-6");
      expect(callUrl).toContain("appId=FunkFamilyTreeCrawler");
      expect(callUrl).toContain("format=json");
    });

    it("returns null when profile not found in response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{}]),
      });

      const result = await api.getProfile("NonExistent-1");
      expect(result).toBeNull();
    });

    it("returns null on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const result = await api.getProfile("Funck-6");
      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await api.getProfile("Funck-6");
      expect(result).toBeNull();
    });
  });

  describe("getAncestors", () => {
    it("returns ancestors array on success", async () => {
      const mockAncestors = [
        { Name: "Parent-1", FirstName: "John" },
        { Name: "Parent-2", FirstName: "Jane" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ ancestors: mockAncestors }]),
      });

      const result = await api.getAncestors("Funck-6", 2);

      expect(result).toEqual(mockAncestors);

      const callUrl = mockFetch.mock.calls[0]![0] as string;
      expect(callUrl).toContain("action=getAncestors");
      expect(callUrl).toContain("depth=2");
    });

    it("returns empty array when no ancestors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{}]),
      });

      const result = await api.getAncestors("Funck-6");
      expect(result).toEqual([]);
    });
  });

  describe("getDescendants", () => {
    it("returns descendants array on success", async () => {
      const mockDescendants = [
        { Name: "Child-1", FirstName: "Henry Jr" },
        { Name: "Child-2", FirstName: "Anna" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ descendants: mockDescendants }]),
      });

      const result = await api.getDescendants("Funck-6", 1);

      expect(result).toEqual(mockDescendants);

      const callUrl = mockFetch.mock.calls[0]![0] as string;
      expect(callUrl).toContain("action=getDescendants");
      expect(callUrl).toContain("depth=1");
    });

    it("returns empty array when no descendants", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{}]),
      });

      const result = await api.getDescendants("Funck-6");
      expect(result).toEqual([]);
    });
  });
});
