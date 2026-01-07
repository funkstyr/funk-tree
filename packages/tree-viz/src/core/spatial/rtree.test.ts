import { describe, it, expect, beforeEach } from "vitest";
import { SpatialIndex } from "./rtree";
import type { TreeNode, Person } from "../data/types";

function createMockNode(id: string, x: number, y: number, width: number, height: number): TreeNode {
  const person: Person = {
    id,
    wikiId: id,
    name: `Person ${id}`,
    gender: "U",
  };

  return {
    id,
    person,
    x,
    y,
    width,
    height,
    parentIds: [],
    childIds: [],
    spouseIds: [],
    collapsed: false,
    selected: false,
    highlighted: false,
  };
}

describe("SpatialIndex", () => {
  let index: SpatialIndex;

  beforeEach(() => {
    index = new SpatialIndex();
  });

  describe("load", () => {
    it("loads nodes into the index", () => {
      const nodes = [createMockNode("A", 0, 0, 100, 50), createMockNode("B", 200, 0, 100, 50)];

      index.load(nodes);

      // Verify by querying
      const results = index.queryRect({ minX: 0, minY: 0, maxX: 300, maxY: 100 });
      expect(results).toContain("A");
      expect(results).toContain("B");
    });

    it("clears previous data when loading", () => {
      const nodes1 = [createMockNode("A", 0, 0, 100, 50)];
      const nodes2 = [createMockNode("B", 200, 0, 100, 50)];

      index.load(nodes1);
      index.load(nodes2);

      const results = index.queryRect({ minX: 0, minY: 0, maxX: 300, maxY: 100 });
      expect(results).not.toContain("A");
      expect(results).toContain("B");
    });

    it("handles empty array", () => {
      index.load([]);

      const results = index.queryRect({ minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 });
      expect(results).toHaveLength(0);
    });
  });

  describe("queryRect", () => {
    beforeEach(() => {
      const nodes = [
        createMockNode("TopLeft", 0, 0, 100, 50),
        createMockNode("TopRight", 200, 0, 100, 50),
        createMockNode("BottomLeft", 0, 200, 100, 50),
        createMockNode("BottomRight", 200, 200, 100, 50),
        createMockNode("Center", 100, 100, 100, 50),
      ];
      index.load(nodes);
    });

    it("returns nodes within query bounds", () => {
      const results = index.queryRect({ minX: 0, minY: 0, maxX: 150, maxY: 75 });

      expect(results).toContain("TopLeft");
      expect(results).not.toContain("TopRight");
      expect(results).not.toContain("BottomLeft");
      expect(results).not.toContain("BottomRight");
    });

    it("returns nodes that intersect query bounds", () => {
      // Query that partially overlaps TopLeft and Center
      const results = index.queryRect({ minX: 50, minY: 25, maxX: 150, maxY: 125 });

      expect(results).toContain("TopLeft");
      expect(results).toContain("Center");
    });

    it("returns all nodes for large query", () => {
      const results = index.queryRect({ minX: -100, minY: -100, maxX: 500, maxY: 500 });

      expect(results).toHaveLength(5);
    });

    it("returns empty for query with no overlaps", () => {
      const results = index.queryRect({ minX: 1000, minY: 1000, maxX: 2000, maxY: 2000 });

      expect(results).toHaveLength(0);
    });

    it("handles exact bounds match", () => {
      // Query exactly matching TopLeft node
      const results = index.queryRect({ minX: 0, minY: 0, maxX: 100, maxY: 50 });

      expect(results).toContain("TopLeft");
    });

    it("handles zero-width query (vertical line)", () => {
      // Vertical line at x=50 should intersect TopLeft and BottomLeft
      const results = index.queryRect({ minX: 50, minY: 0, maxX: 50, maxY: 300 });

      expect(results).toContain("TopLeft");
      expect(results).toContain("BottomLeft");
    });
  });

  describe("queryPoint", () => {
    beforeEach(() => {
      const nodes = [
        createMockNode("A", 0, 0, 100, 50),
        createMockNode("B", 200, 0, 100, 50),
        createMockNode("C", 0, 100, 100, 50),
      ];
      index.load(nodes);
    });

    it("returns node id when point is inside a node", () => {
      // Point inside node A
      const result = index.queryPoint(50, 25);

      expect(result).toBe("A");
    });

    it("returns null when point is not inside any node", () => {
      // Point in empty space
      const result = index.queryPoint(150, 75);

      expect(result).toBeNull();
    });

    it("returns node id when point is on boundary", () => {
      // Point on corner of node A
      const result = index.queryPoint(0, 0);

      expect(result).toBe("A");
    });

    it("returns first result when multiple nodes would match", () => {
      // Add overlapping node
      const overlappingNodes = [
        createMockNode("Overlap1", 50, 50, 100, 100),
        createMockNode("Overlap2", 75, 75, 100, 100),
      ];
      index.load(overlappingNodes);

      // Point in overlap region
      const result = index.queryPoint(100, 100);

      // Should return one of the overlapping nodes
      expect(["Overlap1", "Overlap2"]).toContain(result);
    });

    it("handles negative coordinates", () => {
      const nodes = [createMockNode("Negative", -100, -100, 50, 50)];
      index.load(nodes);

      const result = index.queryPoint(-75, -75);

      expect(result).toBe("Negative");
    });
  });

  describe("clear", () => {
    it("removes all nodes from index", () => {
      const nodes = [createMockNode("A", 0, 0, 100, 50), createMockNode("B", 200, 0, 100, 50)];
      index.load(nodes);

      index.clear();

      const results = index.queryRect({ minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 });
      expect(results).toHaveLength(0);
    });

    it("can load new nodes after clear", () => {
      const nodes1 = [createMockNode("A", 0, 0, 100, 50)];
      index.load(nodes1);
      index.clear();

      const nodes2 = [createMockNode("B", 200, 0, 100, 50)];
      index.load(nodes2);

      const results = index.queryRect({ minX: 0, minY: 0, maxX: 300, maxY: 100 });
      expect(results).not.toContain("A");
      expect(results).toContain("B");
    });
  });

  describe("performance characteristics", () => {
    it("handles large number of nodes", () => {
      const nodes: TreeNode[] = [];
      for (let i = 0; i < 1000; i++) {
        const x = (i % 50) * 120;
        const y = Math.floor(i / 50) * 80;
        nodes.push(createMockNode(`N${i}`, x, y, 100, 60));
      }

      const start = performance.now();
      index.load(nodes);
      const loadTime = performance.now() - start;

      // Loading should be fast
      expect(loadTime).toBeLessThan(100); // 100ms is generous

      const queryStart = performance.now();
      const results = index.queryRect({ minX: 0, minY: 0, maxX: 600, maxY: 160 });
      const queryTime = performance.now() - queryStart;

      // Query should be fast
      expect(queryTime).toBeLessThan(10); // 10ms is generous
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThan(1000); // Should not return all nodes
    });
  });
});
