import type { TreeState, TreeNode, TreeEdge, Bounds, LayoutConfig, Point } from "../data/types";

export function computeLayout(tree: TreeState, config: LayoutConfig): TreeState {
  const { nodes, rootId } = tree;

  if (nodes.size === 0) {
    return tree;
  }

  // Step 1: Assign generations via BFS
  const generations = assignGenerations(nodes, rootId);

  // Step 2: Group by generation
  const genGroups = groupByGeneration(nodes, generations);

  // Step 3: Sort within generations (families together)
  for (const group of genGroups.values()) {
    sortFamiliesInGeneration(group, nodes);
  }

  // Step 4: Position nodes
  positionNodes(genGroups, config);

  // Step 5: Center children under parents
  centerChildrenUnderParents(genGroups, nodes, config);

  // Step 6: Compute edges
  const edges = computeEdges(nodes);

  // Step 7: Compute bounds
  const bounds = computeBounds(nodes);

  return {
    ...tree,
    edges,
    bounds,
    generations: genGroups,
  };
}

function assignGenerations(nodes: Map<string, TreeNode>, rootId: string): Map<string, number> {
  const generations = new Map<string, number>();
  const queue: [string, number][] = [[rootId, 0]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) continue;
    const [id, gen] = item;
    if (visited.has(id)) continue;
    visited.add(id);

    generations.set(id, gen);
    const node = nodes.get(id);
    if (!node) continue;

    // Spouses same generation
    for (const spouseId of node.spouseIds) {
      if (!visited.has(spouseId)) {
        queue.push([spouseId, gen]);
      }
    }

    // Children next generation
    for (const childId of node.childIds) {
      if (!visited.has(childId)) {
        queue.push([childId, gen + 1]);
      }
    }

    // Parents previous generation
    for (const parentId of node.parentIds) {
      if (!visited.has(parentId)) {
        queue.push([parentId, gen - 1]);
      }
    }
  }

  // Handle disconnected nodes - assign based on their own generation data
  for (const node of nodes.values()) {
    if (!generations.has(node.id)) {
      generations.set(node.id, node.person.generation ?? 0);
    }
  }

  // Normalize to start at 0
  if (generations.size > 0) {
    const minGen = Math.min(...generations.values());
    for (const [id, gen] of generations) {
      generations.set(id, gen - minGen);
    }
  }

  return generations;
}

function groupByGeneration(
  nodes: Map<string, TreeNode>,
  generations: Map<string, number>,
): Map<number, string[]> {
  const groups = new Map<number, string[]>();

  for (const node of nodes.values()) {
    const gen = generations.get(node.id) ?? 0;
    const group = groups.get(gen);
    if (group) {
      group.push(node.id);
    } else {
      groups.set(gen, [node.id]);
    }
  }

  return groups;
}

function sortFamiliesInGeneration(nodeIds: string[], nodes: Map<string, TreeNode>): void {
  // Sort by: spouses together, then by number of children (families first)
  nodeIds.sort((a, b) => {
    const nodeA = nodes.get(a);
    const nodeB = nodes.get(b);

    // Guard against missing nodes
    if (!nodeA || !nodeB) return 0;

    // If A and B are spouses, keep them together
    if (nodeA.spouseIds.includes(b)) return -1;
    if (nodeB.spouseIds.includes(a)) return 1;

    // Sort by number of children (more children = more central)
    const childDiff = nodeB.childIds.length - nodeA.childIds.length;
    if (childDiff !== 0) return childDiff;

    // Alphabetical fallback
    return nodeA.person.name.localeCompare(nodeB.person.name);
  });

  // Group spouses together
  const grouped: string[] = [];
  const processed = new Set<string>();

  for (const id of nodeIds) {
    if (processed.has(id)) continue;

    const node = nodes.get(id);
    if (!node) continue;

    grouped.push(id);
    processed.add(id);

    // Add spouses immediately after
    for (const spouseId of node.spouseIds) {
      if (!processed.has(spouseId) && nodeIds.includes(spouseId)) {
        grouped.push(spouseId);
        processed.add(spouseId);
      }
    }
  }

  // Replace original array contents
  nodeIds.length = 0;
  nodeIds.push(...grouped);
}

function positionNodes(genGroups: Map<number, string[]>, _config: LayoutConfig): void {
  // Get nodes map from a sample
  const allNodeIds = Array.from(genGroups.values()).flat();
  if (allNodeIds.length === 0) return;

  // We need access to nodes - get them via closure in computeLayout
  // For now, we'll just compute x positions based on index
}

function positionNodesWithMap(
  genGroups: Map<number, string[]>,
  nodes: Map<string, TreeNode>,
  config: LayoutConfig,
): void {
  for (const [gen, nodeIds] of genGroups) {
    let x = 0;

    for (let i = 0; i < nodeIds.length; i++) {
      const node = nodes.get(nodeIds[i]);
      if (!node) continue;

      node.x = x;
      node.y = gen * (config.nodeHeight + config.verticalGap);
      node.width = config.nodeWidth;
      node.height = config.nodeHeight;

      // Check if next is spouse
      const nextId = nodeIds[i + 1];
      const isSpouse = nextId && node.spouseIds.includes(nextId);

      x += config.nodeWidth + (isSpouse ? config.spouseGap : config.horizontalGap);
    }
  }
}

function centerChildrenUnderParents(
  genGroups: Map<number, string[]>,
  nodes: Map<string, TreeNode>,
  config: LayoutConfig,
): void {
  // First pass: position all nodes linearly
  positionNodesWithMap(genGroups, nodes, config);

  // Get sorted generation numbers (ascending = ancestors to descendants)
  const generations = Array.from(genGroups.keys()).sort((a, b) => a - b);
  if (generations.length < 2) return;

  // Second pass: bottom-up centering - parents above children's centroid
  // Process from bottom generation upward (skip the last/deepest gen)
  for (let i = generations.length - 2; i >= 0; i--) {
    const gen = generations[i];
    const nodeIds = genGroups.get(gen);
    if (!nodeIds) continue;

    // Group by family unit (spouse pairs)
    const familyUnits = groupIntoFamilyUnits(nodeIds, nodes);

    for (const unit of familyUnits) {
      // Collect all children of this family unit
      const childXPositions: number[] = [];
      for (const parentId of unit) {
        const parent = nodes.get(parentId);
        if (!parent) continue;
        for (const childId of parent.childIds) {
          const child = nodes.get(childId);
          if (child) {
            childXPositions.push(child.x + child.width / 2);
          }
        }
      }

      if (childXPositions.length === 0) continue;

      // Calculate centroid of children
      const childCentroid = childXPositions.reduce((a, b) => a + b, 0) / childXPositions.length;

      // Calculate current center of family unit
      const unitNodes = unit
        .map((id) => nodes.get(id))
        .filter((n): n is TreeNode => n !== undefined);
      if (unitNodes.length === 0) continue;

      const unitLeft = Math.min(...unitNodes.map((n) => n.x));
      const unitRight = Math.max(...unitNodes.map((n) => n.x + n.width));
      const unitCenter = (unitLeft + unitRight) / 2;

      // Shift to center above children
      const shift = childCentroid - unitCenter;
      for (const node of unitNodes) {
        node.x += shift;
      }
    }

    // Third pass: resolve overlaps within this generation
    resolveOverlaps(nodeIds, nodes, config);
  }
}

/** Groups node IDs into family units (spouse pairs stay together) */
function groupIntoFamilyUnits(nodeIds: string[], nodes: Map<string, TreeNode>): string[][] {
  const units: string[][] = [];
  const processed = new Set<string>();

  for (const id of nodeIds) {
    if (processed.has(id)) continue;

    const unit = [id];
    processed.add(id);

    const node = nodes.get(id);
    if (node) {
      for (const spouseId of node.spouseIds) {
        if (!processed.has(spouseId) && nodeIds.includes(spouseId)) {
          unit.push(spouseId);
          processed.add(spouseId);
        }
      }
    }

    units.push(unit);
  }

  return units;
}

/** Resolves overlapping nodes by pushing them apart */
function resolveOverlaps(
  nodeIds: string[],
  nodes: Map<string, TreeNode>,
  config: LayoutConfig,
): void {
  // Sort by x position
  const sortedNodes = nodeIds
    .map((id) => nodes.get(id))
    .filter((n): n is TreeNode => n !== undefined)
    .sort((a, b) => a.x - b.x);

  // Push apart overlapping nodes
  for (let i = 1; i < sortedNodes.length; i++) {
    const prev = sortedNodes[i - 1];
    const curr = sortedNodes[i];

    // Determine gap: smaller for spouses, larger for others
    const isSpouse = prev.spouseIds.includes(curr.id);
    const minGap = isSpouse ? config.spouseGap : config.horizontalGap;

    const requiredX = prev.x + prev.width + minGap;
    if (curr.x < requiredX) {
      curr.x = requiredX;
    }
  }
}

function computeEdges(nodes: Map<string, TreeNode>): Map<string, TreeEdge> {
  const edges = new Map<string, TreeEdge>();

  for (const node of nodes.values()) {
    // Parent-child edges
    for (const childId of node.childIds) {
      const child = nodes.get(childId);
      if (!child) continue;

      const edgeId = `${node.id}->${childId}`;
      if (edges.has(edgeId)) continue;

      edges.set(edgeId, {
        id: edgeId,
        sourceId: node.id,
        targetId: childId,
        type: "parent-child",
        points: computeParentChildPath(node, child),
      });
    }

    // Spouse edges (only create once per pair)
    for (const spouseId of node.spouseIds) {
      const spouse = nodes.get(spouseId);
      if (!spouse) continue;

      // Use consistent ordering to avoid duplicates
      const [id1, id2] = [node.id, spouseId].sort();
      const edgeId = `${id1}<=>${id2}`;
      if (edges.has(edgeId)) continue;

      const [left, right] = node.x < spouse.x ? [node, spouse] : [spouse, node];

      edges.set(edgeId, {
        id: edgeId,
        sourceId: id1,
        targetId: id2,
        type: "spouse",
        points: [
          { x: left.x + left.width, y: left.y + left.height / 2 },
          { x: right.x, y: right.y + right.height / 2 },
        ],
      });
    }
  }

  return edges;
}

function computeParentChildPath(parent: TreeNode, child: TreeNode): Point[] {
  const parentBottomCenter = {
    x: parent.x + parent.width / 2,
    y: parent.y + parent.height,
  };

  const childTopCenter = {
    x: child.x + child.width / 2,
    y: child.y,
  };

  // Add intermediate point for smoother curves
  const midY = (parentBottomCenter.y + childTopCenter.y) / 2;

  return [
    parentBottomCenter,
    { x: parentBottomCenter.x, y: midY },
    { x: childTopCenter.x, y: midY },
    childTopCenter,
  ];
}

function computeBounds(nodes: Map<string, TreeNode>): Bounds {
  if (nodes.size === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes.values()) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  return { minX, minY, maxX, maxY };
}
