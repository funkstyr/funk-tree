export interface Person {
  id: string;
  wikiId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  deathDate?: string;
  birthLocation?: string;
  deathLocation?: string;
  gender: "M" | "F" | "U";
  generation?: number;
}

export interface Relationship {
  type: "parent" | "child" | "spouse";
  sourceId: string;
  targetId: string;
}

export interface TreeNode {
  id: string;
  person: Person;
  // Layout position (world coordinates)
  x: number;
  y: number;
  width: number;
  height: number;
  // Relationships
  parentIds: string[];
  childIds: string[];
  spouseIds: string[];
  // Visual state
  collapsed: boolean;
  selected: boolean;
  highlighted: boolean;
}

export interface TreeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: "parent-child" | "spouse";
  points: Point[];
}

export interface TreeState {
  nodes: Map<string, TreeNode>;
  edges: Map<string, TreeEdge>;
  rootId: string;
  bounds: Bounds;
  generations: Map<number, string[]>;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface LayoutConfig {
  nodeWidth: number;
  nodeHeight: number;
  horizontalGap: number;
  verticalGap: number;
  spouseGap: number;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  nodeWidth: 180,
  nodeHeight: 70,
  horizontalGap: 40,
  verticalGap: 100,
  spouseGap: 20,
};
