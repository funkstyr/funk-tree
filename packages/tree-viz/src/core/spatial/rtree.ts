import RBush from "rbush";
import type { TreeNode, Bounds } from "../data/types";

interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

export class SpatialIndex {
  private tree = new RBush<SpatialItem>();

  load(nodes: TreeNode[]): void {
    this.tree.clear();
    const items = nodes.map((node) => ({
      minX: node.x,
      minY: node.y,
      maxX: node.x + node.width,
      maxY: node.y + node.height,
      id: node.id,
    }));
    this.tree.load(items);
  }

  queryRect(bounds: Bounds): string[] {
    return this.tree
      .search({
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
      })
      .map((item) => item.id);
  }

  queryPoint(x: number, y: number): string | null {
    const results = this.tree.search({
      minX: x,
      minY: y,
      maxX: x,
      maxY: y,
    });
    return results[0]?.id ?? null;
  }

  clear(): void {
    this.tree.clear();
  }
}
