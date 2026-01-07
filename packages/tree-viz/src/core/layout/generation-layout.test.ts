import { describe, it, expect } from "vitest";
import { computeLayout } from "./generation-layout";
import { buildTreeState, type RawPerson } from "../data/transform";
import type { LayoutConfig, TreeState } from "../data/types";

const DEFAULT_CONFIG: LayoutConfig = {
  nodeWidth: 180,
  nodeHeight: 70,
  horizontalGap: 40,
  verticalGap: 100,
  spouseGap: 20,
};

function createTestTree(persons: RawPerson[], rootId: string): TreeState {
  return buildTreeState(persons, rootId);
}

describe("computeLayout", () => {
  describe("generation assignment", () => {
    it("assigns root to generation 0", () => {
      const persons: RawPerson[] = [{ wiki_id: "Root", name: "Root", gender: "Male" }];

      const tree = createTestTree(persons, "Root");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const gen0 = result.generations.get(0);
      expect(gen0).toContain("Root");
    });

    it("assigns children to next generation", () => {
      const persons: RawPerson[] = [
        { wiki_id: "Parent", name: "Parent", gender: "Male" },
        { wiki_id: "Child", name: "Child", gender: "Male", father_wiki_id: "Parent" },
      ];

      const tree = createTestTree(persons, "Parent");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const gen0 = result.generations.get(0);
      const gen1 = result.generations.get(1);

      expect(gen0).toContain("Parent");
      expect(gen1).toContain("Child");
    });

    it("assigns spouses to same generation", () => {
      const persons: RawPerson[] = [
        { wiki_id: "Husband", name: "Husband", gender: "Male" },
        { wiki_id: "Wife", name: "Wife", gender: "Female" },
        {
          wiki_id: "Child",
          name: "Child",
          gender: "Male",
          father_wiki_id: "Husband",
          mother_wiki_id: "Wife",
        },
      ];

      const tree = createTestTree(persons, "Husband");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const gen0 = result.generations.get(0);
      expect(gen0).toContain("Husband");
      expect(gen0).toContain("Wife");
    });

    it("handles three generations correctly", () => {
      const persons: RawPerson[] = [
        { wiki_id: "Grandpa", name: "Grandpa", gender: "Male" },
        { wiki_id: "Parent", name: "Parent", gender: "Male", father_wiki_id: "Grandpa" },
        { wiki_id: "Child", name: "Child", gender: "Male", father_wiki_id: "Parent" },
      ];

      const tree = createTestTree(persons, "Grandpa");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      expect(result.generations.get(0)).toContain("Grandpa");
      expect(result.generations.get(1)).toContain("Parent");
      expect(result.generations.get(2)).toContain("Child");
    });

    it("handles ancestors (negative generations normalized to 0)", () => {
      const persons: RawPerson[] = [
        { wiki_id: "Grandpa", name: "Grandpa", gender: "Male" },
        { wiki_id: "Parent", name: "Parent", gender: "Male", father_wiki_id: "Grandpa" },
        { wiki_id: "Child", name: "Child", gender: "Male", father_wiki_id: "Parent" },
      ];

      // Start from child - ancestors should get negative generations, then normalize
      const tree = createTestTree(persons, "Child");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      // Generations should be normalized so minimum is 0
      const allGens = Array.from(result.generations.keys());
      expect(Math.min(...allGens)).toBe(0);
    });
  });

  describe("node positioning", () => {
    it("positions nodes with correct dimensions", () => {
      const persons: RawPerson[] = [{ wiki_id: "A", name: "Test", gender: "Male" }];

      const tree = createTestTree(persons, "A");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const node = result.nodes.get("A")!;
      expect(node.width).toBe(DEFAULT_CONFIG.nodeWidth);
      expect(node.height).toBe(DEFAULT_CONFIG.nodeHeight);
    });

    it("positions nodes at correct y based on generation", () => {
      const persons: RawPerson[] = [
        { wiki_id: "G0", name: "Gen 0", gender: "Male" },
        { wiki_id: "G1", name: "Gen 1", gender: "Male", father_wiki_id: "G0" },
        { wiki_id: "G2", name: "Gen 2", gender: "Male", father_wiki_id: "G1" },
      ];

      const tree = createTestTree(persons, "G0");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const expectedY = (gen: number) =>
        gen * (DEFAULT_CONFIG.nodeHeight + DEFAULT_CONFIG.verticalGap);

      expect(result.nodes.get("G0")!.y).toBe(expectedY(0));
      expect(result.nodes.get("G1")!.y).toBe(expectedY(1));
      expect(result.nodes.get("G2")!.y).toBe(expectedY(2));
    });

    it("positions spouses with spouse gap", () => {
      const persons: RawPerson[] = [
        { wiki_id: "Husband", name: "Husband", gender: "Male" },
        { wiki_id: "Wife", name: "Wife", gender: "Female" },
        {
          wiki_id: "Child",
          name: "Child",
          gender: "Male",
          father_wiki_id: "Husband",
          mother_wiki_id: "Wife",
        },
      ];

      const tree = createTestTree(persons, "Husband");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const husband = result.nodes.get("Husband")!;
      const wife = result.nodes.get("Wife")!;

      // Spouses should be on same row
      expect(husband.y).toBe(wife.y);

      // Gap between spouses should be spouseGap (allow for either ordering)
      if (husband.x < wife.x) {
        expect(wife.x - (husband.x + husband.width)).toBe(DEFAULT_CONFIG.spouseGap);
      } else {
        expect(husband.x - (wife.x + wife.width)).toBe(DEFAULT_CONFIG.spouseGap);
      }
    });
  });

  describe("edge computation", () => {
    it("creates parent-child edges", () => {
      const persons: RawPerson[] = [
        { wiki_id: "Parent", name: "Parent", gender: "Male" },
        { wiki_id: "Child", name: "Child", gender: "Male", father_wiki_id: "Parent" },
      ];

      const tree = createTestTree(persons, "Parent");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const edges = Array.from(result.edges.values());
      const parentChildEdge = edges.find((e) => e.type === "parent-child");

      expect(parentChildEdge).toBeDefined();
      expect(parentChildEdge!.sourceId).toBe("Parent");
      expect(parentChildEdge!.targetId).toBe("Child");
    });

    it("creates spouse edges", () => {
      const persons: RawPerson[] = [
        { wiki_id: "Husband", name: "Husband", gender: "Male" },
        { wiki_id: "Wife", name: "Wife", gender: "Female" },
        {
          wiki_id: "Child",
          name: "Child",
          gender: "Male",
          father_wiki_id: "Husband",
          mother_wiki_id: "Wife",
        },
      ];

      const tree = createTestTree(persons, "Husband");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const edges = Array.from(result.edges.values());
      const spouseEdge = edges.find((e) => e.type === "spouse");

      expect(spouseEdge).toBeDefined();
      // Spouse edge should connect husband and wife (order may vary based on ID sorting)
      expect([spouseEdge!.sourceId, spouseEdge!.targetId].sort()).toEqual(["Husband", "Wife"]);
    });

    it("does not create duplicate spouse edges", () => {
      const persons: RawPerson[] = [
        { wiki_id: "Husband", name: "Husband", gender: "Male" },
        { wiki_id: "Wife", name: "Wife", gender: "Female" },
        {
          wiki_id: "Child1",
          name: "Child 1",
          gender: "Male",
          father_wiki_id: "Husband",
          mother_wiki_id: "Wife",
        },
        {
          wiki_id: "Child2",
          name: "Child 2",
          gender: "Female",
          father_wiki_id: "Husband",
          mother_wiki_id: "Wife",
        },
      ];

      const tree = createTestTree(persons, "Husband");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const spouseEdges = Array.from(result.edges.values()).filter((e) => e.type === "spouse");

      expect(spouseEdges.length).toBe(1);
    });

    it("creates edges with correct points", () => {
      const persons: RawPerson[] = [
        { wiki_id: "Parent", name: "Parent", gender: "Male" },
        { wiki_id: "Child", name: "Child", gender: "Male", father_wiki_id: "Parent" },
      ];

      const tree = createTestTree(persons, "Parent");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const edge = Array.from(result.edges.values()).find((e) => e.type === "parent-child")!;

      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      // First point should be at bottom center of parent
      // Last point should be at top center of child
      const parent = result.nodes.get("Parent")!;
      const child = result.nodes.get("Child")!;

      expect(edge.points[0].x).toBe(parent.x + parent.width / 2);
      expect(edge.points[0].y).toBe(parent.y + parent.height);
      expect(edge.points[edge.points.length - 1].x).toBe(child.x + child.width / 2);
      expect(edge.points[edge.points.length - 1].y).toBe(child.y);
    });
  });

  describe("bounds computation", () => {
    it("computes correct bounds for single node", () => {
      const persons: RawPerson[] = [{ wiki_id: "A", name: "Test", gender: "Male" }];

      const tree = createTestTree(persons, "A");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const node = result.nodes.get("A")!;

      expect(result.bounds.minX).toBe(node.x);
      expect(result.bounds.minY).toBe(node.y);
      expect(result.bounds.maxX).toBe(node.x + node.width);
      expect(result.bounds.maxY).toBe(node.y + node.height);
    });

    it("computes correct bounds for multiple nodes", () => {
      const persons: RawPerson[] = [
        { wiki_id: "A", name: "A", gender: "Male" },
        { wiki_id: "B", name: "B", gender: "Female" },
        { wiki_id: "C", name: "C", gender: "Male", father_wiki_id: "A", mother_wiki_id: "B" },
      ];

      const tree = createTestTree(persons, "A");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      // Bounds should encompass all nodes
      for (const node of result.nodes.values()) {
        expect(result.bounds.minX).toBeLessThanOrEqual(node.x);
        expect(result.bounds.minY).toBeLessThanOrEqual(node.y);
        expect(result.bounds.maxX).toBeGreaterThanOrEqual(node.x + node.width);
        expect(result.bounds.maxY).toBeGreaterThanOrEqual(node.y + node.height);
      }
    });
  });

  describe("edge cases", () => {
    it("handles empty tree", () => {
      const tree: TreeState = {
        nodes: new Map(),
        edges: new Map(),
        rootId: "nonexistent",
        bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        generations: new Map(),
      };

      const result = computeLayout(tree, DEFAULT_CONFIG);

      expect(result.nodes.size).toBe(0);
      expect(result.edges.size).toBe(0);
    });

    it("handles disconnected nodes", () => {
      const persons: RawPerson[] = [
        { wiki_id: "A", name: "A", gender: "Male" },
        { wiki_id: "B", name: "B", gender: "Female" },
        // B has no relationship to A
      ];

      const tree = createTestTree(persons, "A");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      // Both nodes should be positioned
      expect(result.nodes.get("A")!.width).toBe(DEFAULT_CONFIG.nodeWidth);
      expect(result.nodes.get("B")!.width).toBe(DEFAULT_CONFIG.nodeWidth);
    });

    it("handles multiple children", () => {
      const persons: RawPerson[] = [
        { wiki_id: "Parent", name: "Parent", gender: "Male" },
        { wiki_id: "Child1", name: "Child 1", gender: "Male", father_wiki_id: "Parent" },
        { wiki_id: "Child2", name: "Child 2", gender: "Female", father_wiki_id: "Parent" },
        { wiki_id: "Child3", name: "Child 3", gender: "Male", father_wiki_id: "Parent" },
      ];

      const tree = createTestTree(persons, "Parent");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const children = ["Child1", "Child2", "Child3"].map((id) => result.nodes.get(id)!);

      // All children should be in generation 1
      for (const child of children) {
        expect(child.y).toBe(DEFAULT_CONFIG.nodeHeight + DEFAULT_CONFIG.verticalGap);
      }

      // Children should not overlap horizontally
      const sortedByX = [...children].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sortedByX.length; i++) {
        expect(sortedByX[i].x).toBeGreaterThanOrEqual(sortedByX[i - 1].x + sortedByX[i - 1].width);
      }
    });
  });

  describe("parent centering", () => {
    it("centers parent above multiple children", () => {
      const persons: RawPerson[] = [
        { wiki_id: "Parent", name: "Parent", gender: "Male" },
        { wiki_id: "C1", name: "Child 1", gender: "Male", father_wiki_id: "Parent" },
        { wiki_id: "C2", name: "Child 2", gender: "Female", father_wiki_id: "Parent" },
        { wiki_id: "C3", name: "Child 3", gender: "Male", father_wiki_id: "Parent" },
      ];

      const tree = createTestTree(persons, "Parent");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const parent = result.nodes.get("Parent")!;
      const children = ["C1", "C2", "C3"].map((id) => result.nodes.get(id)!);

      // Calculate children centroid
      const childCenters = children.map((c) => c.x + c.width / 2);
      const childCentroid = childCenters.reduce((a, b) => a + b, 0) / childCenters.length;

      // Parent center should be at or near child centroid
      const parentCenter = parent.x + parent.width / 2;
      expect(Math.abs(parentCenter - childCentroid)).toBeLessThan(1);
    });

    it("centers spouse pair above their children", () => {
      const persons: RawPerson[] = [
        { wiki_id: "Dad", name: "Dad", gender: "Male" },
        { wiki_id: "Mom", name: "Mom", gender: "Female" },
        {
          wiki_id: "C1",
          name: "Child 1",
          gender: "Male",
          father_wiki_id: "Dad",
          mother_wiki_id: "Mom",
        },
        {
          wiki_id: "C2",
          name: "Child 2",
          gender: "Female",
          father_wiki_id: "Dad",
          mother_wiki_id: "Mom",
        },
      ];

      const tree = createTestTree(persons, "Dad");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      const dad = result.nodes.get("Dad")!;
      const mom = result.nodes.get("Mom")!;
      const children = ["C1", "C2"].map((id) => result.nodes.get(id)!);

      // Calculate children centroid
      const childCenters = children.map((c) => c.x + c.width / 2);
      const childCentroid = childCenters.reduce((a, b) => a + b, 0) / childCenters.length;

      // Parent unit center should be at or near child centroid
      const unitLeft = Math.min(dad.x, mom.x);
      const unitRight = Math.max(dad.x + dad.width, mom.x + mom.width);
      const unitCenter = (unitLeft + unitRight) / 2;
      expect(Math.abs(unitCenter - childCentroid)).toBeLessThan(1);
    });

    it("maintains non-overlapping positions after centering", () => {
      const persons: RawPerson[] = [
        { wiki_id: "P1", name: "Parent 1", gender: "Male" },
        { wiki_id: "P2", name: "Parent 2", gender: "Male" },
        { wiki_id: "C1", name: "Child 1", gender: "Male", father_wiki_id: "P1" },
        { wiki_id: "C2", name: "Child 2", gender: "Female", father_wiki_id: "P2" },
      ];

      const tree = createTestTree(persons, "P1");
      const result = computeLayout(tree, DEFAULT_CONFIG);

      // Get all nodes at generation 0
      const gen0Ids = result.generations.get(0);
      expect(gen0Ids).toBeDefined();

      const gen0Nodes = gen0Ids!.map((id) => result.nodes.get(id)!);
      const sortedByX = gen0Nodes.sort((a, b) => a.x - b.x);

      // No overlaps
      for (let i = 1; i < sortedByX.length; i++) {
        const prev = sortedByX[i - 1];
        const curr = sortedByX[i];
        expect(curr.x).toBeGreaterThanOrEqual(prev.x + prev.width);
      }
    });
  });
});
