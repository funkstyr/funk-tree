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
    const [id, gen] = queue.shift()!;
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
    if (!groups.has(gen)) groups.set(gen, []);
    groups.get(gen)!.push(node.id);
  }

  return groups;
}

function sortFamiliesInGeneration(nodeIds: string[], nodes: Map<string, TreeNode>): void {
  // Sort by: spouses together, then by number of children (families first)
  nodeIds.sort((a, b) => {
    const nodeA = nodes.get(a)!;
    const nodeB = nodes.get(b)!;

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

    const node = nodes.get(id)!;
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
  // First pass: position all nodes
  positionNodesWithMap(genGroups, nodes, config);

  // TODO: Second pass - center parents above their children
  // This would involve calculating child bounds, parent bounds,
  // and shifting while avoiding overlaps with siblings
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
